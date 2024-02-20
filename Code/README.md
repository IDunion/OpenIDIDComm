# Installation and User Guide

## Pre-conditions
You need to have Node.JS (currently tested on version 18.17.1) and preferably `yarn` installed

## Installation
Simply go into this folder and execute:
```shell
yarn install
```

## Usage

### Issuer
To start the Issuer use the following command with the according solution name (currently only did_spearated is supported):
```shell
yarn ts-node --esm ./issuer_interface_did_separated.ts
```
The programm gives you an interactive interface to use. One first needs to create an Issuer (for example by using the default values), run the created issuer instance, and create an offer. This offer can be used by other Clients (Wallets) to receive Credentials. 

![Issuer Interface](/Code/readme_images/issuer_interface.png)

After a successful issuance, you can send messages via the newly created DIDComm channel.

### Client (Wallet)
To start the Client use the following commaned:
```shell
yarn ts-node --esm ./client_did_separated.ts
```
The programm expects you to enter the previously generated offer (use the url above the QR-code in the Isser-terminal). Afterwards both parties will go through our extended OID4VC flow and the Client will recieve a Credential aswell as having a DIDComm channel now.
Any messages send via DIDComm from the Issuer to the Client will be displayed (currently only messages from Issuer to Client are supported)
