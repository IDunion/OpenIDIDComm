import { AccessTokenClient, OpenID4VCIClient } from '@sphereon/oid4vci-client';
import { AuthzFlowType, Alg, OpenId4VCIVersion, OpenIDResponse, CredentialResponse } from '@sphereon/oid4vci-common'
import { CredentialRequestClientBuilder } from '@sphereon/oid4vci-client';
import { ProofOfPossession } from '@sphereon/oid4vci-common';
import { agent } from './clientAgent.js'
import fetch from 'node-fetch';
import { mapIdentifierKeysToDoc, decodeBase64url, encodeBase64url } from '@veramo/utils'
import { IDIDCommMessage } from '@veramo/did-comm';
import express, { Express, Request, Response } from 'express'
import bodyParser from 'body-parser'
import { W3CVerifiableCredential } from '@veramo/core';
import { W3cMessageHandler } from '@veramo/credential-w3c';
import * as readline from "readline"
import prompts from 'prompts'

var verbose = false
const red = "\x1b[41m"
const green = "\x1b[42m"
const yellow = "\x1b[43m"
const end = "\x1b[0m"

/*********/
/* SETUP */
/*********/
const identifier = await agent.didManagerGetOrCreate({
  alias: "raw.githubusercontent.com:IDunion:OpenIDIDComm:main:DID_Documents:Client",
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

/* DidComm Endpoint */
server.post("/didcomm", bodyParser.raw({ type: "text/plain" }), async (req: Request, res: Response) => {
  const message = await agent.handleMessage({ raw: req.body.toString() })
  res.sendStatus(202)

  if (message.type == "https://didcomm.org/oidassociate/1.0/acknowledge_token") {
    debug(message)
    console.log(">[DidComm] Presentation Successful\n")

    if (outstanding_registrations[message.threadId!]) {
      outstanding_registrations[message.threadId!].acknowledge()
    }
  }
  else if (message.type == "https://didcomm.org/oidassociate/1.0/reject_token"){
    debug(message)
    const reason = (message.data! as {oidtoken:string,reason:string}).reason
    console.log(red+">[DidComm] Presentation failed. Reason: "+reason+end+"\n")
  }
  else if (message.type == "message") {
    let message_text = (message.data as { message: string }).message
    console.log("\n>[DidComm]", message_text)
  }
  else if (message.type == "credential_ready") {
    const transaction_id = (message.data! as { transaction_id: string }).transaction_id
    console.log("\n> Credential Ready")
    debug(message)

    // Abholung
    console.log("< Deferred Request")
    const response = await fetch("http://localhost:8080/deferred", { method: "post", body: JSON.stringify({ transaction_id: transaction_id, c_nonce: c_nonce }), headers: { 'Content-Type': 'application/json' } })
    if (response.ok) {
      const data = await response.json() as { credential: string }
      early_resolve(JSON.parse(decodeBase64url(data.credential.split(".")[1])))
    }
    else {
      const { error } = await response.json() as { error: string }
      if (error != "issuance_pending") early_reject(error)
    }
  }
  else if (message.type == "opendid4vci-re-offer") {
    const offer = (message.data as any).offer
    console.log(">[DidComm] Received a new offer:", offer)
    await main(offer)
  }
  else if (message.type == "opendid4vci-revocation") {
    console.log(red + ">[DidComm] Credential got revoked" + end)
  }
})

const server_instance = server.listen(8081)


/***************/
/* CLIENT FLOW */
/***************/

var outstanding_registrations: Record<string, { acknowledge: () => void }> = {}
var credential: W3CVerifiableCredential | undefined
var early_resolve: (val: W3CVerifiableCredential) => void
var early_reject: (error: any) => void
var c_nonce: string

async function main(offer_uri?: string) {

  if (!offer_uri) {
    // Scan QR-Code (theoretically)
    console.log("\n< Scan QR Code")
    //const response = new URL(await (await fetch("http://localhost:8080/offer")).text())
    const response = (await prompts({ type: 'text', name: 'value', message: 'Enter Offer:' })).value as string;
    console.log("> Preauth Code")
    debug(response)

    offer_uri = response
  }

  // Create Client 
  console.log("\n< Request Metadata")
  const client = await OpenID4VCIClient.fromURI({
    uri: offer_uri,
    flowType: AuthzFlowType.PRE_AUTHORIZED_CODE_FLOW,
    alg: Alg.EdDSA,
    retrieveServerMetadata: true,
  })
  const didcomm_required = (client.endpointMetadata.credentialIssuerMetadata?.credentials_supported as any[])[0].didcommRequired
  if (didcomm_required == "Required") console.log("> Metadata: DidComm " + red + didcomm_required + end)
  else console.log("> Metadata: DidComm " + green + didcomm_required + end)
  debug(JSON.stringify(client.endpointMetadata, null, 2))

  // Request Token
  console.log("\n< Request Token")

  const accessTokenClient = new AccessTokenClient();
  const response = await accessTokenClient.acquireAccessToken({ credentialOffer: client.credentialOffer, metadata: client.endpointMetadata });
  const token = response.successBody! ?? {}
  debug(token)

  console.log("> Token: '"+token.access_token.slice(0,7)+"'. Scope: ["+token.scope+"]")

  // Build Proof of Possession
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

  // Present Token over DidComm
  await new Promise<string>(async (res, rej) => {
    const timeoutID = setTimeout(rej, 4000)

    const msg_id = await send_didcomm_msg(client.endpointMetadata.credentialIssuerMetadata!.did, identifier.did, "https://didcomm.org/oidassociate/1.0/present_token", { access_token: token.access_token })
    outstanding_registrations[msg_id] = { acknowledge: () => { clearTimeout(timeoutID); res("") } }
    console.log("\n<[DidComm] Present Token: '"+token.access_token.slice(0,7)+"'")
  }).catch(e => { 
    console.error(red + 'DIDComm Connection failed, aborting OID4VCI flow...' + end)
    return
  })


  // Request Credential
  console.log("\n< Request Credential. Access Token: '"+token.access_token.slice(0,7)+"'")
  const credentialRequestClient = CredentialRequestClientBuilder.fromCredentialOfferRequest({ request: client.credentialOffer, metadata: client.endpointMetadata }).withTokenFromResponse(token).build()
  let credentialRequest = await credentialRequestClient.createCredentialRequest({
    proofInput: proof,
    credentialTypes: ["VerifiableCredential", "UniversityDegreeCredential"],
    format: 'jwt_vc_json',
    version: OpenId4VCIVersion.VER_1_0_11
  })
  debug(credentialRequest)

  // Response is either Credential or Deferral
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

        while (!stop) {
          console.log("< Deferral Request")
          const response = await fetch("http://localhost:8080/deferred", { method: "post", body: JSON.stringify({ transaction_id: transaction_id, c_nonce: c_nonce }), headers: { 'Content-Type': 'application/json' } })
          if (response.ok) {
            const data = await response.json() as { credential: string }
            return res(JSON.parse(decodeBase64url(data.credential.split(".")[1])))
          }
          else {
            const { error } = await response.json() as { error: string }
            if (error != "issuance_pending") return rej(error)
            console.log("> Not ready yet")
          }

          await new Promise(r => setTimeout(r, 10000));
        }
      })
    }
    else {
      credential = JSON.parse(decodeBase64url(credentialResponse.successBody?.credential?.split(".")[1]))
    }
    console.log(green + "> Credential:", end, "\n", credential)

    await prompts({
      type: "text",
      name: "_",
      message: "press Enter to quit"
    })
  }
  else console.log(red + "> Credential Error: ", end, credentialResponse.errorBody)
}

await main()

// close Server
server_instance.close()

/***********/
/* UTILITY */
/***********/

function debug(message: any) {
  if (verbose == true) console.debug(message)
}

async function send_didcomm_msg(to: string, from: string, type: string, body: Object, thid?: string): Promise<string> {
  const message: IDIDCommMessage = {
    type: type,
    to: to,
    from: from,
    id: Math.random().toString().slice(2, 5),
    ...(thid !== undefined) && { thid: thid },
    body: body
  }

  const packed_msg = await agent.packDIDCommMessage({ message: message, packing: "authcrypt" })
  await agent.sendDIDCommMessage({ messageId: message.id, packedMessage: packed_msg, recipientDidUrl: message.to })

  return message.id
}
