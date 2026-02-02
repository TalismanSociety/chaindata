import { EthNetworkSchema } from '@talismn/chaindata-provider'
import { z } from 'zod/v4'

import { EthNetworkConfigSchema } from './EthNetworkConfig'

export const KnownEthNetworkConfigSchema = z.strictObject({
  ...EthNetworkConfigSchema.partial().shape,
  ...EthNetworkSchema.pick({ id: true, rpcs: true, nativeCurrency: true }).shape,
  icon: z.string().optional(),
  shortName: z.string().optional(),
  chainSlug: z.string().optional(),
})

export type KnownEthNetworkConfig = z.infer<typeof KnownEthNetworkConfigSchema>

export const KnownEthNetworksFileSchema = z.array(KnownEthNetworkConfigSchema)
