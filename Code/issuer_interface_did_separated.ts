import prompts from 'prompts'
import { agent } from './issuer_agent.js'
import { Issuer } from './issuer_did_separated.js'
import { IDIDCommMessage } from '@veramo/did-comm'
import qr from "qrcode-terminal"

enum IssuerActions {
    CREATE_ISSUER,
    RUN_ISSUER,
    CREATE_OFFER,
    SEND_DIDCOMM_MESSAGE,
    QUIT
};
var current_store_id = 0
var issuers: Record<string,Issuer> = {}

main();

async function main(){
    while (true) {
        const response = await prompts({
            type: 'select',
            name: 'action',
            message: 'Pick your Action',
            choices: [
                { title: 'Create Issuer', value: IssuerActions.CREATE_ISSUER },
                { title: 'Run Issuer', value: IssuerActions.RUN_ISSUER },
                { title: 'Create Offer', value: IssuerActions.CREATE_OFFER },
                { title: 'Send a DIDComm Message', value: IssuerActions.SEND_DIDCOMM_MESSAGE },
                { title: 'Quit', value: IssuerActions.QUIT }
            ]
        })

        switch (response.action) {
            case IssuerActions.CREATE_ISSUER:
                await create_issuer()
                break
            case IssuerActions.RUN_ISSUER:
                await run_issuer()
                break
            case IssuerActions.CREATE_OFFER:
                await create_offer("123")
                break
            case IssuerActions.SEND_DIDCOMM_MESSAGE:
                await send_didcomm_message()
                break
            case IssuerActions.QUIT:
                return
        }
    }
}

async function create_issuer() {
    const did = (await prompts({ type: 'text', name: 'value', message: 'Enter DID:', initial: "did:web:void1042.github.io:web-did-host:issuer" })).value as string;
    const base_url = (await prompts({ type: 'text', name: 'value', message: 'Enter Base URL:', initial: "http://localhost:8080" })).value as string;
    const store_id = String(current_store_id++)

    issuers[did] = await Issuer.build( did, store_id, base_url )
}

async function run_issuer() {
    const choices = Object.entries(issuers).map( ([did,issuer]) => ({ title: did, value: did }) )

    const did = (await prompts({
        type: 'select',
        name: 'value',
        message: 'Pick an Issuer:',
        choices: choices
    })).value as string
    
    issuers[did].start_server()
}

async function create_offer( preauth_code: string) {
    const choices = Object.entries(issuers).map( ([did,issuer]) => ({ title: did, value: did }) )

    const did = (await prompts({
        type: 'select',
        name: 'value',
        message: 'Pick an Issuer:',
        choices: choices
    })).value as string

    const offer = await agent.oid4vciCreateOfferURI({
        credentialIssuer: issuers[did].store_id,
        storeId: "_default",
        namespace: "oid4vci",
        grants: { 'urn:ietf:params:oauth:grant-type:pre-authorized_code': { 'pre-authorized_code': preauth_code, user_pin_required: false } }
    })

    console.log("Offer:", offer.uri)
    qr.generate(offer.uri, { small: true })
}

async function send_didcomm_message() {
    var choices = Object.entries(issuers).map( ([did,issuer]) => ({ title: did, value: did }) )

    const issuer_did = (await prompts({
        type: 'select',
        name: 'value',
        message: 'Pick an Issuer:',
        choices: choices
    })).value as string

    choices = Object.entries(issuers[issuer_did].confirmed_connections).map( ([connection_id,{did,confirmed_at}]) => ({ title: did, value: did }))

    const client_did = (await prompts({
        type: 'select',
        name: 'value',
        message: 'Pick a Client:',
        choices: choices
    })).value as string

    const text = (await prompts({
        type: 'text',
        name: 'message',
        message: `Enter a message:`
    })).message

    if (text == 'quit') return

    const message: IDIDCommMessage = {
        type: "message",
        to: client_did,
        from: issuer_did,
        id: Math.random().toString().slice(2, 5),
        body: { message: text }
    }

    const packed_msg = await agent.packDIDCommMessage({ message: message, packing: "authcrypt" })
    await agent.sendDIDCommMessage({ messageId: message.id, packedMessage: packed_msg, recipientDidUrl: message.to })
}
