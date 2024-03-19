import { OpenID4VCIClient } from '@sphereon/oid4vci-client';
import { AuthzFlowType, Alg, OpenId4VCIVersion, OpenIDResponse, CredentialResponse } from '@sphereon/oid4vci-common'
import { CredentialRequestClientBuilder } from '@sphereon/oid4vci-client';
import { ProofOfPossession } from '@sphereon/oid4vci-common';
import { agent } from '../clientAgent.js'
import fetch from 'node-fetch';
import { mapIdentifierKeysToDoc, decodeBase64url, encodeBase64url } from '@veramo/utils'
import { IDIDCommMessage } from '@veramo/did-comm';
import express, { Express, Request, Response } from 'express'
import bodyParser from 'body-parser'
import { W3CVerifiableCredential } from '@veramo/core';
import { W3cMessageHandler } from '@veramo/credential-w3c';
import * as readline from "readline"
import prompts from 'prompts';

var verbose = false
const red = "\x1b[41m"
const green = "\x1b[42m"
const end = "\x1b[0m"

/*********/
/* SETUP */
/*********/
const identifier = await agent.didManagerGetOrCreate({
  alias: "void1042.github.io:web-did-host:client",
  kms: "local",
  provider: "did:web",
  options: {
    keyType: 'Ed25519'
  }
})

await agent.didManagerAddService({ did: identifier.did, service: { id: "123", type: "DIDCommMessaging", serviceEndpoint: "http://localhost:8081/didcomm" } })

/* Get keyID for "assertionMethod" (Key ID from Veramo-DB and DID-Document are different) */
const local_key_id = (await mapIdentifierKeysToDoc(identifier, "assertionMethod", { agent: agent }))[0].kid
const global_key_id = (await mapIdentifierKeysToDoc(identifier, "assertionMethod", { agent: agent }))[0].meta.verificationMethod.id


/**********/
/* SERVER */
/**********/
const server: Express = express()

var i = 0
/* Hier kommt die kommt die DidComm Verbindungsanfrage an */
server.post("/didcomm", bodyParser.raw({ type: "text/plain" }), async (req: Request, res: Response) => {
  const message = await agent.handleMessage({ raw: req.body.toString() })
  res.sendStatus(202)

  if (message.type == "ping") {
    console.log("> Ping #" + message.id)
    debug(message)
    const response: IDIDCommMessage = {
      type: "pong",
      to: message.from!,
      from: identifier.did,
      id: Math.random().toString().slice(2, 5),
      thid: message.id,
      body: {}
    }

    //if (i == 2) {
      console.log("< Pong")
      const packed_msg = await agent.packDIDCommMessage({ message: response, packing: "authcrypt" })
      agent.sendDIDCommMessage({ messageId: response.id, packedMessage: packed_msg, recipientDidUrl: message.from! })
    //}
    //i++
  }
  else if (message.type == "credential_ready") {
    const transaction_id = (message.data! as { transaction_id: string }).transaction_id
    console.log("\n> Credential Benachrichtigung")
    debug(message)

    // Abholung
    console.log("< Deferred Abfrage")
    const response = await fetch(client.endpointMetadata.credentialIssuerMetadata!.deferred_endpoint, { method: "post", body: JSON.stringify({ transaction_id: transaction_id, c_nonce: c_nonce }), headers: { 'Content-Type': 'application/json' } })
    if (response.ok) {
      const data = await response.json() as { credential: string }
      early_resolve(JSON.parse(decodeBase64url(data.credential.split(".")[1])))
    }
    else {
      const { error } = await response.json() as { error: string }
      if (error != "issuance_pending") early_reject(error)
    }
  }
  else if (message.type == "message") {
    let message_text = (message.data as { message: string }).message
    console.log("\n> Message:", message_text)
  }
  else if (message.type == "opendid4vci-re-offer") {
    const offer = (message.data as any).offer
    console.log("> Received a new offer:", offer)
    await main(offer)
  }
  else if (message.type == "opendid4vci-revocation") {
    console.log(red + "> Credential got revoked" + end)
  }
})

const server_instance = server.listen(8081)


/***************/
/* CLIENT FLOW */
/***************/

var credential: W3CVerifiableCredential | undefined
var early_resolve: (val: W3CVerifiableCredential) => void
var early_reject: (error: any) => void
var client: OpenID4VCIClient
var c_nonce: string

async function main(offer_uri?: string) {
  
  if (!offer_uri) {
    // Scanne QR-Code
    console.log("\n< Scan QR Code")
    //const response = new URL(await (await fetch("http://localhost:8080/offer")).text())
    const response = (await prompts({ type: 'text', name: 'value', message: 'Enter Offer:' })).value as string;
    console.log("> Preauth Code")
    debug(response)

    offer_uri = response
  }

  // Client erstellen
  console.log("\n< Hole Metadaten")
  client = await OpenID4VCIClient.fromURI({
    uri: offer_uri,
    flowType: AuthzFlowType.PRE_AUTHORIZED_CODE_FLOW,
    alg: Alg.EdDSA,
    retrieveServerMetadata: true,
  })
  console.log("> Metadaten")
  debug(JSON.stringify(client.endpointMetadata, null, 2))

  // Token holen
  console.log("\n< Hole Token")
  const token = await client.acquireAccessToken()
  console.log("> Token")

  // JWT-Proof bauen
  const jwt_header = encodeBase64url(JSON.stringify({
    typ: "openid4vci-proof+jwt",
    alg: client.alg,
    kid: global_key_id
  }))

  const jwt_payload = encodeBase64url(JSON.stringify({
    aud: client.getIssuer(),
    iat: Math.floor(Date.now() / 1000),
    nonce: token.c_nonce,
    iss: global_key_id
  }))

  const signature = await agent.keyManagerSign({
    keyRef: local_key_id,
    data: jwt_header + "." + jwt_payload,
    algorithm: client.alg
  })

  const proof: ProofOfPossession = {
    proof_type: "jwt",
    jwt: jwt_header + '.' + jwt_payload + '.' + signature
  }

  // Credential Anfrage
  console.log("\n< Hole Credential")
  const credentialRequestClient = CredentialRequestClientBuilder.fromCredentialOfferRequest({ request: client.credentialOffer, metadata: client.endpointMetadata }).build()
  let credentialRequest = await credentialRequestClient.createCredentialRequest({
    proofInput: proof,
    credentialTypes: ["VerifiableCredential", "UniversityDegreeCredential"],
    format: 'jwt_vc_json',
    version: OpenId4VCIVersion.VER_1_0_11
  })
  Object.defineProperty(credentialRequest, "didcomm_proof", { value: proof, enumerable: true })
  debug(credentialRequest)

  // Antwort entweder Credential oder Deferral
  type DeferredResponse = { transaction_id: string, c_nonce: string }
  const credentialResponse = await credentialRequestClient.acquireCredentialsUsingRequest(credentialRequest) as OpenIDResponse<CredentialResponse | DeferredResponse>

  if (credentialResponse.successBody) {
    if ("transaction_id" in credentialResponse.successBody) {
      var { transaction_id, c_nonce } = credentialResponse.successBody
      console.log("> Deferral #" + transaction_id)
      debug(credentialResponse)

      credential = await new Promise<W3CVerifiableCredential>(async (res, rej) => {
        let stop = false
        early_resolve = (val: W3CVerifiableCredential) => { stop = true; res(val) }
        early_reject = (error: any) => { stop = true; rej(error) }

        await new Promise(r => setTimeout(r, 10000));
        while (!stop) {
          console.log("< Deferral Anfrage")
          const response = await fetch(client.endpointMetadata.credentialIssuerMetadata!.deferred_endpoint, { method: "post", body: JSON.stringify({ transaction_id: transaction_id, c_nonce: c_nonce }), headers: { 'Content-Type': 'application/json' } })
          if (response.ok) {
            const data = await response.json() as { credential: string }
            return res(JSON.parse(decodeBase64url(data.credential.split(".")[1])))
          }
          else {
            const { error } = await response.json() as { error: string }
            if (error != "issuance_pending") return rej(error)
            console.log("> Noch nicht bereit")
          }

          await new Promise(r => setTimeout(r, 10000));
        }
      })
    }
    else {
      credential = JSON.parse(decodeBase64url(credentialResponse.successBody?.credential?.split(".")[1]))
    }
    console.log(green, "> Credential erhalten:", end, "\n\n", credential)

    await prompts({
      type: "text",
      name: "_",
      message: "press Enter to quit"
    })
  }
  else {
    console.log(red, "> Credential Error: ", end, credentialResponse.errorBody)
    return
  }
}

await main()

// close Server
server_instance.close()

function debug(message: any) {
  if (verbose == true) console.debug(message)
}