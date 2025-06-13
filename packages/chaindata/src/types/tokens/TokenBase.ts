import z from 'zod/v4'

export const TokenBase = z.object({
  id: z.string(),
  isTestnet: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  decimals: z.int().min(0),
  symbol: z.string().nonempty(),
  name: z.string(),
  logo: z.string().optional(),
  coingeckoId: z.string().optional(),
  networkId: z.string(),
  noDiscovery: z.boolean().optional(),
  mirrorOf: z.string().optional(),
})
export type TokenBase = z.infer<typeof TokenBase>
