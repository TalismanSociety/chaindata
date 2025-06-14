import { DotNetworkSchema, EthNetworkSchema } from '@talismn/chaindata'
import { z } from 'zod/v4'

import { KnownEthNetworkConfigSchema } from './KnownEthNetworkConfig'

export const KnownEthNetworkOverridesDef = z.strictObject({
  ...KnownEthNetworkConfigSchema.partial().shape,
  ...KnownEthNetworkConfigSchema.pick({ id: true }).shape,
  nativeCurrency: EthNetworkSchema.shape.nativeCurrency.partial().optional(),
})

export const KnownEthNetworksOverridesFileSchema = z.array(KnownEthNetworkOverridesDef)

export type KnownEthNetworkOverrides = z.infer<typeof KnownEthNetworkOverridesDef>
