# Installation and User Guide

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
The programm gives you an interactive interface to use. One first needs to create an Issuer (for example by using the default values) whith the ability to chose between different issuer-types, run the created issuer instance, and create an offer. This offer can be used by other Clients (Wallets) to receive Credentials. 

![Issuer Interface](/Code/readmeImages/issuerCliActions.png)

After a successful issuance, you can send messages via the newly created DIDComm channel.

### Client (Wallet)
To start the Client use the following command (with the file name of the prefered solution):
```shell
npx tsx ./clientDidToken.ts
```
The programm expects you to enter the previously generated offer (use the url above the QR-code in the Issuer-terminal). Afterwards both parties will go through our extended OID4VC flow and the Client will recieve a Credential as well as having a DIDComm channel now.
Any messages send via DIDComm from the Issuer to the Client will be displayed (currently only messages from Issuer to Client are supported)
