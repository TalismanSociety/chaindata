import { parseTokenId, SolNetworkSchema, type Token, type TokenId, TokenSchema } from '@talismn/chaindata-provider'
import { z } from 'zod/v4'

import { checkDuplicates } from '../../shared/checkDuplicates'
import {
  FILE_INPUT_NETWORKS_SOLANA,
  FILE_OUTPUT_NETWORKS_SOLANA,
  FILE_OUTPUT_TOKENS_SOLANA,
  FILE_SOL_TOKENS_PREBUILD,
} from '../../shared/constants'
import { getTokenLogoUrl } from '../../shared/getLogoUrl'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { type SolNetworkConfig, SolNetworksConfigFileSchema } from '../../shared/schemas'
import { SolTokensPreBuildFileSchema } from '../../shared/schemas/SolTokensPreBuild'
import { writeJsonFile } from '../../shared/writeFile'

export const buildSolanaTokens = async () => {
  const solTokensCache = parseJsonFile(FILE_SOL_TOKENS_PREBUILD, SolTokensPreBuildFileSchema)
  const solNetworksConfig = parseYamlFile(FILE_INPUT_NETWORKS_SOLANA, SolNetworksConfigFileSchema)
  const solNetworks = parseJsonFile(FILE_OUTPUT_NETWORKS_SOLANA, z.array(SolNetworkSchema))

  const solTokens: Token[] = solNetworks
    .flatMap((network) => solTokensCache.filter((t) => t.networkId === network.id))
    .map((token) => {
      const networkConfig = solNetworksConfig.find((n) => n.id === token.networkId)
      if (!networkConfig) return token
      const tokenConfig = findTokenConfigByTokenId(token.id, networkConfig)
      if (!tokenConfig) return token

      return Object.assign({}, token, { isDefault: true }, tokenConfig)
    })
    .map((token) => ({
      ...token,
      // fix logo
      logo: getTokenLogoUrl(token.logo, token.coingeckoId, token.symbol),
    }))
    .sort((t1, t2) => t1.id.localeCompare(t2.id))

  checkDuplicates(solTokens)
  checkDuplicateSolanaMintTokens(solTokens)

  await writeJsonFile(FILE_OUTPUT_TOKENS_SOLANA, solTokens, {
    schema: z.array(TokenSchema),
  })
}

const findTokenConfigByTokenId = (tokenId: TokenId, network: SolNetworkConfig) => {
  const parsed = parseTokenId(tokenId)
  switch (parsed.type) {
    case 'sol-native':
      return network.nativeCurrency
    case 'sol-spl':
      return network.tokens?.['sol-spl']?.find((t) => t.mintAddress === parsed.mintAddress)
    case 'sol-token2022':
      return network.tokens?.['sol-token2022']?.find((t) => t.mintAddress === parsed.mintAddress)
    default:
      throw new Error(`Unknown token type: ${parsed.type} for tokenId: ${tokenId}`)
  }
}

const checkDuplicateSolanaMintTokens = (tokens: Token[]) => {
  const tokensByNetworkAndMint = new Map<string, Token>()

  for (const token of tokens) {
    if (token.type !== 'sol-spl' && token.type !== 'sol-token2022') continue

    const key = `${token.networkId}:${token.mintAddress}`
    const previousToken = tokensByNetworkAndMint.get(key)
    if (previousToken) {
      throw new Error(
        `Duplicate Solana mint ${token.mintAddress} on ${token.networkId} as ${previousToken.type} and ${token.type}`,
      )
    }
    tokensByNetworkAndMint.set(key, token)
  }
}
