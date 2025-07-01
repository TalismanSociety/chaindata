import { DotToken, TokenSchema } from '@talismn/chaindata-provider'
import z from 'zod/v4'

export const DotTokenSchema = TokenSchema.refine((t): t is DotToken => t.platform === 'polkadot')

export const DotTokensCacheFileSchema = z.array(DotTokenSchema)
