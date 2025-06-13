import z from 'zod/v4'

import { EvmErc20TokenSchema } from './EvmErc20Token'
import { EvmNativeTokenSchema } from './EvmNativeToken'
import { EvmUniswapV2TokenSchema } from './EvmUniswapV2Token'
import { SubAssetsTokenSchema } from './SubstrateAssetsToken'
import { SubForeignAssetsTokenSchema } from './SubstrateForeignAssetsToken'
import { SubNativeTokenSchema } from './SubstrateNativeToken'
import { SubPsp22TokenSchema } from './SubstratePsp22Token'
import { SubTokensTokenSchema } from './SubstrateTokensToken'

/**
 * The `Token` sum type, which is a union of all of the possible `TokenTypes`.
 */
export const TokenSchema = z.discriminatedUnion('type', [
  EvmErc20TokenSchema,
  EvmNativeTokenSchema,
  EvmUniswapV2TokenSchema,
  SubAssetsTokenSchema,
  SubForeignAssetsTokenSchema,
  SubNativeTokenSchema,
  SubPsp22TokenSchema,
  SubTokensTokenSchema,
])
export type Token = z.infer<typeof TokenSchema>

export type TokenId = Token['id']

export type TokenType = Token['type']
