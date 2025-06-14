import { DotNetworkTopologyInfoSchema } from '@talismn/chaindata'
import z from 'zod/v4'

export const DotNetworkMetadataExtractSchema = z.strictObject({
  id: z.string().nonempty(),
  account: z.enum(['secp256k1', '*25519']),
  specVersion: z.uint32(),
  ss58Prefix: z.uint32(),
  hasCheckMetadataHash: z.boolean(),
  cacheBalancesConfigHash: z.string(),
  miniMetadatas: z.partialRecord(z.string().nonempty(), z.any()),
  tokens: z.partialRecord(z.string().nonempty(), z.any()),
  topologyInfo: DotNetworkTopologyInfoSchema,
})

export type DotNetworkMetadataExtract = z.infer<typeof DotNetworkMetadataExtractSchema>

export const DotNetworkMetadataExtractsFileSchema = z.array(DotNetworkMetadataExtractSchema)
