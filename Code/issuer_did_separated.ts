import { agent, resolvers } from './issuer_agent.js'
import { CredentialRequestJwtVc, AccessTokenRequest, AccessTokenResponse, ProofOfPossession, CredentialResponse, CredentialIssuerMetadata, CredentialSupported } from '@sphereon/oid4vci-common'
import { ICredential } from '@sphereon/ssi-types'
import express, { Express, Request, Response } from 'express'
import bodyParser from 'body-parser'
import { decodeBase64url } from '@veramo/utils'
import { IDIDCommMessage, TrustPingMessageHandler } from '@veramo/did-comm'
import { verifyJWT } from 'did-jwt'
import { Credential } from '@veramo/data-store'
import * as readline from "readline"

//terminal farben
var verbose = false
const red = "\x1b[41m"
const green = "\x1b[42m"
const end = "\x1b[0m"

var confirmed_connections: Record<string, { did: string, confirmed_at: number }> = {};
var defered_creds: Record<string, { status: string, credential?: CredentialResponse }> = {};

/*********/
/* SETUP */
/*********/
const identifier = await agent.didManagerGetOrCreate({
    alias: "void1042.github.io:web-did-host:issuer",
    kms: "local",
    provider: "did:web",
    options: {
        keyType: 'Ed25519'
    }
})

await agent.didManagerAddService({ did: identifier.did, service: { id: "123", type: "DIDCommMessaging", serviceEndpoint: "http://localhost:8080/didcomm" } })

await agent.oid4vciStorePersistIssuerOpts({
    issuerOpts: {
        didOpts: {
            identifierOpts: {
                identifier: identifier.did,
                kid: identifier.keys[0].kid,
            }
        }
    },
    correlationId: "123"
})


/**********/
/* SERVER */
/**********/
const server: Express = express()

// Simuliert das scannen des QR-Codes. Vorerst nur mit Referenz auf SIOP-Anfrage
server.get("/offer", async (req: Request, res: Response) => {
    console.log("\n> QR Code scan")
    const preauth_code = Math.random().toString(16).slice(2)
    const req_uri = await create_offer(preauth_code)
    res.send(req_uri)
    console.log("< Offer")
    debug(req_uri)
})

// Hier bekommt der Client die OID4VCI Metadaten her
server.get("/.well-known/openid-credential-issuer", async (req: Request, res: Response) => {
    console.log("\n> Metadaten Anfrage")
    const metadata = await agent.oid4vciStoreGetMetadata({ correlationId: "123" })
    res.send(metadata)
    console.log("< Metadaten")
    debug(metadata)
})

// Hier bekommt der Client den Token
server.post("/token", express.urlencoded({ extended: true }), async (req: Request, res: Response) => {
    console.log("\n> Token Anfrage")
    debug(req.body)
    const token = await get_token(req.body)
    res.send(token)
    console.log("< Token")
    debug(token)
})

// Hier bekommt der Client das Credential
server.post("/credentials", bodyParser.json(), async (req: Request, res: Response) => {
    console.log("\n> Credential Anfrage")
    debug(req.body)

    // Prüfe DidComm Verbindung
    const supported = (await agent.oid4vciStoreGetMetadata({ correlationId: "123" }))?.credentials_supported[0] as CredentialSupported & { didcommRequired: string }
    const connection_id = req.body.connection_id as string

    if (supported.didcommRequired == "Required") {
        if (connection_id === undefined || !confirmed_connections[connection_id]) {
            res.status(400).json({ error: "didcomm_unconfirmed" })
            console.log(red + "< DidComm unbestätigt" + end)
            return
        }
        else if ((Date.now() - confirmed_connections[connection_id].confirmed_at) / 1000 > 60) {
            res.status(400).json({ error: "didcomm_expired" })
            console.log(red + "< DidComm abgelaufen" + end)
            return
        }
    }

    var confirmed_did: string | undefined
    if (supported.didcommRequired == "Required") confirmed_did = confirmed_connections[connection_id].did

    // Automatischer deferral nach 3s
    let deferal: { "transaction_id": string, "c_nonce": string } | undefined
    const timeout = setTimeout(() => {
        deferal = {
            "transaction_id": String(Math.random().toString(16).slice(2)),
            "c_nonce": String(Math.random().toString(16).slice(2))
        }
        defered_creds[deferal.transaction_id] = { status: "PENDING", credential: undefined }
        res.send(deferal)
        console.log("< Deferral")
        debug(deferal)
    }, 3000)

    // Erstelle Credential und DidComm Verbindung parallel. Reagiere abhängig von Timeout
    try {
        var credential = await issue_credential(req.body)
        clearTimeout(timeout)
    }
    catch (e) {
        clearTimeout(timeout)

        if (deferal === undefined) {
            if ((e as Error).message == "Didcomm timeout") {
                res.status(400).json({ error: "didcomm_unreachable" })
                console.log(red, "< DidComm Fehler", end)
            }
            else {
                res.sendStatus(500)
                console.log(red, "< Interner Fehler", end)
            }
        }
        else defered_creds[deferal.transaction_id].status = "FAILED"

        return
    }

    if (deferal === undefined) {
        res.send(credential)
        console.log(green, "< Credential", end)
        debug(credential)
    }
    else {
        defered_creds[deferal.transaction_id].status = "READY"
        defered_creds[deferal.transaction_id].credential = credential
        if (confirmed_did) await send_didcomm_msg(confirmed_did, identifier.did, "credential_ready", { transaction_id: deferal.transaction_id })
        console.log("\n< Credential bereit")
    }

    if (confirmed_did) {
        let rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        const answer = await new Promise(resolve => {
            rl.question("Message: ", resolve)
        })

        const message: IDIDCommMessage = {
            type: "message",
            to: confirmed_did,
            from: identifier.did,
            id: Math.random().toString().slice(2, 5),
            body: { message: answer }
        }

        const packed_msg = await agent.packDIDCommMessage({ message: message, packing: "authcrypt" })
        await agent.sendDIDCommMessage({ messageId: message.id, packedMessage: packed_msg, recipientDidUrl: message.to })
        rl.close()
    }
})

// Hier kommt die DidComm Verbindungsbestätigung an
server.post("/didcomm", bodyParser.raw({ type: "text/plain" }), async (req: Request, res: Response) => {
    const message = await agent.handleMessage({ raw: req.body.toString() })

    if (message.type == "register") {
        res.sendStatus(202)

        console.log("\n> Register DidComm")
        const connection_id = String(Math.random().toString(16).slice(2))
        confirmed_connections[connection_id] = { did: message.from!, confirmed_at: Date.now() }
        send_didcomm_msg(message.from!, identifier.did, "ack_registration", { connection_id: connection_id }, message.id)
        console.log("< Connection ID #" + connection_id + "\n")
    }
    else {
        console.log("\n> Unbekannte DidComm Nachricht")
        res.sendStatus(404)
    }
})

server.listen(8080, () => {
    console.log("Server listening on port 8080\n")
})



/***********/
/* UTILITY */
/***********/

async function create_offer(preauth_code: string): Promise<string> {
    const offer = await agent.oid4vciCreateOfferURI({
        credentialIssuer: "123",
        storeId: "_default",
        namespace: "oid4vci",
        grants: { 'urn:ietf:params:oauth:grant-type:pre-authorized_code': { 'pre-authorized_code': preauth_code, user_pin_required: false } }
    })

    return offer.uri
}

async function get_token(request: AccessTokenRequest): Promise<AccessTokenResponse> {
    const response = await agent.oid4vciCreateAccessTokenResponse({
        request: request,
        credentialIssuer: "123",
        expirationDuration: 100000
    })

    return response
}

async function issue_credential(request: CredentialRequestJwtVc) {
    const subject = JSON.parse(decodeBase64url(request.proof!.jwt.split(".")[1])).did

    const credential: ICredential = {
        '@context': "https://somecontext.com",
        type: request.types,
        issuer: identifier.did,
        issuanceDate: (Math.floor(Date.now() / 1000)).toString(),
        credentialSubject: {
            id: subject,
            smth: "something about subject"
        }
    }

    const response = await agent.oid4vciIssueCredential({
        credential: credential,
        credentialIssuer: "123",
        credentialRequest: {
            format: 'jwt_vc_json',
            proof: request.proof,
            types: request.types
        }
    })

    return response
}

async function send_didcomm_msg(to: string, from: string, type: string, body: Object, thid?: string): Promise<string> {
    const message: IDIDCommMessage = {
        type: type,
        to: to,
        from: from,
        id: Math.random().toString().slice(2, 5),
        ...(thid !== undefined) && { thid: thid },
        body: body
    }

    const packed_msg = await agent.packDIDCommMessage({ message: message, packing: "authcrypt" })
    await agent.sendDIDCommMessage({ messageId: message.id, packedMessage: packed_msg, recipientDidUrl: message.to })

    return message.id
}

function debug(message: any) {
    if (verbose == true) console.debug(message)
}