// Core interfaces
import {
    createAgent,
    IDIDManager,
    IResolver,
    IDataStore,
    IDataStoreORM,
    IKeyManager,
    ICredentialPlugin,
} from '@veramo/core'

// Core identity manager plugin
import { DIDManager } from '@veramo/did-manager'

// Ethr did identity provider
//import { EthrDIDProvider } from '@veramo/did-provider-ethr'

// Core key manager plugin
import { KeyManager } from '@veramo/key-manager'

// Custom key management system for RN
import { KeyManagementSystem, SecretBox } from '@veramo/kms-local'

// W3C Verifiable Credential plugin
import { CredentialPlugin } from '@veramo/credential-w3c'

// Custom resolvers
import { DIDResolverPlugin } from '@veramo/did-resolver'
import { Resolver } from 'did-resolver'
//import { getResolver as ethrDidResolver } from 'ethr-did-resolver'
//import { getResolver as webDidResolver } from 'web-did-resolver'
import { getResolver as keyDidResolver } from 'key-did-resolver'
import { getResolver as peerDidResolver } from '@veramo/did-provider-peer'

// Storage plugin using TypeOrm
import { Entities, KeyStore, DIDStore, PrivateKeyStore, migrations } from '@veramo/data-store'

// TypeORM is installed with `@veramo/data-store`
import { DataSource } from 'typeorm'
import { KeyDIDProvider } from '@veramo/did-provider-key'
import { PeerDIDProvider } from '@veramo/did-provider-peer'

import { IOID4VCIIssuer, OID4VCIIssuer } from '@sphereon/ssi-sdk.oid4vci-issuer'
import { IOID4VCIStore, OID4VCIStore } from '@sphereon/ssi-sdk.oid4vci-issuer-store'
import { IKeyValueStore, IValueData, KeyValueStore, ValueStoreType } from '@sphereon/ssi-sdk.kv-store-temp'



// This will be the name for the local sqlite database for demo purposes
const DATABASE_FILE = 'database.sqlite'

// You will need to get a project ID from infura https://www.infura.io
//const INFURA_PROJECT_ID = '<your PROJECT_ID here>'

// This will be the secret key for the KMS
const KMS_SECRET_KEY = '29739248cad1bd1a0fc4d9b75cd4d2990de535baf5caadfdf8d8f86664aa830c'



const dbConnection = new DataSource({
    type: 'sqlite',
    database: DATABASE_FILE,
    synchronize: false,
    migrations,
    migrationsRun: true,
    logging: ['error', 'info', 'warn'],
    entities: Entities,
}).initialize()


const resolvers = new Resolver({ ...keyDidResolver(), ...peerDidResolver() })

export const agent = createAgent<IDIDManager & IKeyManager & IDataStore & IDataStoreORM & IResolver & ICredentialPlugin & IOID4VCIIssuer & IOID4VCIStore>({
  plugins: [
    new KeyManager({
      store: new KeyStore(dbConnection),
      kms: {
        local: new KeyManagementSystem(new PrivateKeyStore(dbConnection, new SecretBox(KMS_SECRET_KEY))),
      },
    }),
    new DIDManager({
      store: new DIDStore(dbConnection),
      defaultProvider: 'did:peer',
      providers: {
        'did:key': new KeyDIDProvider({ defaultKms: "local" }),
        'did:peer': new PeerDIDProvider({ defaultKms: "local" })
      },
    }),
    new DIDResolverPlugin({
      resolver: new Resolver({
        ...keyDidResolver(),
        ...peerDidResolver()
      }),
    }),
    new CredentialPlugin(),
    new OID4VCIIssuer({ defaultStoreId: "_default", defaultNamespace: "oid4vci", resolveOpts: {resolver: resolvers} }),
    new OID4VCIStore({ 
      importMetadatas: [{ 
        metadata: { 
          credential_issuer: "issuer.com", 
          credentials_supported: [{ format: "jwt_vc_json", types: ["VerifiableCredential","UniversityDegreeCredential"]}], 
          credential_endpoint: "https://issuer.com/credentials" 
        }, 
        correlationId: "123" 
      }],
      importIssuerOpts: [{
        issuerOpts: { didOpts: { identifierOpts: { identifier:"xyz"}}},
        correlationId:"123"
      }]
    })
  ],
})
