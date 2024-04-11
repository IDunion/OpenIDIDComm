# OID Associate Protocol (Draft)

This is a protocol that associates a DIDComm relationship with an access token obtained via OID interactions. While the anticipated use of this protocol is alongsid OID4VC protocol interactions, it can be used with any OID interactions.

This protocol plays a small but important part in the overall flow that associates OID and DIDComm interactions. For full details, see <link here>. Prior to use of this protocol, a DIDComm associated access token was obtained from OID or OID4VC interactions. 

### Roles
*token_issuer* - Issues the OID access token.

*token_holder* - Receives the OID access token from the *token_issuer* and presents it via this protocol to the *token_verifier*.

*token_verifier' - Receives the presented OID access token from the *token_holder* and verifies its validity and association with an OID(4VC/VP) flow. The *token_verifier* almost certainly is the *token_issuer*, though it is technically possible, that both roles are represented by different entities.

### Protocol URI

`https://didcomm.org/oidassociate/1.0/`

### Present Token message

This message is sent by the `token_holder` to present an OID obtained access token to the `token_verifier`.

```json
{
    "id": "8ba049e6-cc46-48fb-bfe0-463084d66324",
    "type": "https://didcomm.org/oidassociate/1.0/present_token",
    "created_time": "1547577721",
    "body": {
        "oidtoken": "<oidtoken>"
    }
}
```

### Acknowledge Token message

This message is sent by the *token_verifier* to the *token_holder* and acknowledges an OID obtained access token. This serves as a confirmation that the token association has been completed and the DIDComm relationship has been associated with the access token obtained via an OID process. 

```json
{
    "id": "8ba049e6-cc46-48fb-bfe0-463084d66324",
    "type": "https://didcomm.org/oidassociate/1.0/acknowledge_token",
    "created_time": "1547577721",
    "body": {
        "oidtoken": "<oidtoken>"
    }
}
```

### Token Rejected

This message is sent by the *token_verifier* to the *token_holder* and indicates that the token association has not been completed, for a reason indicated in the message.

```json
{
    "id": "8ba049e6-cc46-48fb-bfe0-463084d66324",
    "type": "https://didcomm.org/oidassociate/1.0/reject_token",
    "created_time": "1547577721",
    "body": {
        "oidtoken": "<oidtoken>",
        "reason": "<reason for rejection>"
    }
}
```
