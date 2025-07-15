import { DotToken, EthToken, TokenSchema } from '@talismn/chaindata-provider'
import z from 'zod/v4'

export const EthTokenSchema = TokenSchema.refine((t): t is EthToken => t.platform === 'ethereum')

export const EthTokensPreBuildFileSchema = z.array(EthTokenSchema)
