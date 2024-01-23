# Openidcomm

[[_TOC_]]
# Onboarding

To familiarize yourself with the topic, it is worth taking a look at the following sources:

### OpenID4VC

To understand OpenID4VC, it is helpful to first understand OAuth and OpenID Connect. A look at the official documentations could help:

- [OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749) 
    - for a brief overview, just have a brief look at [OAuth 2.0 simplified](https://aaronparecki.com/oauth-2-simplified/)
- [OpenID Connect](https://openid.net/developers/how-connect-works/)

Finally, the OpenID4VC spec defines subtleties in relation to verifiable credentials:
- [OpenID4VC](https://openid.github.io/OpenID4VCI/openid-4-verifiable-credential-issuance-wg-draft.html)


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

### SIOP

This solution utilizes "Self Issued Identity Providers" (SIOP) to pass the Wallet's DID to the Issuer.

Required:
- Solution established additional DIDComm channel
- Solution supports both flows
- Solution enforces DIDComm channel
- Solution doesn't modify existing OID specs

Optional:
- Solution supports usage of different DIDs

![OID4VC Diagram](/Diagramme/OID4VCI/SIOP/siop.png)

### DID JWT

This solutions utilizes "JSON Web Tokens" to pass a DID in the credential request and at the same time proving possesion of the key material.

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

![OID4VC Diagram](/Diagramme/OID4VP/SIOP/vp_siop.png)

### Seperate DIDComm

It is also possible to create a separate DIDComm connection parallel to the usual (pre-)authorized flow. This solution uses one-time-codes or pseudorandom numbers in order to synch the DIDComm Connection.

![OID4VC Diagram](/Diagramme/OID4VCI/DIDComm_Separated/didcomm_separated.png)

## Comparison of the current solutions

||DID JWT without Deferred Credential Endpoint|DID JWT with Deferred Credential Endpoint|Separate DIDComm|
|---|---|---|---|
|Support of both flows (Authorization and pre-authorized)|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|
|Enforce DIDComm|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|
|Optional DIDComm|:heavy_check_mark:|:heavy_check_mark:|:heavy_check_mark:|
|Timeout handling|:x:|:heavy_check_mark:|:heavy_check_mark: - parallel establishment of DIDComm|
|Message modification|Body (Header possible)|Body (Header possible)|Header|



