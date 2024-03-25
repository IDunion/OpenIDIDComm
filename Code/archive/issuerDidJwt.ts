import { agent, resolvers } from '../Issuer/issuerAgent.js'
import { CredentialRequestJwtVc, AccessTokenRequest, AccessTokenResponse, ProofOfPossession, CredentialResponse } from '@sphereon/oid4vci-common'
import { ICredential } from '@sphereon/ssi-types'
import express, { Express, Request, Response } from 'express'
import * as http from "http"
import bodyParser from 'body-parser'
import { decodeBase64url } from '@veramo/utils'
import { IDIDCommMessage } from '@veramo/did-comm'
import { verifyJWT } from 'did-jwt'
import { Credential } from '@veramo/data-store'
import { IIdentifier } from '@veramo/core'
import { IIssuer } from '../Issuer/issuerInterface.js'

//terminal farben
var verbose = false
const red = "\x1b[41m"
const green = "\x1b[42m"
const end = "\x1b[0m"

var pending_pings: Record<string, { acknowledge: (value: unknown) => void }> = {};

export class IssuerDidJwt implements IIssuer {
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

        return new IssuerDidJwt(identifier, store_id, base_url)
    }

    /**********/
    /* SERVER */
    /**********/
    start_server(): void {
        const app: Express = express()

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
            const metadata = await agent.oid4vciStoreGetMetadata({ correlationId: "123" })
            res.send(metadata)
            console.log("< Metadaten")
            this.debug(metadata)
        })

        // Hier bekommt der Client den Token
        app.post("/token", express.urlencoded({ extended: true }), async (req: Request, res: Response) => {
            console.log("\n> Token Anfrage")
            this.debug(req.body)
            const token = await this.get_token(req.body)
            res.send(token)
            console.log("< Token")
            this.debug(token)
        })

        // Hier bekommt der Client das Credential
        app.post("/credentials", bodyParser.json(), async (req: Request, res: Response) => {
            console.log("\n> Credential Anfrage")
            this.debug(req.body)

            // Prüfe DidComm Proof
            const didcomm_proof = req.body.didcomm_proof as ProofOfPossession
            try {
                var verification_result = await verifyJWT(didcomm_proof.jwt, { resolver: resolvers, audience: "http://localhost:8080" })
                var rcpt_did = verification_result.didResolutionResult.didDocument!.id
                var nonce = verification_result.payload.nonce
            }
            catch (e) {
                console.error(red + "DidComm proof ungültig:" + end + "\n", e)
                res.status(400).json({ error: "invalid_proof" })
                return
            }

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
                var [credential, didcomm_succesfull] = await Promise.all([this.issue_credential(req.body), this.establish_didcomm_connection(rcpt_did, nonce)])
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
                        console.log(red, "< Interner Fehler:", e, end)
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
                await this.send_didcomm_msg(rcpt_did, this.identifier.did, "credential_ready", { transaction_id: deferal.transaction_id })
                console.log("\n< Credential bereit")
            }
        })

        // Hier kommt die DidComm Verbindungsbestätigung an
        app.post("/didcomm", bodyParser.raw({ type: "text/plain" }), async (req: Request, res: Response) => {
            const message = await agent.handleMessage({ raw: req.body.toString() })
        
            if (message.type == "pong") {
                console.log("> Pong #" + message.threadId)
                if (pending_pings[message.threadId!]) {
                    this.debug("Pong erhalten: {id:" + message.id + ", thid:" + message.threadId + "}, Ausstehende Pings: " + Object.keys(pending_pings))
                    pending_pings[message.threadId!].acknowledge("")
                    delete pending_pings[message.threadId!]
                    this.confirmed_connections[message.threadId!] = {did: message.from!, confirmed_at: Date.now()}
                }
                else console.log("\n> Abgelaufener Pong #", message.threadId)
                res.sendStatus(200)
            }
            else {
                console.log("\n> Unbekannte DidComm Nachricht")
                res.sendStatus(404)
            }
        })
        
        // Hier kommen die deferred Statusanfragen an
        app.post("/deferred", bodyParser.json(), async (req: Request, res: Response) => {
            const body = req.body as { transaction_id: string, c_nonce: string }
            console.log("\n> Deferred Anfrage")
        
            if (this.defered_creds[body.transaction_id]) {
                switch (this.defered_creds[body.transaction_id].status) {
                    case "READY":
                        console.log(green, "< Credential bereit", end)
                        res.send(this.defered_creds[body.transaction_id].credential!)
                        this.debug(this.defered_creds[body.transaction_id].credential!)
                        break
                    case "FAILED":
                        console.log(red, "< Credential fehlgeschlagen", end)
                        res.status(400).json({ error: "didcomm_unreachable" })
                        break
                    case "PENDING":
                        console.log("< Credential nicht bereit")
                        res.status(400).json({ error: "issuance_pending" })
                }
            }
            else {
                console.log("< Credential nicht gefunden")
                res.status(400).json({ error: "invalid_transaction_id" })
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

    async get_token(request: AccessTokenRequest): Promise<AccessTokenResponse> {
        const response = await agent.oid4vciCreateAccessTokenResponse({
            request: request,
            credentialIssuer: this.store_id,
            expirationDuration: 100000
        })

        return response
    }

    async issue_credential(request: CredentialRequestJwtVc) {
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

    async establish_didcomm_connection(to: string, nonce: string) {
        // Versucht 3x den Empfänger zu erreichen

        for (let i = 0; i < 3; i++) {
            var message_id = await this.send_didcomm_msg(to, this.identifier.did, "ping", { nonce: nonce })
            console.log("< Ping #" + message_id)

            // Promise mit Timeout von 2+i Sekunde und globaler acknowledge-Funktion
            var timeoutID: NodeJS.Timeout
            var pending_ping = new Promise((resolve, reject) => {
                pending_pings[message_id] = { acknowledge: () => { clearTimeout(timeoutID); resolve("") } };
                timeoutID = setTimeout(() => { delete pending_pings[message_id]; reject() }, 2000 + (i * 1000));
            })

            try {
                await pending_ping
                break
            }
            catch {
                console.log("Timeout")
                if (i == 2) throw Error("Didcomm timeout")
            }
        }

        return true
    }

    async send_didcomm_msg(to: string, from: string, type: string, body: Object): Promise<string> {
        const message: IDIDCommMessage = {
            type: type,
            to: to,
            from: from,
            id: Math.random().toString().slice(2, 5),
            body: body
        }

        const packed_msg = await agent.packDIDCommMessage({ message: message, packing: "authcrypt" })
        await agent.sendDIDCommMessage({ messageId: message.id, packedMessage: packed_msg, recipientDidUrl: message.to })

        return message.id
    }

    debug(message: any) {
        if (verbose == true) console.debug(message)
    }
}