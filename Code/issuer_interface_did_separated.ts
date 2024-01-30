import prompts from 'prompts'

enum IssuerActions {
    CREATE_OFFER,
    START_DIDCOMM_CHAT,
    QUIT
}

let run = true
while (run) {
    const response = await prompts({
        type: 'select',
        name: 'action',
        message: 'Pick your Action',
        choices: [
            { title: 'Create Offer', value: IssuerActions.CREATE_OFFER },
            { title: 'Start DIDComm chat', value: IssuerActions.START_DIDCOMM_CHAT },
            { title: 'Quit', value: IssuerActions.QUIT }
        ]
    })

    switch (response.action) {
        case IssuerActions.CREATE_OFFER:
            await create_offer()
            break
        case IssuerActions.START_DIDCOMM_CHAT:
            await start_didcomm_chat()
            break
        case IssuerActions.QUIT:
            run = false
    }
}

function create_offer() {
    console.log("Not implemented")
}

async function start_didcomm_chat() {
    while (true) {
        const response = await prompts({
            type: 'text',
            name: 'didcomm_message',
            message: `Enter a message:`
        })
        if (response.didcomm_message == 'quit') {
            return
        }
        console.log("DIDComm: ", response.didcomm_message)
    }
}
