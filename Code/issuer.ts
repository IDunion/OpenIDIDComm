import { agent, resolvers } from './issuer_agent.js'
import { CredentialRequestJwtVc, AccessTokenRequest, AccessTokenResponse, ProofOfPossession, CredentialResponse } from '@sphereon/oid4vci-common'
import { ICredential } from '@sphereon/ssi-types'
import express, { Express, Request, Response } from 'express'
import bodyParser from 'body-parser'
import { decodeBase64url } from '@veramo/utils'
import { IDIDCommMessage } from '@veramo/did-comm'
import { verifyJWT } from 'did-jwt'
import { Credential } from '@veramo/data-store'

//terminal farben
const red = "\x1b[41m"
const green = "\x1b[42m"
const end = "\x1b[0m"

var pending_pings: Record<string, {acknowledge: (value:unknown) => void}> = {};
var defered_creds: Record<string, {status: string, credential?: CredentialResponse}> = {};

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
    console.log("/offer Anfrage\n")
    const preauth_code = Math.random().toString(16).slice(2)
    const req_uri = await create_offer(preauth_code)
    res.send(req_uri)
})

// Hier bekommt der Client die OID4VCI Metadaten her
server.get("/.well-known/openid-credential-issuer", async (req: Request, res: Response) => {
    console.log("/metadata Anfrage\n")
    res.send(await agent.oid4vciStoreGetMetadata({ correlationId: "123" }))
})

// Hier bekommt der Client den Token
server.post("/token", express.urlencoded({ extended: true }), async (req: Request, res: Response) => {
    console.log("/token Anfrage:\n", req.body, "\n")
    res.send(await get_token(req.body))
    console.log("Sende Token....")
})

// Hier bekommt der Client das Credential
server.post("/credentials", bodyParser.json(), async (req: Request, res: Response) => {
    console.log("/credentials Anfrage:\n", req.body, "\n")

    // Prüfe DidComm Proof
    const didcomm_proof = req.body.didcomm_proof as ProofOfPossession
    try { 
        var verification_result = await verifyJWT(didcomm_proof.jwt, { resolver: resolvers, audience: "http://localhost:8080" })
        var rcpt_did = verification_result.didResolutionResult.didDocument!.id
        var nonce = verification_result.payload.nonce
    }
    catch (e) { 
        console.error(red+"DidComm proof ungültig:"+end+"\n", e)
        res.status(400).json({error: "invalid_proof"})
        return
    }

    // Automatischer deferral nach 3s
    let deferal: {"transaction_id":string, "c_nonce":string} | undefined
    const timeout = setTimeout( () => {
        console.error(red+"POST Timeout erreicht. Verschiebe zu 'deferred' Endpunkt..."+end+"\n")
        deferal = {
            "transaction_id": String(Math.random().toString(16).slice(2)),
            "c_nonce": String(Math.random().toString(16).slice(2))
        }
        defered_creds[deferal.transaction_id] = {status: "PENDING", credential:undefined}
        res.send(deferal)
    },3000)

    // Erstelle Credential und DidComm Verbindung parallel. Reagiere abhängig von Timeout
    try { 
        var [credential, didcomm_succesfull] = await Promise.all([ issue_credential(req.body), establish_didcomm_connection(rcpt_did, nonce) ])
        clearTimeout(timeout)
    }
    catch (e){
        clearTimeout(timeout)
        console.error(red+"DidComm Verbindung oder Credentialgenerierung fehlgeschlagen: "+end,e)

        if (deferal === undefined) {
            if ((e as Error).message == "Didcomm timeout") res.status(400).json({ error: "didcomm_unreachable"})
            else res.sendStatus(500)
        }
        else defered_creds[deferal.transaction_id].status = "FAILED"

        return
    }
    
    console.log(green,"DidComm und Credentialgenerierung erfolgreich. Timeout: ", deferal !== undefined,end)
    if (deferal === undefined) res.send(credential)
    else {
        defered_creds[deferal.transaction_id].status = "READY"
        defered_creds[deferal.transaction_id].credential = credential
        await send_didcomm_msg(rcpt_did, identifier.did, "credential_ready", {transaction_id: deferal.transaction_id})
    }
})

// Hier kommt die DidComm Verbindungsbestätigung an
server.post("/didcomm", bodyParser.raw({ type: "text/plain" }), async (req: Request, res: Response) => {
    const message = await agent.handleMessage({ raw: req.body.toString() })

    if (message.type == "pong") {
        if (pending_pings[message.threadId!]){
            console.log("Pong erhalten: {id:" + message.id + ", thid:" + message.threadId + "}, Ausstehende Pings: " + Object.keys(pending_pings))
            pending_pings[message.threadId!].acknowledge("")
            delete pending_pings[message.threadId!]
        }
        else console.log("Abgelaufenen Pong erhalten: {id:" + message.id + ", thid:" + message.threadId + "}")
        res.sendStatus(200)
    }
    else {
        res.sendStatus(404)
    }
})

// Hier kommen die deferred Statusanfragen an
server.post("/deferred", bodyParser.json(), async (req: Request, res: Response) => {
    const body = req.body as {transaction_id:string, c_nonce:string}
    console.log("\n< Deferral Anfrage: ",body)

    if (defered_creds[body.transaction_id]){
        switch (defered_creds[body.transaction_id].status){
            case "READY":
                console.log("> Credential bereit")
                res.send(defered_creds[body.transaction_id].credential!)
                break
            case "FAILED":
                console.log("> Credential fehlgeschlagen")
                res.status(400).json({error: "didcomm_unreachable"})
                break
            case "PENDING":
                console.log("> Credential noch nicht bereit")
                res.status(400).json({error: "issuance_pending"})
        }
    }
    else {
        console.log("> Credential nicht gefunden")
        res.status(400).json({error: "invalid_transaction_id"})
    }
})

server.listen(8080, () => {
    console.log("Server listening on port 8080\n\n")
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

async function establish_didcomm_connection(to:string, nonce:string){
    // Versucht 3x den Empfänger zu erreichen
    
    for (let i = 0; i < 3; i++){
        console.log("Versuch ",String(i),": Sende DidComm Ping zu '"+ to +"'....")

        var message_id = await send_didcomm_msg(to, identifier.did, "ping", { nonce:nonce })

        // Promise mit Timeout von 2+i Sekunde und globaler acknowledge-Funktion
        var timeoutID: NodeJS.Timeout
        var pending_ping = new Promise((resolve, reject) => {
            timeoutID = setTimeout(reject, 2000+(i*1000));
            pending_pings[message_id] = { acknowledge: () => {clearTimeout(timeoutID); resolve("")} };
        })

        try {
            await pending_ping
            break
        }
        catch{
            console.log("Timeout")
            if (i == 2) throw Error("Didcomm timeout")
        }
    }

    return true
}

async function send_didcomm_msg( to:string, from:string, type:string, body:Object ):Promise<string> {
    const message: IDIDCommMessage = {
        type: type,
        to: to,
        from: from,
        id: Math.random().toString().slice(2, 5),
        body: body
    }

    const packed_msg = await agent.packDIDCommMessage({ message: message, packing: "authcrypt" })
    await agent.sendDIDCommMessage({ messageId: message.id, packedMessage: packed_msg, recipientDidUrl: message.to })

    return message.id
}