import z from 'zod/v4'

export const CoingeckoOverrideSchema = z.strictObject({
  id: z.string().nonempty(),
  logo: z.string().nonempty().startsWith('./'),
})

export type CoingeckoOverride = z.infer<typeof CoingeckoOverrideSchema>

export const CoingeckoOverridesFileSchema = z.array(CoingeckoOverrideSchema)
