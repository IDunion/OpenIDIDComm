import { agent, resolvers } from './issuer_agent.js'
import { CredentialRequestJwtVc, AccessTokenRequest, AccessTokenResponse, ProofOfPossession } from '@sphereon/oid4vci-common'
import { ICredential } from '@sphereon/ssi-types'
import express, { Express, Request, Response } from 'express'
import bodyParser from 'body-parser'
import { decodeBase64url } from '@veramo/utils'
import { IDIDCommMessage } from '@veramo/did-comm'
import { verifyJWT } from 'did-jwt'

var pending_pings: Record<string, (value: unknown) => void> = {};

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

    const didcomm_proof = req.body.didcomm_proof as ProofOfPossession
    const verification_result = await verifyJWT(didcomm_proof.jwt, { resolver: resolvers, audience: "http://localhost:8080" })

    const message: IDIDCommMessage = {
        type: "ping",
        to: verification_result.didResolutionResult.didDocument!.id,
        from: identifier.did,
        id: Math.random().toString().slice(2, 5),
        body: { nonce: verification_result.payload.nonce }
    }

    console.log("Sende DidComm Ping zu " + verification_result.didResolutionResult.didDocument!.id + "....")

    const packed_msg = await agent.packDIDCommMessage({ message: message, packing: "authcrypt" })
    await agent.sendDIDCommMessage({ messageId: "123", packedMessage: packed_msg, recipientDidUrl: message.to })

    const promise = new Promise(function (resolve, reject) {
        pending_pings[message.id] = resolve;
        setTimeout(() => {
            reject("timeout");
        }, 5000);
    })

    try {
        await promise
    }
    catch {
        console.log("DIDComm Timeout")
        res.status(400).json({ "error": "didcomm_timeout" })
    }

    console.log("Sende Credential....")
    res.send(await issue_credential(req.body))

})

// Hier kommt die DidComm Verbindungsbestätigung an
server.post("/didcomm", bodyParser.raw({ type: "text/plain" }), async (req: Request, res: Response) => {
    const message = await agent.handleMessage({ raw: req.body.toString() })

    if (message.type == "pong") {
        console.log("Pong erhalten: {id:" + message.id + ", thid:" + message.threadId + "}")
        console.log("Ausstehende Pings: " + Object.keys(pending_pings))
        pending_pings[message.threadId!]("x")
        delete pending_pings[message.threadId!]
        res.sendStatus(200)
    }
    else {
        res.sendStatus(404)
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
