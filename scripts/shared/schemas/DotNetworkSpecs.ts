import { DotNetworkSchema } from '@talismn/chaindata-provider'
import z from 'zod/v4'

const DotNetworkRuntimeVersionSchema = z.object({
  specName: z.string().nonempty(),
  specVersion: z.uint32(),
})

// some nodes (e.g. the reset Paseo relay) serialize numbers as strings in system_properties
// (tokenDecimals: "10"), so coerce rather than require a JSON number.
const DotNetworkPropertiesSimple = z.object({
  tokenDecimals: z.coerce.number().optional().default(0),
  tokenSymbol: z.string().optional().default('Unit'),
})

const DotNetworkPropertiesArray = z.object({
  tokenDecimals: z.array(z.coerce.number()).nonempty(),
  tokenSymbol: z.array(z.string()).nonempty(),
})

const DotNetworkProperties = z.union([DotNetworkPropertiesSimple, DotNetworkPropertiesArray]).transform((val) => ({
  tokenDecimals: Array.isArray(val.tokenDecimals) ? val.tokenDecimals[0] : val.tokenDecimals,
  tokenSymbol: Array.isArray(val.tokenSymbol) ? val.tokenSymbol[0] : val.tokenSymbol,
}))

export const DotNetworkSpecsSchema = z.strictObject({
  id: z.string().nonempty(),
  name: z.string().nonempty(),
  isTestnet: z.literal(true).optional(),
  genesisHash: DotNetworkSchema.shape.genesisHash,
  properties: DotNetworkProperties,
  runtimeVersion: DotNetworkRuntimeVersionSchema,
})

export type DotNetworkSpecs = z.infer<typeof DotNetworkSpecsSchema>

export const DotNetworkSpecsFileSchema = z.array(DotNetworkSpecsSchema)
