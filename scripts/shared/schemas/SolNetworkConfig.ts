import { SolSplTokenConfigSchema } from '@talismn/balances'
import { NetworkBaseSchema, SolNetworkSchema } from '@talismn/chaindata-provider'
import { z } from 'zod/v4'

const SolTokensConfigSchema = z.strictObject({
  'sol-spl': z.array(SolSplTokenConfigSchema).optional(),
})

export const SolNetworkConfigSchema = z.strictObject({
  ...SolNetworkSchema.partial().shape,
  ...SolNetworkSchema.pick({ id: true, rpcs: true }).shape,
  nativeCurrency: NetworkBaseSchema.shape.nativeCurrency.partial().optional(),
  balancesConfig: SolNetworkSchema.shape.balancesConfig,
  tokens: SolTokensConfigSchema.optional(),
})

export const SolNetworksConfigFileSchema = z.array(SolNetworkConfigSchema)

export type SolNetworkConfig = z.infer<typeof SolNetworkConfigSchema>
