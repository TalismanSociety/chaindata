import { EthNetworkSchema } from '@talismn/chaindata-provider'
import { z } from 'zod/v4'

import { EthBalancesConfigTypes } from './shared'

export const EthNetworkConfigSchema = z.strictObject({
  ...EthNetworkSchema.partial().shape,
  ...EthNetworkSchema.pick({ id: true, rpcs: true }).shape,
  balancesConfig: z.partialRecord(EthBalancesConfigTypes, z.any()).optional(),
})

export const EthNetworksConfigFileSchema = z.array(EthNetworkConfigSchema)

export type EthNetworkConfig = z.infer<typeof EthNetworkConfigSchema>
