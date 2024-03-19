import prompts from 'prompts'
import { agent } from './issuerAgent.js'
//import { IssuerDidSeparated } from './archive/issuerDidSeparated.js'
import { IssuerDidToken } from './issuerDidToken.js'
import { IDIDCommMessage } from '@veramo/did-comm'
import qr from "qrcode-terminal"
import { IIssuer } from './issuerInterface.js'
//import { IssuerDidJwt } from './archive/issuerDidJwt.js'

enum IssuerActions {
    CREATE_ISSUER,
    RUN_ISSUER,
    CREATE_OFFER,
    SEND_DIDCOMM_MESSAGE,
    QUIT
};

/*enum IssuerTypes {
    DID_TOKEN,
    DID_SEPARATED,
    DID_JWT
}*/

var current_store_id = 0
var issuers: Record<string, IIssuer> = {}

main();

async function main() {
    while (true) {
        const response = await prompts({
            type: 'select',
            name: 'action',
            message: 'Pick your Action',
            choices: [
                { title: 'Create Issuer', value: IssuerActions.CREATE_ISSUER },
                { title: 'Run Issuer', value: IssuerActions.RUN_ISSUER },
                { title: 'Create Offer', value: IssuerActions.CREATE_OFFER },
                { title: 'Start a DIDComm Chat', value: IssuerActions.SEND_DIDCOMM_MESSAGE },
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
                await start_didcomm_chat()
                break
            case IssuerActions.QUIT:
                Object.values(issuers).forEach((issuer) => issuer.stop_server())
                return
        }
    }
}

async function create_issuer() {
    const did = (await prompts({ type: 'text', name: 'value', message: 'Enter DID:', initial: "did:web:raw.githubusercontent.com:IDunion:OpenIDIDComm:main:DID_Documents:Issuer" })).value as string;
    const base_url = (await prompts({ type: 'text', name: 'value', message: 'Enter Base URL:', initial: "http://localhost:8080" })).value as string;
    const store_id = String(current_store_id++)

    issuers[did] = await IssuerDidToken.build(did, store_id, base_url)
    /*const response = await prompts({
        type: 'select',
        name: 'issuerType',
        message: 'Select the Issuer Type',
        choices: [
            { title: 'DID JWT', value: IssuerTypes.DID_JWT },
            { title: 'DID Separated', value: IssuerTypes.DID_SEPARATED },
            { title: 'DID Token', value: IssuerTypes.DID_TOKEN }
        ]
    })

    switch (response.issuerType) {
        case IssuerTypes.DID_JWT:
            issuers[did] = await IssuerDidJwt.build(did, store_id, base_url)
            break;
        case IssuerTypes.DID_SEPARATED:
            issuers[did] = await IssuerDidSeparated.build(did, store_id, base_url)
            break
        case IssuerTypes.DID_TOKEN:
            issuers[did] = await IssuerDidToken.build(did, store_id, base_url)
            break
    }*/
}

async function run_issuer() {
    const choices = Object.entries(issuers).map(([did, issuer]) => ({ title: did, value: did }))

    const did = (await prompts({
        type: 'select',
        name: 'value',
        message: 'Pick an Issuer:',
        choices: choices
    })).value as string

    issuers[did].start_server()
}

async function create_offer(preauth_code: string) {
    const choices = Object.entries(issuers).map(([did, issuer]) => ({ title: did, value: did }))

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
    //qr.generate(offer.uri, { small: true })
}

async function start_didcomm_chat() {
    var choices = Object.entries(issuers).map(([did, issuer]) => ({ title: did, value: did }))

    const issuer_did = (await prompts({
        type: 'select',
        name: 'value',
        message: 'Pick an Issuer:',
        choices: choices
    })).value as string

    choices = Object.entries(issuers[issuer_did].confirmed_connections).map(([connection_id, { did, confirmed_at }]) => ({ title: did, value: did }))

    const client_did = (await prompts({
        type: 'select',
        name: 'value',
        message: 'Pick a Client:',
        choices: choices
    })).value as string

    // DIDComm chat with selected Client and Issuer
    const iss = issuers[issuer_did]

    while (true) {
        const text = (await prompts({
            type: 'text',
            name: 'message',
            message: `Enter a message:`
        })).message as string

        if (text.startsWith('/')) {
            // Its a command
            switch (text) {
                case '/quit':
                case '/q':
                    return
                case '/help':
                    print_help_dialog()
                    break
                case '/re-offer':
                    // Send invitation to re-offer the credential
                    iss.send_didcomm_msg(client_did, issuer_did, 'opendid4vci-re-offer', { offer: await iss.create_offer("456") })
                    break
                case '/revoke':
                    iss.send_didcomm_msg(client_did, issuer_did, 'opendid4vci-revocation', { message: 'Hello my friend, you got scammed' })
                    break
                default:
                    console.error('Unknown command')
                    break
            }
        }
        else {
            // Normal Message
            iss.send_didcomm_msg(client_did, issuer_did, 'message', { message: text })
        }
    }
}

function print_help_dialog() {
    console.log(
        '/help      shows this help dialog\n' +
        '/q /quit   exit to menu\n' +
        '/re-offer  send a new offer to the client\n' +
        '/revoke    notify the client about a revoked credential\n'
    )
}
