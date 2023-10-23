import { OpenID4VCIClient} from '@sphereon/oid4vci-client';
import { AuthzFlowType, Alg } from '@sphereon/oid4vci-common'
import { CredentialRequestClientBuilder } from '@sphereon/oid4vci-client';
import { ProofOfPossession } from '@sphereon/oid4vci-common';
import { agent } from './client_agent.js'
import fetch from 'node-fetch';
import { mapIdentifierKeysToDoc, decodeBase64url, encodeBase64url } from '@veramo/utils'
import { IDIDCommMessage } from '@veramo/did-comm';

/* Create client DID */
const identifier = await agent.didManagerGetOrCreate({
  alias: "client",
  kms: "local",
  provider: "did:peer",
  options: {num_algo: 2, service: {
    id: "123",
    type: "DIDCommMessaging",
    serviceEndpoint: "http://localhost:8080/didcomm",
    routingKeys: ["did:example:somemediator#somekey"]
  }}
})

/* Get keyID for "assertionMethod" (Key ID from Veramo-DB and DID-Document are different) */
const local_key_id = (await mapIdentifierKeysToDoc(identifier, "assertionMethod", {agent:agent}))[0].kid
const global_key_id = (await mapIdentifierKeysToDoc(identifier, "assertionMethod", {agent:agent}))[0].meta.verificationMethod.id

/* DIDcomm */
const recipient = "did:peer:2.Ez6LSdsdGTFFpLKu9ntiCHKKmNP7BZPK8pQhesJ7VWFt4GFy8.Vz6MkhmWRbuvYrjVXG7ubbnmkva2nnErEdXfW7CtydQDyaDwJ.SeyJpZCI6IjEyMyIsInQiOiJkbSIsInMiOiJodHRwOi8vbG9jYWxob3N0OjgwODAvZGlkY29tbSJ9"
const rcpt_keyagreement = "did:peer:2.Ez6LSdsdGTFFpLKu9ntiCHKKmNP7BZPK8pQhesJ7VWFt4GFy8.Vz6MkhmWRbuvYrjVXG7ubbnmkva2nnErEdXfW7CtydQDyaDwJ.SeyJpZCI6IjEyMyIsInQiOiJkbSIsInMiOiJodHRwOi8vbG9jYWxob3N0OjgwODAvZGlkY29tbSJ9#6LSdsdGTFFpLKu9ntiCHKKmNP7BZPK8pQhesJ7VWFt4GFy8"
const message: IDIDCommMessage = {
  type: "abc",
  to: recipient,
  from: identifier.did,
  id: "1234",
  body: {
    message: "test message"
  }
}

const packed_msg = await agent.packDIDCommMessage({ message: message, packing: "authcrypt", keyRef: rcpt_keyagreement })
await agent.sendDIDCommMessage({ messageId: "123", packedMessage: packed_msg, recipientDidUrl: recipient })

const offer_url = await (await fetch("http://localhost:8080/offer")).text()
console.log("Offer:\n", decodeURI(offer_url))

const client = await OpenID4VCIClient.fromURI({
    uri: offer_url,
    flowType: AuthzFlowType.PRE_AUTHORIZED_CODE_FLOW,
    alg: Alg.EdDSA,
    retrieveServerMetadata: true,
  })

const token = await client.acquireAccessToken()
console.log("Token:\n",token)

/* Build Proof JWT */
const jwt_header = encodeBase64url(JSON.stringify({
  typ: "openid4vci-proof+jwt",
  alg: client.alg,
  kid: global_key_id
}))

const jwt_payload = encodeBase64url(JSON.stringify({
  aud: [client.getIssuer()],
  iat: Math.floor(Date.now() / 1000),
  nonce: token.c_nonce,
  iss: global_key_id
}))

const signature = await agent.keyManagerSign({
  keyRef: local_key_id,
  data: jwt_header+"."+jwt_payload,
  algorithm: client.alg
})

const proof: ProofOfPossession = {
  proof_type: "jwt",
  jwt: jwt_header +'.'+ jwt_payload +'.'+ signature
}
console.log("Proof:\n",proof)

const credentialRequestClient = CredentialRequestClientBuilder.fromCredentialOfferRequest({request: client.credentialOffer, metadata: client.endpointMetadata}).build()
const credentialResponse = await credentialRequestClient.acquireCredentialsUsingProof({
  proofInput: proof,
  credentialTypes: ["VerifiableCredential","UniversityDegreeCredential"],
  format: 'jwt_vc_json',
});

const credential = JSON.parse(decodeBase64url(credentialResponse.successBody?.credential?.split(".")[1]))
console.log("Credential:\n",credential)
console.log("(Error: ",credentialResponse.errorBody,")")