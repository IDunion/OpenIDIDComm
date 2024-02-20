# Deprecated versions
During our work we came up with various solutions which are not suitable any longer. This file contains all deprecated ideas and solutions for others to read about.

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
- usage of two distinct flows resulting in an overhead
- more synchronisation of states needed
