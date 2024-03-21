# Installation and User Guide

## Background
The implementation uses a Veramo agent. [Veramo](https://veramo.io) is a JavaScript framework which allows the work with Verifiable Data such as Verifiable Credentials or DIDs. Natively supported DID Methods are did:ethr, did:web and did:key. Veramo is a modular framework which means functionality can be added via plugins such as the [Sphereon OID4VC](https://github.com/Sphereon-Opensource/OID4VCI) or the [DIDComm plugin](https://www.npmjs.com/package/@veramo/did-comm). These two plugins are used in the implementation. The DIDComm plugin implements DIDComm v2 so that the agent can use the protocol for exchanging DIDComm messages. Sphereon implements a VCI client and a VCI issuer on top of the OID4VCI protocol.

## Pre-conditions
You need to have Node.JS (currently tested on version 18.17.1)

## Installation
Simply go into this folder and execute:
```shell
npm install
```

## Usage

### Issuer
To start the Issuer use the following command and confirm the installation of tsx if not already done:
```shell
npx tsx ./issuerCli.ts
```
The programm gives you an interactive interface to use. 
![Issuer Interface](/Code/readmeImages/issuerCliActions.png)

One first needs to create and run the default Issuer. 
![Run](/Code/readmeImages/start_issuer.png)

Then you can generate an Out-of-Band Offer-URL.
![Offer](/Code/readmeImages/offer.png)

Finally, after a credential was successfully issued, a DidComm chat can be started with a chosen client.
![Chat](/Code/readmeImages/chat.png)

### Client (Wallet)
To start the Client use the following command (with the file name of the prefered solution):
```shell
npx tsx ./clientDidToken.ts
```
The programm expects you to enter the previously generated offer-url. Afterwards both parties will go through our extended OID4VC flow and the Client will receive a Credential as well as having a DIDComm channel now.
Any messages send via DIDComm from the Issuer to the Client will be displayed (currently only messages from Issuer to Client are supported)
