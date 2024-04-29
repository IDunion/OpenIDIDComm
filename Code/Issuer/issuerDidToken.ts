import { agent, resolvers } from './issuerAgent.js'
import { AccessTokenRequest, AccessTokenResponse, ProofOfPossession, CredentialResponse, CredentialIssuerMetadata, CredentialSupported, CredentialRequestJwtVcJson } from '@sphereon/oid4vci-common'
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
import { IIssuer } from './issuerInterface.js'
import { OID4VCIRestAPI } from '@sphereon/ssi-sdk.oid4vci-issuer-rest-api'
import { CredentialDataSupplierArgs } from "@sphereon/oid4vci-issuer"
import { createHttpTerminator, HttpTerminator } from 'http-terminator'

//Terminal Colors :)
var verbose = false
const red = "\x1b[41m"
const green = "\x1b[42m"
const end = "\x1b[0m"

export class IssuerDidToken implements IIssuer {
    identifier!: IIdentifier;
    store_id!: string
    base_url!: string
    rest_api!: OID4VCIRestAPI
    confirmed_connections: Record<string, { did: string, confirmed_at: number }> = {};
    defered_creds: Record<string, { status: string, credential?: CredentialResponse }> = {};
    access_tokens: Record<string, { metadata: AccessTokenResponse, confirmed_did?: string }> = {};

    constructor(did: string, store_id: string, base_url: string) {
        // hacky workaround for async constructor (see https://stackoverflow.com/a/50885340)
        return (async () => {
            this.store_id = store_id
            this.base_url = base_url

            const parts = did.split(":")
            this.identifier = await agent.didManagerGetOrCreate({
                alias: parts.slice(2).join(":"),
                kms: "local",
                provider: parts.slice(0, 2).join(":"),
                options: {
                    keyType: 'Ed25519'
                }
            })
    
            await agent.didManagerAddService({ did: this.identifier.did, service: { id: "123", type: "DIDCommMessaging", serviceEndpoint: base_url + "/didcomm" } })
    
            await agent.oid4vciStorePersistIssuerOpts({
                issuerOpts: {
                    didOpts: {
                        identifierOpts: {
                            identifier: this.identifier.did,
                            kid: this.identifier.keys[0].kid,
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
                    did: this.identifier.did
                },
                correlationId: store_id
            })
    
            const app = express()
            app.use(express.urlencoded({extended:false}))
            app.use(express.json())
            const server = app.listen(8080, ()=>{console.log("issuer listening")})
            this.rest_api = await OID4VCIRestAPI.init({
                context: {agent: agent},
                issuerInstanceArgs: {credentialIssuer: store_id, storeId: "_default", namespace: "oid4vci"},
                credentialDataSupplier: async (args: CredentialDataSupplierArgs) => ({
                    credential: {
                        '@context': "https://somecontext.com",
                        type: (args.credentialRequest as CredentialRequestJwtVcJson).types,
                        issuer: this.identifier.did,
                        issuanceDate: (Math.floor(Date.now() / 1000)).toString(),
                        credentialSubject: {
                            id: JSON.parse(decodeBase64url(args.credentialRequest.proof!.jwt.split(".")[1])).did,
                            smth: "something about subject"
                        }
                    }
                }),
                expressSupport: {
                    express: app,
                    port: 8080,
                    hostname: "localhost",
                    startListening: true,
                    server: server,
                    start: (opts?: { disableErrorHandler?: boolean; doNotStartListening?: boolean }) => {
                        return {server: server, terminator: createHttpTerminator({server: server})}
                    },
                    stop: async (terminator?: HttpTerminator) => { 
                        terminator ? await terminator.terminate() : server!.close(()=>{console.log("issuer closed")})
                        return true
                    }
                }
            })
        
            this.rest_api.restApi.router.post("/didcomm", bodyParser.raw({ type: "text/plain" }), async (req: Request, res: Response) => {
                res.sendStatus(202)
                process.stdout.write("\n>[DidComm] ")
    
                const didcomm_msg = await agent.handleMessage({ raw: req.body.toString() })
                const {type,data,from} = didcomm_msg
                this.debug(didcomm_msg)
    
                switch (type) {
                    case "https://didcomm.org/oidassociate/1.0/present_token":
                        console.log("Token Presentation")
                        const {oidtoken} = data! as {oidtoken:string}
                        this.debug(oidtoken)
                        
                        // Validate
                        let reason
                        const result = await verifyJWT(oidtoken, {resolver:resolvers}).catch((e)=>{})
                        //const stored_scope = this.access_tokens[oidtoken]?.metadata.scope!.split(" ") //sphereon doesnt do scopes yet
                        if      (!result?.verified)                    reason = "JWT Invalid";
                        else if (result.issuer != this.identifier.did) reason = "Token not issued by Issuer"
                        //else if (!stored_scope.includes("DidComm"))    reason = "Scope Invalid"
                        
                        const session = await this.rest_api.issuer.credentialOfferSessions.getAsserted(result!.payload.preAuthorizedCode)
    
                        if (reason) {
                            console.error(`<[DidComm] Reject. Reason: ${reason}`)
                            this.send_didcomm_msg(from!, this.identifier.did, "https://didcomm.org/oidassociate/1.0/reject_token", {"oidtoken": oidtoken, "reason": reason})
                        }
                        else {
                            console.log('<[DidComm] Acknowledge')
                            session.issuerState = "DIDCOMM_CONFIRMED"
                            this.confirmed_connections[oidtoken] = {did: from!, confirmed_at: Date.now()}
                            this.send_didcomm_msg(from!, this.identifier.did, "https://didcomm.org/oidassociate/1.0/acknowledge_token", {"oidtoken": oidtoken})
                        }
                        break
                    
                    case "https://didcomm.org/basicmessage/2.0/message": // basic message
                        const {content} = data! as {content:string}
                        console.log(content)
                        break
                    
                    default:
                        console.warn(`Unknown Message Type: '${type}'`)
                }
            })
    
            return this
        })() as unknown as IssuerDidToken;
    }
    
    /****************/
    /* Constructors */
    /****************/
    // static async build(did: string, store_id: string, base_url: string) {
    //     const parts = did.split(":")
    //     const identifier = await agent.didManagerGetOrCreate({
    //         alias: parts.slice(2).join(":"),
    //         kms: "local",
    //         provider: parts.slice(0, 2).join(":"),
    //         options: {
    //             keyType: 'Ed25519'
    //         }
    //     })

    //     await agent.didManagerAddService({ did: identifier.did, service: { id: "123", type: "DIDCommMessaging", serviceEndpoint: base_url + "/didcomm" } })

    //     await agent.oid4vciStorePersistIssuerOpts({
    //         issuerOpts: {
    //             didOpts: {
    //                 identifierOpts: {
    //                     identifier: identifier.did,
    //                     kid: identifier.keys[0].kid,
    //                 }
    //             }
    //         },
    //         correlationId: store_id
    //     })

    //     await agent.oid4vciStorePersistMetadata({
    //         metadata: {
    //             credential_issuer: base_url,
    //             credentials_supported: [Object.defineProperty({ format: "jwt_vc_json", types: ["VerifiableCredential", "UniversityDegreeCredential"] }, "didcommRequired", { value: "Required", enumerable: true })],
    //             credential_endpoint: base_url + "/credentials",
    //             token_endpoint: base_url + "/token",
    //             deferred_endpoint: base_url + "/deferred",
    //             did: identifier.did
    //         },
    //         correlationId: store_id
    //     })

    //     const app = express()
    //     app.use(express.urlencoded({extended:false}))
    //     const server = app.listen(8080, ()=>{console.log("issuer listening")})
    //     const api = await OID4VCIRestAPI.init({
    //         context: {agent: agent},
    //         issuerInstanceArgs: {credentialIssuer: store_id, storeId: "_default", namespace: "oid4vci"},
    //         credentialDataSupplier: async (args: CredentialDataSupplierArgs) => ({
    //             credential: {
    //                 '@context': "https://somecontext.com",
    //                 type: (args.credentialRequest as CredentialRequestJwtVcJson).types,
    //                 issuer: identifier.did,
    //                 issuanceDate: (Math.floor(Date.now() / 1000)).toString(),
    //                 credentialSubject: {
    //                     id: JSON.parse(decodeBase64url(args.credentialRequest.proof!.jwt.split(".")[1])).did,
    //                     smth: "something about subject"
    //                 }
    //             }
    //         }),
    //         expressSupport: {
    //             express: app,
    //             port: 8080,
    //             hostname: "localhost",
    //             startListening: true,
    //             server: server,
    //             start: (opts?: { disableErrorHandler?: boolean; doNotStartListening?: boolean }) => {
    //                 return {server: server, terminator: createHttpTerminator({server: server})}
    //             },
    //             stop: async (terminator?: HttpTerminator) => { 
    //                 terminator ? await terminator.terminate() : server!.close(()=>{console.log("issuer closed")})
    //                 return true
    //             }
    //         }
    //     })

    //     const issuer = new IssuerDidToken(identifier, store_id, base_url, api)

    //     issuer.rest_api.restApi.router.post("/didcomm", bodyParser.raw({ type: "text/plain" }), async (req: Request, res: Response) => {
    //         res.sendStatus(202)
    //         process.stdout.write("\n>[DidComm] ")

    //         const didcomm_msg = await agent.handleMessage({ raw: req.body.toString() })
    //         const {type,data,from} = didcomm_msg
    //         issuer.debug(didcomm_msg)

    //         switch (type) {
    //             case "https://didcomm.org/oidassociate/1.0/present_token":
    //                 console.log("Token Presentation")
    //                 const {oidtoken} = data! as {oidtoken:string}
                    
    //                 // Validate
    //                 let reason
    //                 const result = await verifyJWT(oidtoken, {resolver:resolvers}).catch((e)=>{})
    //                 const stored_scope = issuer.access_tokens[oidtoken]?.metadata.scope!.split(" ")
    //                 if      (!result?.verified)                    reason = "JWT Invalid";
    //                 else if (result.issuer != issuer.identifier.did) reason = "Token not issued by Issuer"
    //                 else if (!stored_scope.includes("DidComm"))    reason = "Scope Invalid"

    //                 if (reason) {
    //                     console.error(`<[DidComm] Reject. Reason: ${reason}`)
    //                     issuer.send_didcomm_msg(from!, issuer.identifier.did, "https://didcomm.org/oidassociate/1.0/reject_token", {"oidtoken": oidtoken, "reason": reason})
    //                 }
    //                 else {
    //                     console.log('<[DidComm] Acknowledge')
    //                     issuer.access_tokens[oidtoken].confirmed_did = from!
    //                     issuer.confirmed_connections[oidtoken] = {did: from!, confirmed_at: Date.now()}
    //                     issuer.send_didcomm_msg(from!, issuer.identifier.did, "https://didcomm.org/oidassociate/1.0/acknowledge_token", {"oidtoken": oidtoken})
    //                 }
    //                 break
                
    //             case "https://didcomm.org/basicmessage/2.0/message": // basic message
    //                 const {content} = data! as {content:string}
    //                 console.log(content)
    //                 break
                
    //             default:
    //                 console.warn(`Unknown Message Type: '${type}'`)
    //         }
    //     })

    //     return issuer
    // }

    /******************/
    /* EXPRESS SERVER */
    /******************/
    // async start_server() {
        //Metdadata Endpoint
        // app.get("/.well-known/openid-credential-issuer", async (req: Request, res: Response) => {
        //     console.log("\n> Metadaten Request")
        //     const metadata = await agent.oid4vciStoreGetMetadata({ correlationId: this.store_id })
        //     res.send(metadata)
        //     console.log("< Metadata")
        //     this.debug(metadata)
        // })

        // // Token Endpoint
        // app.post("/token", express.urlencoded({ extended: true }), async (req: Request, res: Response) => {
        //     console.log("\n> Token Request")
        //     this.debug(req.body)

        //     const token = await this.get_token(req.body)
        //     this.access_tokens[token.access_token] = { metadata: token }
            
        //     res.send(token)
        //     console.log("< Token")
        //     this.debug(token)
        // })

        // // Credential Endpoint
        // app.post("/credentials", bodyParser.json(), async (req: Request, res: Response) => {
        //     console.log("\n> Credential Request")
        //     this.debug(req.body)

        //     // Validate Token
        //     const access_token = req.get("authorization")!.split(" ")[1]
        //     const result = await verifyJWT(access_token, {resolver: resolvers})
        //     if (!result.verified || result.issuer != this.identifier.did){
        //         res.status(400).json({ error: "invalid_access_token" })
        //         console.log(red + "< Invalid Access Token" + end)
        //         return
        //     }

        //     // Enforce DidComm Requirements
        //     const supported = (await agent.oid4vciStoreGetMetadata({ correlationId: this.store_id }))?.credentials_supported[0] as CredentialSupported & { didcommRequired: string }

        //     if (supported.didcommRequired == "Required") {
        //         if (!this.access_tokens[access_token].confirmed_did) {
        //             res.status(400).json({ error: "didcomm_unconfirmed" })
        //             console.log(red + "< DidComm Unregistered" + end)
        //             return
        //         }
        //         /*else if ((Date.now() - this.confirmed_connections[connection_id].confirmed_at) / 1000 > 60) {
        //             res.status(400).json({ error: "didcomm_expired" })
        //             console.log(red + "< DidComm abgelaufen" + end)
        //             return
        //         }*/
        //     }

        //     var confirmed_did: string | undefined
        //     if (supported.didcommRequired == "Required") confirmed_did = this.access_tokens[access_token].confirmed_did

        //     // Build Credential
        //     try {
        //         var credential = await this.issue_credential(req.body)
        //     }
        //     catch (e) {
        //         if ((e as Error).message == "Didcomm timeout") {
        //             res.status(400).json({ error: "didcomm_unreachable" })
        //             console.log(red, "< DidComm Error", end)
        //         }
        //         else {
        //             res.sendStatus(500)
        //             console.log(red, "< Internal Error", end)
        //             this.debug(e)
        //         }

        //         return
        //     }

        //     res.send(credential)
        //     console.log(green, "< Credential", end)
        //     this.debug(credential)
        // })

        // // DidComm Endpoint
        // // TODO: Exception handling, but it's easier to read like this
        // app.post("/didcomm", bodyParser.raw({ type: "text/plain" }), async (req: Request, res: Response) => {
        //     res.sendStatus(202)
        //     process.stdout.write("\n>[DidComm] ")

        //     const didcomm_msg = await agent.handleMessage({ raw: req.body.toString() })
        //     const {type,data,from} = didcomm_msg
        //     this.debug(didcomm_msg)

        //     switch (type) {
        //         case "https://didcomm.org/oidassociate/1.0/present_token":
        //             console.log("Token Presentation")
        //             const {oidtoken} = data! as {oidtoken:string}
                    
        //             // Validate
        //             let reason
        //             const result = await verifyJWT(oidtoken, {resolver:resolvers}).catch((e)=>{})
        //             const stored_scope = this.access_tokens[oidtoken]?.metadata.scope!.split(" ")
        //             if      (!result?.verified)                    reason = "JWT Invalid";
        //             else if (result.issuer != this.identifier.did) reason = "Token not issued by Issuer"
        //             else if (!stored_scope.includes("DidComm"))    reason = "Scope Invalid"

        //             if (reason) {
        //                 console.error(`<[DidComm] Reject. Reason: ${reason}`)
        //                 this.send_didcomm_msg(from!, this.identifier.did, "https://didcomm.org/oidassociate/1.0/reject_token", {"oidtoken": oidtoken, "reason": reason})
        //             }
        //             else {
        //                 console.log('<[DidComm] Acknowledge')
        //                 this.access_tokens[oidtoken].confirmed_did = from!
        //                 this.confirmed_connections[oidtoken] = {did: from!, confirmed_at: Date.now()}
        //                 this.send_didcomm_msg(from!, this.identifier.did, "https://didcomm.org/oidassociate/1.0/acknowledge_token", {"oidtoken": oidtoken})
        //             }
        //             break
                
        //         case "https://didcomm.org/basicmessage/2.0/message": // basic message
        //             const {content} = data! as {content:string}
        //             console.log(content)
        //             break
                
        //         default:
        //             console.warn(`Unknown Message Type: '${type}'`)
        //     }
        // })

        // const port = Number(this.base_url.split(":")[2].split("/")[0])
        // this.server = app.listen(port)
    // }

    public async stop_server() {
        await this.rest_api.stop()
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

    private async issue_credential(request: CredentialRequestJwtVcJson) {
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