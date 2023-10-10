import { agent } from './setup.js'
import { GrantTypes, CredentialRequestJwtVc } from '@sphereon/oid4vci-common'

async function main() {
    const preauth_code = "some_code"
    await create_offer(preauth_code)

    await get_token(preauth_code)

    await issue_credential()
}

async function create_offer(preauth_code: string) {
    //einfach erstmal drinn lassen
    await agent.oid4vciStoreHasMetadata({correlationId:"123",storeId:"_default",namespace:"oid4vci"})
    
    const offer = await agent.oid4vciCreateOfferURI({
        credentialIssuer: "123", 
        storeId: "_default", 
        namespace: "oid4vci", 
        grants: { 'urn:ietf:params:oauth:grant-type:pre-authorized_code': { 'pre-authorized_code': preauth_code, user_pin_required: false}}
    })
    
    console.log(offer) 
}

async function get_token(preauth_code: string){
    const token = await agent.oid4vciCreateAccessTokenResponse({
        request: {
            grant_type: GrantTypes.PRE_AUTHORIZED_CODE,
            "pre-authorized_code": preauth_code
        },
        credentialIssuer: "123",
        expirationDuration: 10000
    })

    console.log(token)
}

async function issue_credential(request: CredentialRequestV1_0_11) {
    agent.oid4vciIssueCredential({
        credentialIssuer: "123",
        credentialRequest: request
    })
}

main().catch(console.log)