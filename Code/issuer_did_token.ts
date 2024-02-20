import { agent, resolvers } from './issuer_agent.js'
import { CredentialRequestJwtVc, AccessTokenRequest, AccessTokenResponse, ProofOfPossession, CredentialResponse, CredentialIssuerMetadata, CredentialSupported } from '@sphereon/oid4vci-common'
import { ICredential } from '@sphereon/ssi-types'
import express, { Express, Request, Response } from 'express'
import bodyParser from 'body-parser'
import { decodeBase64url } from '@veramo/utils'
import { IDIDCommMessage, TrustPingMessageHandler } from '@veramo/did-comm'
import { verifyJWT } from 'did-jwt'
import { Credential } from '@veramo/data-store'
import * as readline from "readline"
import { IIdentifier } from '@veramo/core'
import * as http from "http"

//terminal farben
var verbose = false
const red = "\x1b[41m"
const green = "\x1b[42m"
const end = "\x1b[0m"

var allowed_pings: string[] = [];

export class Issuer {
    identifier: IIdentifier;
    store_id: string
    base_url: string

    server: http.Server | undefined
    confirmed_connections: Record<string, { did: string, confirmed_at: number }> = {};
    defered_creds: Record<string, { status: string, credential?: CredentialResponse }> = {};

    constructor(identifier: IIdentifier, store_id: string, base_url: string) {
        this.identifier = identifier
        this.store_id = store_id
        this.base_url = base_url
    }

    static async build(did: string, store_id: string, base_url: string) {
        const parts = did.split(":")
        const identifier = await agent.didManagerGetOrCreate({
            alias: parts.slice(2).join(":"),
            kms: "local",
            provider: parts.slice(0, 2).join(":"),
            options: {
                keyType: 'Ed25519'
            }
        })

        await agent.didManagerAddService({ did: identifier.did, service: { id: "123", type: "DIDCommMessaging", serviceEndpoint: base_url + "/didcomm" } })

        await agent.oid4vciStorePersistIssuerOpts({
            issuerOpts: {
                didOpts: {
                    identifierOpts: {
                        identifier: identifier.did,
                        kid: identifier.keys[0].kid,
                    }
                }
            },
            correlationId: store_id
        })

        await agent.oid4vciStorePersistMetadata({
            metadata: {
                credential_issuer: base_url,
                credentials_supported: [Object.defineProperty({ format: "jwt_vc_json", types: ["VerifiableCredential", "UniversityDegreeCredential"] }, "didcommRequired", { value: "Required", enumerable: true })],
                credential_endpoint: base_url + "/credentials",
                token_endpoint: base_url + "/token",
                deferred_endpoint: base_url + "/deferred",
                did: identifier.did
            },
            correlationId: store_id
        })

        return new Issuer(identifier, store_id, base_url)
    }

    /**********/
    /* SERVER */
    /**********/
    start_server() {
        const app = express()

        // Simuliert das scannen des QR-Codes. Vorerst nur mit Referenz auf SIOP-Anfrage
        app.get("/offer", async (req: Request, res: Response) => {
            console.log("\n> QR Code scan")
            const preauth_code = Math.random().toString(16).slice(2)
            const req_uri = await this.create_offer(preauth_code)
            res.send(req_uri)
            console.log("< Offer")
            this.debug(req_uri)
        })

        // Hier bekommt der Client die OID4VCI Metadaten her
        app.get("/.well-known/openid-credential-issuer", async (req: Request, res: Response) => {
            console.log("\n> Metadaten Anfrage")
            const metadata = await agent.oid4vciStoreGetMetadata({ correlationId: this.store_id })
            res.send(metadata)
            console.log("< Metadaten")
            this.debug(metadata)
        })

        // Hier bekommt der Client den Token
        app.post("/token", express.urlencoded({ extended: true }), async (req: Request, res: Response) => {
            console.log("\n> Token Anfrage")
            this.debug(req.body)
            const token = await this.get_token(req.body)
            const correlation_id = Math.random().toString().slice(2, 6)
            allowed_pings.push(correlation_id)
            res.set('DIDComm_Correlation_ID', correlation_id)
            res.send(token)
            console.log("< Token")
            this.debug(token)
        })

        // Hier bekommt der Client das Credential
        app.post("/credentials", bodyParser.json(), async (req: Request, res: Response) => {
            console.log("\n> Credential Anfrage")
            this.debug(req.body)

            // Prüfe DidComm Verbindung
            const supported = (await agent.oid4vciStoreGetMetadata({ correlationId: "123" }))?.credentials_supported[0] as CredentialSupported & { didcommRequired: string }
            const connection_id = req.body.connection_id as string

            if (supported.didcommRequired == "Required") {
                if (connection_id === undefined || !this.confirmed_connections[connection_id]) {
                    res.status(400).json({ error: "didcomm_unconfirmed" })
                    console.log(red + "< DidComm unbestätigt" + end)
                    return
                }
                else if ((Date.now() - this.confirmed_connections[connection_id].confirmed_at) / 1000 > 60) {
                    res.status(400).json({ error: "didcomm_expired" })
                    console.log(red + "< DidComm abgelaufen" + end)
                    return
                }
            }

            var confirmed_did: string | undefined
            if (supported.didcommRequired == "Required") confirmed_did = this.confirmed_connections[connection_id].did

            // Automatischer deferral nach 3s
            let deferal: { "transaction_id": string, "c_nonce": string } | undefined
            const timeout = setTimeout(() => {
                deferal = {
                    "transaction_id": String(Math.random().toString(16).slice(2)),
                    "c_nonce": String(Math.random().toString(16).slice(2))
                }
                this.defered_creds[deferal.transaction_id] = { status: "PENDING", credential: undefined }
                res.send(deferal)
                console.log("< Deferral")
                this.debug(deferal)
            }, 3000)

            // Erstelle Credential und DidComm Verbindung parallel. Reagiere abhängig von Timeout
            try {
                var credential = await this.issue_credential(req.body)
                clearTimeout(timeout)
            }
            catch (e) {
                clearTimeout(timeout)

                if (deferal === undefined) {
                    if ((e as Error).message == "Didcomm timeout") {
                        res.status(400).json({ error: "didcomm_unreachable" })
                        console.log(red, "< DidComm Fehler", end)
                    }
                    else {
                        res.sendStatus(500)
                        console.log(red, "< Interner Fehler", end)
                    }
                }
                else this.defered_creds[deferal.transaction_id].status = "FAILED"

                return
            }

            if (deferal === undefined) {
                res.send(credential)
                console.log(green, "< Credential", end)
                this.debug(credential)
            }
            else {
                this.defered_creds[deferal.transaction_id].status = "READY"
                this.defered_creds[deferal.transaction_id].credential = credential
                if (confirmed_did) await this.send_didcomm_msg(confirmed_did, this.identifier.did, "credential_ready", { transaction_id: deferal.transaction_id })
                console.log("\n< Credential bereit")
            }
        })

        // Hier kommt die DidComm Verbindungsbestätigung an
        app.post("/didcomm", bodyParser.raw({ type: "text/plain" }), async (req: Request, res: Response) => {
            const message = await agent.handleMessage({ raw: req.body.toString() })

            if (message.type == "register") {
                res.sendStatus(202)

                // Prüfe ob der Ping zu einem Flow gehört
                const correlation_id = (message.data! as any).correlation_id as unknown as string ?? ''
                if (!allowed_pings.includes(correlation_id)) {
                    console.log("\n> Unautorisierter DIDComm Ping")
                    return
                }
                delete allowed_pings[allowed_pings.indexOf(correlation_id)]

                console.log("\n> Register DidComm")
                const connection_id = String(Math.random().toString(16).slice(2))
                this.confirmed_connections[connection_id] = { did: message.from!, confirmed_at: Date.now() }
                this.send_didcomm_msg(message.from!, this.identifier.did, "ack_registration", { connection_id: connection_id }, message.id)
                console.log("< Connection ID #" + connection_id + "\n")
            }
            else if (message.type == "message") {
                res.sendStatus(202)
                console.log("> DidComm Message:", (message.data! as any).message)
            }
            else {
                console.log("\n> Unbekannte DidComm Nachricht")
                res.sendStatus(404)
            }
        })

        const port = Number(this.base_url.split(":")[2].split("/")[0])
        this.server = app.listen(port, () => {
            console.log("Server listening on port", port, "\n")
        })
    }

    public stop_server() {
        if (this.server) this.server.close(() => { console.log("Server closed"); this.server = undefined })
        else console.log("No server running")
    }

    /***********/
    /* UTILITY */
    /***********/
    public async create_offer(preauth_code: string): Promise<string> {
        const offer = await agent.oid4vciCreateOfferURI({
            credentialIssuer: this.store_id,
            storeId: "_default",
            namespace: "oid4vci",
            grants: { 'urn:ietf:params:oauth:grant-type:pre-authorized_code': { 'pre-authorized_code': preauth_code, user_pin_required: false } }
        })

        return offer.uri
    }

    private async get_token(request: AccessTokenRequest): Promise<AccessTokenResponse> {
        var response = await agent.oid4vciCreateAccessTokenResponse({
            request: request,
            credentialIssuer: this.store_id,
            expirationDuration: 100000
        })

        response.scope = "UniversityDegreeCredential DidComm"

        return response
    }

    private async issue_credential(request: CredentialRequestJwtVc) {
        const subject = JSON.parse(decodeBase64url(request.proof!.jwt.split(".")[1])).did

        const credential: ICredential = {
            '@context': "https://somecontext.com",
            type: request.types,
            issuer: this.identifier.did,
            issuanceDate: (Math.floor(Date.now() / 1000)).toString(),
            credentialSubject: {
                id: subject,
                smth: "something about subject"
            }
        }

        const response = await agent.oid4vciIssueCredential({
            credential: credential,
            credentialIssuer: this.store_id,
            credentialRequest: {
                format: 'jwt_vc_json',
                proof: request.proof,
                types: request.types
            }
        })

        return response
    }

    public async send_didcomm_msg(to: string, from: string, type: string, body: Object, thid?: string): Promise<string> {
        const message: IDIDCommMessage = {
            type: type,
            to: to,
            from: from,
            id: Math.random().toString().slice(2, 5),
            ...(thid !== undefined) && { thid: thid },
            body: body
        }

        const packed_msg = await agent.packDIDCommMessage({ message: message, packing: "authcrypt" })
        await agent.sendDIDCommMessage({ messageId: message.id, packedMessage: packed_msg, recipientDidUrl: message.to })

        return message.id
    }

    private debug(message: any) {
        if (verbose == true) console.debug(message)
    }
}