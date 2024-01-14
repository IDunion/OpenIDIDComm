import { OpenID4VCIClient} from '@sphereon/oid4vci-client';
import { AuthzFlowType, Alg, OpenId4VCIVersion } from '@sphereon/oid4vci-common'
import { CredentialRequestClientBuilder } from '@sphereon/oid4vci-client';
import { ProofOfPossession } from '@sphereon/oid4vci-common';
import { agent } from './verifier_agent.js'
import fetch from 'node-fetch';
import { mapIdentifierKeysToDoc, decodeBase64url, encodeBase64url } from '@veramo/utils'
import { IDIDCommMessage } from '@veramo/did-comm';
import express, {Express, Request, Response} from 'express'
import bodyParser from 'body-parser'

/*********/
/* SETUP */
/*********/
const identifier = await agent.didManagerGetOrCreate({
    alias: "void1042.github.io:web-did-host:verifier",
    kms: "local",
    provider: "did:web",
    options: {
        keyType: 'Ed25519'
    }
})

await agent.didManagerAddService({did: identifier.did, service: { id: "123", type: "DIDCommMessaging", serviceEndpoint: "http://localhost:8082/didcomm"}})

/**********/
/* SERVER */
/**********/
const server: Express = express()

/* Hier kommt die kommt die DidComm Verbindungsanfrage an */
server.post("/didcomm", bodyParser.raw({type: "text/plain"}), async (req: Request, res: Response) => {
  const message = await agent.handleMessage({raw: req.body.toString()})

  if (message.type == "ping"){
    console.log("DidComm Ping erhalten: {id:"+message.id+", thid:"+message.threadId+", data:"+JSON.stringify(message.data)+"}")
    const response: IDIDCommMessage = {
      type: "pong",
      to: message.from!,
      from: identifier.did,
      id: Math.random().toString().slice(2,5),
      thid: message.id,
      body: {}
    }
    
    console.log("Sende Pong....")
    const packed_msg = await agent.packDIDCommMessage({ message: response, packing: "authcrypt"})
    agent.sendDIDCommMessage({ messageId: "123", packedMessage: packed_msg, recipientDidUrl: message.from! })
    res.sendStatus(200)
  }
  else {
    res.sendStatus(404)
  }
})
server.listen(8082, () => {
  console.log("Server listening on port 8082\n\n")
})


agent.siopCreateAuthRequestURI()