import { DotToken, isTokenOfPlatform, TokenOfPlatform, TokenSchema } from '@talismn/chaindata-provider'
import z from 'zod/v4'

// TODO use SolToken type from chaindata-provider when available
export const SolTokenSchema = TokenSchema.refine((t): t is TokenOfPlatform<'solana'> => isTokenOfPlatform(t, 'solana'))

export const SolTokensPreBuildFileSchema = z.array(SolTokenSchema)
