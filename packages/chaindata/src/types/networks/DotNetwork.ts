import z from 'zod/v4'

import { HexStringSchema } from '../shared'
import { TokenTypeSchema } from '../tokens'
import { NetworkBaseSchema } from './NetworkBase'

export const DotNetworkSchema = NetworkBaseSchema.extend({
  genesisHash: HexStringSchema,
  platform: z.literal('polkadot'),
  isRelay: z.boolean().optional(), // has paras pallet
  specName: z.string(),
  specVersion: z.number(),
  account: z.enum(['secp256k1', '*25519']),
  chainspecQrUrl: z.string().nonempty().optional(),
  latestMetadataQrUrl: z.string().nonempty().optional(),
  overrideNativeTokenId: z.string().nonempty().optional(), // TODO: explain why we need this
  prefix: z.number(),
  oldPrefix: z.number().optional(),
  rpcs: z.array(z.url({ protocol: /^wss?$/ })),
  relayId: z.string().nonempty().optional(),
  paraId: z.number().optional(), // u32, can use number
  registryTypes: z.any().optional(),
  signedExtensions: z.any().optional(),
  hasCheckMetadataHash: z.boolean().optional(),
  hasExtrinsicSignatureTypePrefix: z.boolean().optional(),
  isUnknownFeeToken: z.boolean().optional(),
})
export type DotNetwork = z.infer<typeof DotNetworkSchema>

export const DotNetworkExtendedSchema = DotNetworkSchema.extend({
  balancesConfig: z.partialRecord(TokenTypeSchema, z.any()).optional(),
})

export type DotNetworkExtended = z.infer<typeof DotNetworkExtendedSchema>
