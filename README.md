# Openidcomm

- [Summary](#summary)
- [OID4VC](#oid4vc-extension)
    - [In-Stream](#in-stream)
    - [Down-Stream](#down-stream)
- [OID4VP](#oid4vp-extension)

## Summary
OpenIDComm extends the existing [OpenID for Verifiable Credential Issuance](https://openid.bitbucket.io/connect/openid-4-verifiable-credential-issuance-1_0.html#name-credential-issuer-metadata) and [OpenID for Verifable Presentations](https://openid.bitbucket.io/connect/openid-4-verifiable-presentations-1_0.html) specifications with the feature to create a long term DIDComm connection between both parties. This connection could be used to facilitate issuer/verifier initiated re-issuance or re-verification of credentials.

|             |    Pros           |       Cons            |       Comments          |
|-------------|:-----------------:|:---------------------:|:-----------------------:|
| Up-Stream   |
| In-Stream   | Conn. enforceable | Spec. modification
| Down-Stream | No spec. modification   | Conn. not enforceable, <br> Req. public DID


## OID4VC Extension
### In-Stream
![OID4VC Diagram](/Diagramme/eingelagert_4VC.png "OID4VC Extension")

The Credential Issuer Metadata contains a new attribute `didcomm_required` describing if a DIDComm connection is required or optional to obtain the Verified Credential.

Within the Authorization Request the Wallet sends a DID that resolves into DID Document containing a DIDComm-Service-Endpoint. The Issuer then creates a DIDComm channel with the given DID. The Issuer also includes the Nonce of the Authorization Request to assign the new DIDComm channel to the OID4VC flow.

If a DIDComm connection is required but could not be established, the Issuer sends back an Authorization Response containing the error `access_denied`. If no DIDComm connection is required or one was established, the Issuer answeres with the usual Authentication Response and continues with the normal OID4VC flow.

### Down-Stream
In contrast to the previous flow, this variant establishes the connection after the completion of the main OID4VC process.

![OID4VC Diagram](/Diagramme/nachgelagert.png "OID4VC Downstream Extension")

If the issuer-DID is public, no modifications to the OID4VC flow are made in this variant. Otherwise, the issuer would need to add its DID to its metadata.

Regardless, a request for a DIDComm connection is made by the client after the credential has been successfully  issued. This request could contain the issued credential as a verifiable presentation as a way to enable the issuer to verify the client and correlate the connection to the previous issuance.

The issuer then resolves the DID contained in the message's `from:` field and uses the contained service endpoint to respond.

**Pros:** No/Minimal modification of the OID4VC flow needed.

**Cons:** Issuer-side enforcement of connection not possible.

## OID4VP Extension
![OID4VP Diagram](/Diagramme/eingelagert_4VP.png "OID4VP Extension")

The OID4VP protocol is extended similiar to the OID4VC flow but with switched roles. Again, the Authorization Request contains a DID for usage with DIDComm, but this time the Verifier sends the Request and the Wallet initiates the DIDComm channel.

The Authorization Response is treated the same way as described in the OID4VC extension.

## Contributing
<!-- TODO: -->
State if you are open to contributions and what your requirements are for accepting them.

For people who want to make changes to your project, it's helpful to have some documentation on how to get started. Perhaps there is a script that they should run or some environment variables that they need to set. Make these steps explicit. These instructions could also be useful to your future self.

You can also document commands to lint the code or run tests. These steps help to ensure high code quality and reduce the likelihood that the changes inadvertently break something. Having instructions for running tests is especially helpful if it requires external setup, such as starting a Selenium server for testing in a browser.

## Authors and acknowledgment
<!-- TODO: -->
Show your appreciation to those who have contributed to the project.

## License
<!-- TODO: -->
For open source projects, say how it is licensed.

## Project status
<!-- TODO: -->
If you have run out of energy or time for your project, put a note at the top of the README saying that development has slowed down or stopped completely. Someone may choose to fork your project or volunteer to step in as a maintainer or owner, allowing your project to keep going. You can also make an explicit request for maintainers.
