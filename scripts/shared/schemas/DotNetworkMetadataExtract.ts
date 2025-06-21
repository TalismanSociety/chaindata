import { AnyMiniMetadataSchema, DotNetworkTopologySchema } from '@talismn/chaindata-provider'
import z from 'zod/v4'

export const DotNetworkMetadataExtractSchema = z.strictObject({
  id: z.string().nonempty(),
  account: z.enum(['secp256k1', '*25519']),
  specVersion: z.uint32(),
  balancesLibVersion: z.string().nonempty(),
  ss58Prefix: z.uint32(),
  hasCheckMetadataHash: z.boolean(),
  topology: DotNetworkTopologySchema,
  miniMetadatas: z.partialRecord(z.string().nonempty(), AnyMiniMetadataSchema),
})

export type DotNetworkMetadataExtract = z.infer<typeof DotNetworkMetadataExtractSchema>

export const DotNetworkMetadataExtractsFileSchema = z.array(DotNetworkMetadataExtractSchema)
