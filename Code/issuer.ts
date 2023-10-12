import { agent } from './setup.js'
import { CredentialRequestJwtVc, AccessTokenRequest, AccessTokenResponse } from '@sphereon/oid4vci-common'
import { ICredential } from '@sphereon/ssi-types'
import express, {Express, Request, Response, response} from 'express'
import bodyParser from 'body-parser'

async function main() {
    await agent.oid4vciStoreHasMetadata({correlationId:"123",storeId:"_default",namespace:"oid4vci"})
    console.log(await agent.didManagerGetByAlias({alias:"test", provider:"did:key"}))
    const preauth_code = "code" //Math.random().toString(16).slice(2)
    console.log(await create_offer(preauth_code))
    
    const server: Express = express()

    server.get("/.well-known/openid-credential-issuer", async (req: Request, res: Response) => {
        const metadata = await agent.oid4vciStoreGetMetadata({correlationId: "123"})
        console.log(metadata)
        res.send(metadata)
    })

    server.post("/token", express.urlencoded({extended: true}),  async (req: Request, res: Response) => {
        console.log(req.body)
        const token = await get_token(req.body)
        res.send(token)
    })

    server.post("/credentials", bodyParser.json(),  async (req: Request, res: Response) => {
        console.log(req.body)
        const credential = await issue_credential(req.body)
        res.send(credential)
    })

    server.listen(8080, () => {
        console.log("listening")
    })
}

async function create_offer(preauth_code: string) { 
    const offer = await agent.oid4vciCreateOfferURI({
        credentialIssuer: "123", 
        storeId: "_default", 
        namespace: "oid4vci", 
        grants: { 'urn:ietf:params:oauth:grant-type:pre-authorized_code': { 'pre-authorized_code': preauth_code, user_pin_required: false}}
    })
    
    console.log(offer) 
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
    const credential: ICredential = {
        '@context': "context",
        type: ["UniversityDegreeCredential"],
        issuer: "did:peer:2.Ez6LShYp2GaGEuY7KXhDAGjnLXBuXAQzUVXajcP2BEwtdhM5M.Vz6MkuD7yymgiY9UALBTMQCdX15xRnJqi8JWhQ3aoVUcJVFDc.SeyJpZCI6Im1lZGlhdG9yIiwidCI6ImRtIiwicyI6ImRpZDp4OnNvbWVtZWRpYXRvciJ9",
        issuanceDate: (Date.now() / 1000).toString(),
        credentialSubject: {
            id: "did:key:z6Mkn6DopPWt3ziFfXDMeHEHXDnrmWwrrbaNEwpbR5RvQHB2",
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