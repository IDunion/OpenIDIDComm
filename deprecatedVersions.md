# Deprecated versions
During our work we came up with various solutions which are not suitable any longer. This file contains all deprecated ideas and solutions for others to read about.

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

**Reasons for deprecation:**
- usage of two distinct OpenID-flows resulting in an overhead
- more synchronisation of states needed

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

**Reasons for depracation:**
- TODO

### Separate DIDComm

It is also possible to create a separate DIDComm connection parallel to the usual (pre-)authorized flow. This solution uses one-time-codes or pseudorandom numbers in order to synchronize the DIDComm Connection.

![OID4VC Diagram](/Diagramme/OID4VCI/DIDComm_Separated/didcomm_separated.png)

**Reasons for depracation:**
- TODO
