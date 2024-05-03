# OpenIDIDComm

The [OpenID4VCI](https://openid.github.io/OpenID4VCI/openid-4-verifiable-credential-issuance-wg-draft.html) and [OpenID4VP](https://openid.github.io/OpenID4VP/openid-4-verifiable-presentations-wg-draft.html) specifications define protocols for issuance and verification of Verifiable Credentials between Issuer, Wallet, and Verifier extending the commonly used [OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749) protocol. Currently the two OpenID4VCI/VP-Protocols are missing a feature to enable future communication between the involved parties. To add this feature to the OpenID4VCI/VP-Protocols we want to utilize [DIDComm](https://identity.foundation/didcomm-messaging/spec/), a transport agnostic messaging protocol based on Decentralized Identifiers (DIDs). Therefore, the goal of this work is to write an extension for the two OpenID4VCI/VP-Protocols that additionally allows the creation of a DIDComm channel for future communication. This repo should function as a proof of concept. Explicitly, it is no final product.

# Onboarding

To familiarize yourself with the topic, it is worth taking a look at the following sources:

### OpenID4VC

To understand OpenID4VC, it is helpful to first understand OAuth 2.0, which is the basis of our work. A look at the official documentations could help:

- [OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749): OAuth 2.0 is an authorization framework that allows third-party applications to access resources on behalf of a user without sharing credentials. It is widely used in modern web and mobile applications. OAuth 2.0 operates through tokens. Users authorize applications to access their resources via an authentication server. The application uses access tokens to access these resources. If the token expires, a refresh token can be used to obtain a new access token without requiring credentials again. 
    - for a brief overview, just have a look at [OAuth 2.0 simplified](https://aaronparecki.com/oauth-2-simplified/)


Finally, the [OpenID4VC spec](https://openid.net/sg/openid4vc/specifications/) (OpenID for Verifiable Credentials ) is a standard based on OpenID Connect which can be used to issue and use Verifiable Credentials. One can distinguish OID4CVI and OID4VP. For a better overview, the key concepts of OID4VCI and OID4VP are listed below.

#### OID4VCI
[OID4VCI](https://openid.github.io/OpenID4VCI/openid-4-verifiable-credential-issuance-wg-draft.html) is used for the issuance of Verifiable Credentials. It provides an API containing (not only) the following endpoints:

- **Credential Endpoint**: mandatory endpoint, from which credentials are issued
- **Batch Credential Endpoint**: optional endpoint for the issuance of multiple credentials at once
- **Deferred Credential Endpoint**: optional endpoint for the deferred issuance of credentials

A brief description of the OID4VCI workflow shows how the protocol works: For each credential, the Wallet sends one Credential Request to the Credential Endpoint. This request is a POST request specifying the `format`, the `proof`, the `credential_identifier` and `credential_response_encryption` in its body. Each issuance can be further described using the following characteristics:

- **Authorization Code Flow vs. Pre-Authorized Code Flow**:  issuer uses end-user authentication at the Authorization endpoint vs. issuer uses out-of-band mechanisms outside of the flow
- **Same-device vs. Cross-device Credential Offer**: offer is received from the same device the wallet is installed on vs. offer is communicated to wallet 
- **Wallet initiated vs. Issuer initiated**: request is sent to the issuer directly from the wallet vs. request is sent to the issuer after communication with the issuer
- **Immediate vs. Deferred**: credential is directly issued vs. credential is issued after time


#### OID4VP

[OpenID4VP](https://openid.github.io/OpenID4VP/openid-4-verifiable-presentations-wg-draft.html) is used for the presentation of Verifiable Credentials. It extends the OAuth2.0 flow by introducing the so called VP Token as a container which allows users to present their presentations to verifiers via a wallet. One can distinguish different scenarios where the verifier and the user are using the same device (Same-Device-Flow) or using different devices (Cross-Device-Flow):

- **Same-Device-Flow**: Authorization Request und Response are passed with redirects between the user’s wallet and the verifier
- **Cross-Device-Flow**: The Authorization Request of the verifier is rendered as a QR-code which can be scanned by the user using its wallet. 


### DIDComm

The DIDComm Protocol is a messaging protocol based on Decentralized Identifiers (DIDs). It is essential to understand the idea behind DIDs, DID Documents, and DID resolution to know how DIDComm works. The following links provide a good overview over these topics:
- [DIDs](https://norbert-pohlmann.com/glossar-cyber-sicherheit/decentralized-identifiers/)
    - A short summary for the most important functionality of DIDs (on german)
- [DID Specification](https://www.w3.org/TR/did-core/)
    - A basic understanding can be achieved by looking at the [simple Example](https://www.w3.org/TR/did-core/#a-simple-example), the [architecture overview](https://www.w3.org/TR/did-core/#architecture-overview), and diving into the [DID Documents Examples](https://www.w3.org/TR/did-core/#did-documents)
    - To further learn about the meaning of the DID Document propoerties we recommend reading the chapter [core properties](https://www.w3.org/TR/did-core/#core-properties) with a focus on the different verification methods, relationships, and the service propertie
    - When translating DIDs into DID Documents one has to understand the process of [DID Resolution](https://www.w3.org/TR/did-core/#resolution) (Chapter 7.1 without subchapters is enough!). It is very helpful to read about the resolution rules of some DID methods such as [did:peer](https://identity.foundation/peer-did-method-spec/) and [did:web](https://w3c-ccg.github.io/did-method-web/)
- [DIDComm Specification](https://identity.foundation/didcomm-messaging/spec/)
    - After learning how DIDs work and what information is stored inside DID Documents it is fairly straight forward to read the DIDComm Specification

---
# Background
### OAuth2
![Oauth2](/Diagramme/OAuth2/oauth2.png)
### OID4VCI
Auth. Flow

![Auth. Flow](/Diagramme/OID4VCI/oid4vci_auth.png)

Preauth. Flow

![Prauth. Flow](/Diagramme/OID4VCI/oid4vci_preauth.png)

# Requirements

Primary:
- DIDComm channel in addition to OID4VCI/VP for future communication between parties (Holder and Issuer or Holder and Verifier)
- support both flows (authorization and pre-autorization flow)
- Enforce DIDComm channel before VC is issued/verified
- No change of the OID4VCI/VP Specification (but extension with additional parameters possible)

Secondary, optional:
- Ideally same solution for both protocols (OpenID4VCI + OpenID4VP)
- Different DIDs for Credential Issuance and DIDComm

Required Steps:
- DID Discovery (Get DID from at least one party)
- DID resolving to DID Document (with service endpoint)
- Linking DIDComm Channel and OID4VCI/VP flow (How can one know, that both protocols are used in the same context)

# Solutions

Every Solution should describe how it solves the requirements and required steps.  
Furthermore, every solution should evaluate its benefits (i. e. what secondary requirements were met), its limitations (i. e. what secondary requirements were not met), and contain sequence diagrams for visualization.

### DIDComm Token

Another approach uses the OAuth 2.0 inherent concept of [scopes](https://oauth.net/2/scope/). The Access Token `scope` parameter is extended with the `DIDComm` value to express the usage for the DIDComm channel creation. The Wallet then sends a DIDComm Ping containing the Access Token in order to create a session correlation.

![OID4VC Diagram DIDComm Token](/Diagramme/OID4VCI/DIDComm_Token/didcomm_token.png)

## Comparison of the current solutions

The DIDComm Token solution is the currently prefered solution. Others can be found in the [deprecated Versions](/deprecatedVersions.md).

||DID JWT with Deferred Credential Endpoint as fallback (mixed)|Separate DIDComm|DIDComm Token :star:|
|---|---|---|---|
|Support of both flows (Authorization and Pre-Authorized)|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|
|Enforced DIDComm Channel|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|
|Optional DIDComm Channel|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|
|No DIDComm Channel<br/>(plain OpenID4VC)|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|
|DIDComm channel creation|Between Credential Request and Credential Response **OR** after Credential Response (deferral)|After Token Response and before Credential Request|After Token Response and before Credential Request|
|DIDComm Delay/Timeout handling|:heavy_check_mark: - Credential Response (deferral) is sent immediately|:heavy_check_mark: - DIDComm is separate|:heavy_check_mark: - DIDComm is separate|
|DIDComm Initiator|Issuer|Holder|Holder|
|Message modification|Credential Request: Body (Header possible)|Credential Request: Header|Access Token: Scope extended|
|Session correlation|DID JWT in Credential Request +<br>DIDComm Ping with Nonce|DIDComm Ping with Correlation ID +<br>DIDComm Acknowledge and Credential Request with one-time-code|DIDComm Ping with Access Token|


## Further work

To make it possible to execute the various issuance methods without having to commit to a dedicated method before starting the issuer client, it seems conceivable to adapt the issuer design. With the help of extensions for the supported methods (currently DID JWT, DID Separated and DID Token), it should be possible to cover all methods within a single issuer client and handle the requests accordingly depending on their content.
