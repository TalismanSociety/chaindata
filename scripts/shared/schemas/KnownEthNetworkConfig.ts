import { EthNetworkSchema } from '@talismn/chaindata-provider'
import { z } from 'zod/v4'

import { EthNetworkConfigSchema } from './EthNetworkConfig'
import { EthBalancesConfigTypes } from './shared'

export const KnownEthNetworkConfigSchema = z.strictObject({
  ...EthNetworkSchema.partial().shape,
  ...EthNetworkSchema.pick({ id: true, rpcs: true }).shape,
  nativeCurrency: EthNetworkSchema.shape.nativeCurrency,
  icon: z.string().optional(),
  balancesConfig: EthNetworkConfigSchema.shape.balancesConfig,
  tokens: EthNetworkConfigSchema.shape.tokens,
})

export type KnownEthNetworkConfig = z.infer<typeof KnownEthNetworkConfigSchema>

export const KnownEthNetworksFileSchema = z.array(KnownEthNetworkConfigSchema)
