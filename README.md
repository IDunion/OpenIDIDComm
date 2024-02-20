# OpenIDIDComm

The [OpenID4VCI](https://openid.github.io/OpenID4VCI/openid-4-verifiable-credential-issuance-wg-draft.html) and [OpenID4VP](https://openid.github.io/OpenID4VP/openid-4-verifiable-presentations-wg-draft.html) specifications define protocols for issuance and verification of Verifiable Credentials between Issuer, Wallet, and Verifier extending the commonly used [OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749) protocol. Currently the two OpenID4VCI/VP-Protocols are missing a feature to enable future communication between the involved parties. To add this feature to the OpenID4VCI/VP-Protocols we want to utilize [DIDComm](https://identity.foundation/didcomm-messaging/spec/), a transport agnostic messaging protocol based on Decentralized Identifiers (DIDs). Therefore, the goal of this work is to write an extension for the two OpenID4VCI/VP-Protocols that additionally allows the creation of a DIDComm channel for future communication.

# Onboarding

To familiarize yourself with the topic, it is worth taking a look at the following sources:

### OpenID4VC

To understand OpenID4VC, it is helpful to first understand OAuth and OpenID Connect. A look at the official documentations could help:

- [OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749) 
    - for a brief overview, just have a look at [OAuth 2.0 simplified](https://aaronparecki.com/oauth-2-simplified/)
- [OpenID Connect](https://openid.net/developers/how-connect-works/)

Finally, the [OpenID4VC spec](https://openid.net/sg/openid4vc/specifications/) defines subtleties in relation to verifiable credentials:
- [OpenID4VCI](https://openid.github.io/OpenID4VCI/openid-4-verifiable-credential-issuance-wg-draft.html)
- [OpenID4VP](https://openid.github.io/OpenID4VP/openid-4-verifiable-presentations-wg-draft.html)

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
Furthermore, every solution should evaluate its benefits (i. e. what secondary requirements were met) and limitations (i. e. what secondary requirements were not met).  
And contain sequence diagrams for visualization.

### DID JWT

This solution utilizes "JSON Web Tokens" to pass a DID in the credential request and at the same time proving possession of the key material.

Required:
- Solution established additional DIDComm channel
- Solution supports both flows
- Solution enforces DIDComm channel
- Solution doesn't modify existing OID specs

Optional:
- Solution supports usage of different DIDs

![OID4VC Diagram](/Diagramme/OID4VCI/DID_Proof/did_proof.png)

In order to prevent timeout related problems it is possible to use the [Deferred Credential Endpoint](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#name-deferred-credential-endpoint) preferred as a fallback solution.

![OID4VC Diagram](/Diagramme/OID4VCI/DID_Proof/did_proof_deferred.png)


These solutions could also be applied to OID4VP.

![OID4VC Diagram](/Diagramme/OID4VP/DID_Proof/vp_did_proof.png)

### Separate DIDComm

It is also possible to create a separate DIDComm connection parallel to the usual (pre-)authorized flow. This solution uses one-time-codes or pseudorandom numbers in order to synchronize the DIDComm Connection.

![OID4VC Diagram](/Diagramme/OID4VCI/DIDComm_Separated/didcomm_separated.png)

### DIDComm Token

Another approach uses the OAuth 2.0 inherent concept of [scopes](https://oauth.net/2/scope/). The Access Token `scope` parameter is extended with the `DIDComm` value to express the usage for the DIDComm channel creation. The Wallet then sends a DIDComm Ping containing the Access Token in order to create a session correlation.

![OID4VC Diagram DIDComm Token](/Diagramme/OID4VCI/DIDComm_Token/didcomm_token.png)

## Comparison of the current solutions

||DID JWT<br/>(without Deferred Credential Endpoint)|DID JWT with Deferred Credential Endpoint|DID JWT with Deferred Credential Endpoint as fallback (mixed)|Separate DIDComm|DIDComm Token|
|---|---|---|---|---|---|
|Support of both flows (Authorization and Pre-Authorized)|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|
|Enforced DIDComm Channel|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|
|Optional DIDComm Channel|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|
|No DIDComm Channel<br/>(plain OpenID4VC)|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|
|DIDComm channel creation|Between Credential Request and Credential Response|After Credential Response (deferral)|Between Credential Request and Credential Response **OR** after Credential Response (deferral)|After Token Response and before Credential Request|After Token Response and before Credential Request|
|DIDComm Delay/Timeout handling|:x: - delay Credential Response or abort with Credential Response Error|:heavy_check_mark: - Credential Response (deferral) is sent immediately|:heavy_check_mark: - Credential Response (deferral) is sent immediately|:heavy_check_mark: - DIDComm is separate|:heavy_check_mark: - DIDComm is separate|
|DIDComm Initiator|Issuer|Issuer|Issuer|Holder|Holder|
|Message modification|Credential Request: Body (Header possible)|Credential Request: Body (Header possible)|Credential Request: Body (Header possible)|Credential Request: Header|Access Token: Scope extended|
|Session correlation|DID JWT in Credential Request +<br>DIDComm Ping with Nonce|DID JWT in Credential Request +<br>DIDComm Ping with Nonce|DID JWT in Credential Request +<br>DIDComm Ping with Nonce|DIDComm Ping with Correlation ID +<br>DIDComm Acknowledge and Credential Request with one-time-code|DIDComm Ping with Access Token|
