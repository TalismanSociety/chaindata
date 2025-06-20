import { DotToken, Token, TokenSchema } from '@talismn/chaindata-provider'
import z from 'zod/v4'

export const DotTokenSchema = TokenSchema.refine((t): t is DotToken => t.platform === 'polkadot')

// schema refine is only a runtime check, DotToken type needs to be extracted
// export type DotToken = Extract<z.infer<typeof DotTokenSchema>, { platform: 'polkadot' }>

export const DotTokensCacheFileSchema = z.array(DotTokenSchema)
