import { agent } from './issuer_agent.js'
import { CredentialRequestJwtVc, AccessTokenRequest, AccessTokenResponse } from '@sphereon/oid4vci-common'
import { ICredential } from '@sphereon/ssi-types'
import express, {Express, Request, Response} from 'express'
import bodyParser from 'body-parser'
import { decodeBase64url } from '@veramo/utils'
import { AuthorizationResponsePayload } from '@sphereon/did-auth-siop'
import { IDIDCommMessage } from '@veramo/did-comm'

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

await agent.didManagerAddService({did: identifier.did, service: { id: "123", type: "DIDCommMessaging", serviceEndpoint: "http://localhost:8080/didcomm"}})

await agent.oid4vciStorePersistIssuerOpts({
    issuerOpts:{didOpts:{identifierOpts:{
        identifier: identifier.did,
        kid: identifier.keys[0].kid,
    }}},
    correlationId: "123"
})


/**********/
/* SERVER */
/**********/
const server: Express = express()

// Simuliert das scannen des QR-Codes. Vorerst nur mit Referenz auf SIOP-Anfrage
server.get("/offer", async (req: Request, res: Response) => {
    console.log("/offer Anfrage\n")
    const req_uri = await agent.siopCreateAuthRequestURI({definitionId: "123", correlationId: "123", redirectURI: "http://localhost:8080/siop", requestByReferenceURI: "http://localhost:8080/request"})
    res.send(req_uri)
})

// Von hier holt sich der Client die eigentlichen SIOP-Anfrage
server.get("/request", async (req:Request, res: Response) => {
    console.log("/request Anfrage\n")
    const request = await agent.siopCreateAuthRequestPayloads({definitionId: "123", correlationId: "123", state: "123", nonce: "123", redirectURI: "http://localhost:8080/siop"})
    res.send(request)
})

// Hier schickt der Client seinen SIOP-ID-Token hin
server.post("/siop", express.urlencoded({extended: true}), async (req: Request, res: Response) => {
    console.log("Verifiziere ID-Token.... ")
    const auth_response = req.body as AuthorizationResponsePayload
    const id_token = await (await agent.siopVerifyAuthResponse({ authorizationResponse: auth_response, correlationId: "123", definitionId: "123" })).authorizationResponse.idToken.payload()
    console.log("ID-Token: ", id_token, "\n")
    
    verify_didcomm_connection(id_token.sub!, id_token.nonce!)
    res.sendStatus(200)
})

// Hier bekommt der Client die OID4VCI Metadaten her
server.get("/.well-known/openid-credential-issuer", async (req: Request, res: Response) => {
    console.log("/metadata Anfrage\n")
    res.send( await agent.oid4vciStoreGetMetadata({correlationId: "123"}) )
})

// Hier bekommt der Client den Token
server.post("/token", express.urlencoded({extended: true}),  async (req: Request, res: Response) => {
    console.log("/token Anfrage:\n",req.body,"\n")
    res.send(await get_token(req.body))
    console.log("Sende Token....")
})

// Hier bekommt der Client das Credential
server.post("/credentials", bodyParser.json(),  async (req: Request, res: Response) => {
    console.log("/credentials Anfrage:\n",req.body,"\n")
    res.send(await issue_credential(req.body))
    console.log("Sende Credential....")
})

// Hier kommt die DidComm Verbindungsbestätigung an
server.post("/didcomm", bodyParser.raw({type: "text/plain"}), async (req: Request, res: Response) => {
    const message = await agent.handleMessage({ raw: req.body.toString() })

    if (message.type == "connection_ack"){
        console.log("DidComm Verbindungsbestätigung erhalten\n")
        const body = message.data! as { nonce:string }
        const preauth_code = Math.random().toString(16).slice(2)
        
        const response: IDIDCommMessage = {
            type: "offer",
            to: message.from!,
            from: identifier.did,
            id: message.id,
            body: { nonce: body.nonce, offer_uri: await create_offer(preauth_code) }
        }

        console.log("Sende OID4VC Offer....\n")
        const packed_msg = await agent.packDIDCommMessage({ message: response, packing: "authcrypt" })
        await agent.sendDIDCommMessage({ messageId: "123", packedMessage: packed_msg, recipientDidUrl: message.from! })
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
async function verify_didcomm_connection(did: string, nonce: string) {
    const document = ( await agent.resolveDid({ didUrl: did }) ).didDocument!

    const message: IDIDCommMessage = {
        type: "connection_test",
        to: document.id,
        from: identifier.did,
        id: "1234",
        body: { nonce: nonce }
    }

    console.log("Sende DidComm Verbindungsanfrage....")
    const packed_msg = await agent.packDIDCommMessage({ message: message, packing: "authcrypt" })
    await agent.sendDIDCommMessage({ messageId: "123", packedMessage: packed_msg, recipientDidUrl: document.id })
}

async function create_offer(preauth_code: string): Promise<string> { 
    const offer = await agent.oid4vciCreateOfferURI({
        credentialIssuer: "123", 
        storeId: "_default", 
        namespace: "oid4vci", 
        grants: { 'urn:ietf:params:oauth:grant-type:pre-authorized_code': { 'pre-authorized_code': preauth_code, user_pin_required: false}}
    })
    
    return offer.uri
}

async function get_token(request: AccessTokenRequest): Promise<AccessTokenResponse>{
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
