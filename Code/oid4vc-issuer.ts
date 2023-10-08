import { agent } from './setup.js'

async function main() {
    create_offer()
}

async function create_offer() {
    //einfach erstmal drinn lassen
    console.log(await agent.oid4vciStoreHasMetadata({correlationId:"123",storeId:"_default",namespace:"oid4vci"}))
    
    const offer = await agent.oid4vciCreateOfferURI({
        credentialIssuer:"123", 
        storeId:"_default", 
        namespace:"oid4vci", 
        grants: { 'urn:ietf:params:oauth:grant-type:pre-authorized_code': { 'pre-authorized_code': "some_code", user_pin_required: false}}
    })
    
    console.log(offer) 
}

main().catch(console.log)