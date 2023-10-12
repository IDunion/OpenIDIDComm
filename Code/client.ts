import { OpenID4VCIClient} from '@sphereon/oid4vci-client';
import { AuthzFlowType, Alg } from '@sphereon/oid4vci-common'
import { CredentialRequestClientBuilder } from '@sphereon/oid4vci-client';
import { ProofOfPossession } from '@sphereon/oid4vci-common';
import { agent } from './setup.js'
import base64url from 'base64url';

const offer_url = 'openid-credential-offer://?credential_offer=%7B%22grants%22%3A%7B%22urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code%22%3A%7B%22pre-authorized_code%22%3A%22code%22%2C%22user_pin_required%22%3Afalse%7D%7D%2C%22credential_issuer%22%3A%22http%3A%2F%2Flocalhost%3A8080%22%2C%22credentials%22%3A%5B%7B%22format%22%3A%22jwt_vc_json%22%2C%22types%22%3A%5B%22VerifiableCredential%22%2C%22UniversityDegreeCredential%22%5D%7D%5D%7D'
const client = await OpenID4VCIClient.fromURI({
    uri: offer_url,
    flowType: AuthzFlowType.PRE_AUTHORIZED_CODE_FLOW, // The flow to use
    kid: 'did:key:z6Mkn6DopPWt3ziFfXDMeHEHXDnrmWwrrbaNEwpbR5RvQHB2#z6Mkn6DopPWt3ziFfXDMeHEHXDnrmWwrrbaNEwpbR5RvQHB2', // Our DID.  You can defer this also to when the acquireCredential method is called
    alg: Alg.ES256, // The signing Algorithm we will use. You can defer this also to when the acquireCredential method is called
    clientId: "did:key:z6Mkn6DopPWt3ziFfXDMeHEHXDnrmWwrrbaNEwpbR5RvQHB2#z6Mkn6DopPWt3ziFfXDMeHEHXDnrmWwrrbaNEwpbR5RvQHB2", // The clientId if the Authrozation Service requires it.  If a clientId is needed you can defer this also to when the acquireAccessToken method is called
    retrieveServerMetadata: true, // Already retrieve the server metadata. Can also be done afterwards by invoking a method yourself.
  })

console.log(client.getIssuer())
console.log(client.getCredentialEndpoint())
console.log(client.getAccessTokenEndpoint())

const token = await client.acquireAccessToken()
console.log(token)

const header = base64url(JSON.stringify({
  typ: "openid4vci-proof+jwt",
  alg: "EdDSA",
  kid: "did:key:z6Mkn6DopPWt3ziFfXDMeHEHXDnrmWwrrbaNEwpbR5RvQHB2#z6Mkn6DopPWt3ziFfXDMeHEHXDnrmWwrrbaNEwpbR5RvQHB2"
}))

const body = base64url(JSON.stringify({
  aud: "http://localhost:8080",
  iat: Date.now() / 1000,
  nonce: token.c_nonce,
  iss: client.clientId
}))

const signature = await agent.keyManagerSign({
  keyRef: "7179c4bc8c7bf4389f21e19da2159c1e3cd9ce3bc85f47e34e3bea5413fa166d",
  data: header+"."+body,
  algorithm: "EdDSA"
})

const proof: ProofOfPossession = {
  proof_type: "jwt",
  jwt: header +'.'+ body +'.'+ signature
}

const credentialRequestClient = CredentialRequestClientBuilder.fromCredentialOfferRequest({request: client.credentialOffer, metadata: client.endpointMetadata}).build()
const credentialResponse = await credentialRequestClient.acquireCredentialsUsingProof({
  proofInput: proof,
  credentialTypes: "UniversityDegreeCredential", // Needs to match a type from the Initiate Issance Request!
  format: 'jwt_vc_json', // Allows us to override the format
});
console.log(credentialResponse)

const credential = JSON.parse(base64url.decode(credentialResponse.successBody?.credential?.split(".")[1]))
console.log(credential)