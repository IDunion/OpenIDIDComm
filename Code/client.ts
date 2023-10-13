import { OpenID4VCIClient} from '@sphereon/oid4vci-client';
import { AuthzFlowType, Alg } from '@sphereon/oid4vci-common'
import { CredentialRequestClientBuilder } from '@sphereon/oid4vci-client';
import { ProofOfPossession } from '@sphereon/oid4vci-common';
import { agent } from './setup.js'
import fetch from 'node-fetch';
import { mapIdentifierKeysToDoc, decodeBase64url, encodeBase64url } from '@veramo/utils'
import base64url from 'base64url';


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


const offer_url = await (await fetch("http://localhost:8080/offer")).text()
console.log("Offer:\n", decodeURI(offer_url))

const client = await OpenID4VCIClient.fromURI({
    uri: offer_url,
    flowType: AuthzFlowType.PRE_AUTHORIZED_CODE_FLOW, // The flow to use
    //kid: 'did:key:z6Mkn6DopPWt3ziFfXDMeHEHXDnrmWwrrbaNEwpbR5RvQHB2#z6Mkn6DopPWt3ziFfXDMeHEHXDnrmWwrrbaNEwpbR5RvQHB2', // Our DID.  You can defer this also to when the acquireCredential method is called
    alg: Alg.EdDSA, // The signing Algorithm we will use. You can defer this also to when the acquireCredential method is called
    //clientId: "did:key:z6Mkn6DopPWt3ziFfXDMeHEHXDnrmWwrrbaNEwpbR5RvQHB2", // The clientId if the Authrozation Service requires it.  If a clientId is needed you can defer this also to when the acquireAccessToken method is called
    retrieveServerMetadata: true, // Already retrieve the server metadata. Can also be done afterwards by invoking a method yourself.
  })

const token = await client.acquireAccessToken()
console.log("Token:\n",token)

/* Build Proof JWT */
const jwt_header = base64url(JSON.stringify({
  typ: "openid4vci-proof+jwt",
  alg: client.alg,
  //kid: "did:key:z6Mkn6DopPWt3ziFfXDMeHEHXDnrmWwrrbaNEwpbR5RvQHB2#z6Mkn6DopPWt3ziFfXDMeHEHXDnrmWwrrbaNEwpbR5RvQHB2"
  kid: global_key_id
}))

const jwt_payload = base64url(JSON.stringify({
  aud: client.getIssuer(),
  iat: Date.now() / 1000,
  nonce: token.c_nonce,
  iss: identifier.did
}))

const signature = await agent.keyManagerSign({
  //keyRef: "7179c4bc8c7bf4389f21e19da2159c1e3cd9ce3bc85f47e34e3bea5413fa166d",
  keyRef: local_key_id,
  data: jwt_header+"."+jwt_payload,
  algorithm: client.alg
})

console.log(global_key_id)
console.log(local_key_id)
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