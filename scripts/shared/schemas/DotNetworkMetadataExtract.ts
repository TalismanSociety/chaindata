import { TokenSchema } from '@talismn/chaindata'
import z from 'zod/v4'

export const DotNetworkMetadataExtractSchema = z.strictObject({
  id: z.string().nonempty(),
  account: z.string().nonempty(),
  specVersion: z.uint32(),
  ss58Prefix: z.uint32(),
  hasCheckMetadataHash: z.boolean(),
  cacheBalancesConfigHash: z.string(),
  miniMetadatas: z.partialRecord(z.string().nonempty(), z.any()),
  tokens: z.partialRecord(z.string().nonempty(), z.any()),
})

export type DotNetworkMetadataExtract = z.infer<typeof DotNetworkMetadataExtractSchema>

export const DotNetworkMetadataExtractsFileSchema = z.array(DotNetworkMetadataExtractSchema)
