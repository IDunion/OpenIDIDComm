# Openidcomm

- [Summary](#summary)
- [OID4VC](#oid4vc-extension)
    - [Up-Stream](#up-stream)
    - [In-Stream](#in-stream)
    - [Down-Stream](#down-stream)
- [OID4VP](#oid4vp-extension)

## Summary
OpenIDComm extends the existing [OpenID for Verifiable Credential Issuance](https://openid.bitbucket.io/connect/openid-4-verifiable-credential-issuance-1_0.html#name-credential-issuer-metadata) and [OpenID for Verifable Presentations](https://openid.bitbucket.io/connect/openid-4-verifiable-presentations-1_0.html) specifications with the feature to create a long term DIDComm connection between both parties. This connection could be used to facilitate issuer/verifier initiated re-issuance or re-verification of credentials.

|             |    Pros           |       Cons            |       Comments          |
|-------------|:-----------------:|:---------------------:|:-----------------------:|
| Up-Stream   | Conn. enforceable | Spec. extension, <br> Req. public DID | Probably no advantage over In-Stream.
| In-Stream   | Conn. enforceable | Spec. extension    | /
| Down-Stream | No spec. extension   | Conn. not enforceable, <br> Req. public DID | /


## OID4VC Extension
### Up-Stream
![OID4VC Diagram](/Diagramme/oid4vc_didcomm_preconnection.png "OID4VC Extension")

In this variant, a DIDComm connection is established before the start of the corresponding OID4VC process. The client sends the initial request. The issuer then resolves the DID contained in the message's `from:` field and uses the contained service endpoint to direct its response containing a random nonce & metadata with DIDComm requirements. Based on this metadata, the client can decide, if it wants to acknowledge or send an error.

Next the previous nonce is used in the OID4VC authorization request field `conn_reference=` to correlate the request. Depending on if the DIDComm connection was acknowledged or not, the issuer can then allow/deny access.

### In-Stream
In contrast to the previous flow, this variant establishes the connection as part of the main OID4VC authorization process.

![OID4VC Diagram](/Diagramme/oid4vc_didcomm_midconnection.png "OID4VC Extension")

The Credential Issuer Metadata contains a new attribute `didcomm_required` describing if a DIDComm connection is required or optional to obtain the Verified Credential.

Within the Authorization Request the Wallet sends a DID that resolves into DID Document containing a DIDComm-Service-Endpoint. The Issuer then creates a DIDComm channel with the given DID. The Issuer also includes the Nonce of the Authorization Request to assign the new DIDComm channel to the OID4VC flow.

If a DIDComm connection is required but could not be established, the Issuer sends back an Authorization Response containing the error `access_denied`. If no DIDComm connection is required or one was established, the Issuer answeres with the usual Authorization Response and continues with the normal OID4VC flow.

### Down-Stream
![OID4VC Diagram](/Diagramme/oid4vc_didcomm_postconnection.png "OID4VC Downstream Extension")

If the issuer-DID is public, no extensions to the OID4VC flow are made in this variant. Otherwise, the issuer would need to add its DID to its metadata.

Regardless, a request for a DIDComm connection is made by the client after the credential has been successfully  issued. This request could contain the issued credential as a verifiable presentation as a way to enable the issuer to verify the client and correlate the connection to the previous issuance.

Alternatively, if a DIDcomm connection is wanted even if the issuance was not successful, instead of the presentation, a hash of all exchanged messages could be send by the client for correlation.

## OID4VP Extension
![OID4VP Diagram](/Diagramme/oid4vp_didcomm_midconnection.png "OID4VP Extension")

The OID4VP protocol is extended similiar to the OID4VC flow but with reversed roles. Again, the Authorization Request contains a DID for usage with DIDComm, but this time the Verifier sends the Request and the Wallet initiates the DIDComm channel.

The Authorization Response is treated the same way as described in the In-Stream OID4VC extension.

# Updated Version

Goal: Update the current README with new thoughts and considerations

## Requirements

Primary:
- DIDComm channel in addition to OID4VC/VP for future communication between parties (Holder and Issuer or Holder and Verifier)
- support both flows

Secondary, optional:
- Enforce DIDComm channel before VC is issued/verified
- No change of the OID4VC/VP Specification
- Different DIDs for Credential Issuance and DIDComm
- same solution for both protocols

Required Steps:
- DID Discovery (Get DID from at least one party)
- DID resolving to DID Document (with service endpoint)
- Linking DIDComm Channel and OID4VC/VP flow (How can one know, that both protocols are used in the same context)

## Solutions

Every Solution should describe how it solves the requirements and required steps.  
Furthermore, every solution should evaluate its benefits (i. e. what secondary requirements were met) and limitations (i. e. what secondary requirements were not met).  
And contain sequence diagrams for visualization.

Solution:
- OID4VC/VP in message extension ("mainly" authorized flow)
- SIOP + OID4VC/VP (authorized flow + pre-authorized flow)

### OID4VC/VP Message Extension

TODO: describe

### SIOP + OID4VC/VP

This solution utilizes "Self Issued Identity Providers" (SIOP) to pass the Wallet's DID to the Issuer. This DID is subsequently resolved by the Issuer to confirm the service endpoint. Finally, if all requirements are met, a custom OID4VC offer is passed via the DidComm channel, which the Wallet can use to start/continue the OID4VC flow.

This way a DidComm channel for future use can be created in the Auth./Consent step of both the authorized and preauthorized flow.

Additionally a DidComm channel can be enforced, no change to the OID4VC flow is necessary and different DIDs can be used.

![OID4VC Diagram](/Diagramme/preauth_siop.png)![OID4VC Diagram](/Diagramme/auth_siop.png)
