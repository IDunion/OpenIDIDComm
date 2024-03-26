# OID Associate Protocol (Draft)

This is a protocol that associates a DIDComm relationship with an access token obtained via OID interactions. While the anticipated use of this protocol is alongsid OID4VC protocol interactions, it can be used with any OID interactions.

This protocol plays a small but important part in the overall flow that associates OID and DIDComm interactions. For full details, see <link here>. Prior to use of this protocol, a DIDComm associated access token was obtained from OID or OID4VC interactions. 

### Roles
*token_issuer* - Issues the OID access token.

*token_holder* - Receives the OID access token and presents it via this protocol. 

### Protocol URI

`https://didcomm.org/oidassociate/1.0/`

### Present Token message

This message is sent by the `token_holder` to present an OID obtained access token to the `token_issuer`.

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

This message acknowledges and an OID obtained access token to the other party. This serves as a confirmation that the token association has been completed and the DIDComm relationship has been associated with the access token obtained via an OID process. 

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

This indicates that the token association has not been completed, for a reason indicated in the message.

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
