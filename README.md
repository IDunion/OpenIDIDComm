# Openidcomm

[[_TOC_]]

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
