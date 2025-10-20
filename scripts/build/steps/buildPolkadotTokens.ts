import { DotNetworkSchema, parseTokenId, Token, TokenId, TokenSchema } from '@talismn/chaindata-provider'
import { z } from 'zod/v4'

import { checkDuplicates } from '../../shared/checkDuplicates'
import {
  FILE_DOT_TOKENS_PREBUILD,
  FILE_INPUT_NETWORKS_POLKADOT,
  FILE_OUTPUT_NETWORKS_POLKADOT,
  FILE_OUTPUT_TOKENS_POLKADOT,
} from '../../shared/constants'
import { getTokenLogoUrl } from '../../shared/getLogoUrl'
import { parseJsonFile, parseYamlFile } from '../../shared/parseFile'
import { DotNetworkConfig, DotNetworksConfigFileSchema } from '../../shared/schemas'
import { DotTokensPreBuildFileSchema } from '../../shared/schemas/DotTokensPreBuild'
import { writeJsonFile } from '../../shared/writeFile'

export const buildPolkadotTokens = async () => {
  const dotTokensCache = parseJsonFile(FILE_DOT_TOKENS_PREBUILD, DotTokensPreBuildFileSchema)
  const dotNetworksConfig = parseYamlFile(FILE_INPUT_NETWORKS_POLKADOT, DotNetworksConfigFileSchema)
  const dotNetworks = parseJsonFile(FILE_OUTPUT_NETWORKS_POLKADOT, z.array(DotNetworkSchema))

  const dotTokens: Token[] = dotNetworks
    .flatMap((network) => dotTokensCache.filter((t) => t.networkId === network.id))
    .map((token) => {
      const networkConfig = dotNetworksConfig.find((n) => n.id === token.networkId)
      if (!networkConfig) return token
      const tokenConfig = findTokenConfigByTokenId(token.id, networkConfig)
      if (!tokenConfig) return token

      return Object.assign({}, token, tokenConfig)
    })
    .map((token) => ({
      ...token,
      // fix logo
      logo: getTokenLogoUrl(token.logo, token.coingeckoId, token.symbol),
    }))
    .sort((t1, t2) => t1.id.localeCompare(t2.id))

  checkDuplicates(dotTokens)

  await writeJsonFile(FILE_OUTPUT_TOKENS_POLKADOT, dotTokens, {
    schema: z.array(TokenSchema),
  })
}

const findTokenConfigByTokenId = (tokenId: TokenId, network: DotNetworkConfig) => {
  const parsed = parseTokenId(tokenId)
  switch (parsed.type) {
    case 'substrate-native':
      return network.nativeCurrency
    case 'substrate-assets':
      return network.tokens?.['substrate-assets']?.find((t) => t.assetId === parsed.assetId)
    case 'substrate-psp22':
      return network.tokens?.['substrate-psp22']?.find((t) => t.contractAddress === parsed.contractAddress)
    case 'substrate-tokens':
      return network.tokens?.['substrate-tokens']?.find((t) => t.onChainId === parsed.onChainId)
    case 'substrate-foreignassets':
      return network.tokens?.['substrate-foreignassets']?.find((t) => t.onChainId === parsed.onChainId)
    case 'substrate-hydration':
      return network.tokens?.['substrate-hydration']?.find((t) => t.onChainId === parsed.onChainId)
    case 'substrate-dtao':
      return network.tokens?.['substrate-dtao']?.find((t) => t.subnetId === parsed.subnetId)
    default:
      throw new Error(`Unknown token type: ${parsed.type} for tokenId: ${tokenId}`)
  }
}
