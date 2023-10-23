import { agent } from './issuer_agent.js'
import { CredentialRequestJwtVc, AccessTokenRequest, AccessTokenResponse } from '@sphereon/oid4vci-common'
import { ICredential } from '@sphereon/ssi-types'
import express, {Express, Request, Response} from 'express'
import bodyParser from 'body-parser'
import { decodeBase64url } from '@veramo/utils'

/* Create issuer DID */
const identifier = await agent.didManagerGetOrCreate({
    alias: "issuer",
    kms: "local",
    provider: "did:peer",
    options: {num_algo: 2, service: {
        id: "123",
        type: "DIDCommMessaging",
        serviceEndpoint: "http://localhost:8080/didcomm"
    }}
})

await agent.oid4vciStorePersistIssuerOpts({
    issuerOpts:{didOpts:{identifierOpts:{
        identifier: identifier.did,
        kid: identifier.keys.find(x => x.type == "Ed25519")!.kid,
    }}},
    correlationId: "123"
})

async function main() {    
    const server: Express = express()
    
    server.get("/offer", async (req: Request, res: Response) => {
        const preauth_code = Math.random().toString(16).slice(2)
        console.log("> Offer requested. Pre-auth code: ",preauth_code,"\n\n")
        res.send(await create_offer(preauth_code))
    })

    server.get("/.well-known/openid-credential-issuer", async (req: Request, res: Response) => {
        console.log("> Metadata requested\n\n")
        res.send( await agent.oid4vciStoreGetMetadata({correlationId: "123"}) )
    })

    server.post("/token", express.urlencoded({extended: true}),  async (req: Request, res: Response) => {
        console.log("> Token requested:\n",req.body,"\n")
        res.send(await get_token(req.body))
    })

    server.post("/credentials", bodyParser.json(),  async (req: Request, res: Response) => {
        console.log("> Credential requested:\n",req.body,"\n")
        res.send(await issue_credential(req.body))
    })

    server.listen(8080, () => {
        console.log("Server listening on port 8080\n\n")
    })
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

main().catch(console.log)