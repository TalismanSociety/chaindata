import { FILE_KNOWN_EVM_ERC20_TOKENS_CACHE, FILE_KNOWN_EVM_NETWORKS } from '../../shared/constants'
import { KnownEthNetworkConfig, KnownEthNetworksFileSchema } from '../../shared/schemas'
import { Erc20TokenCache } from '../../shared/types'
import { parseJsonFile, writeJsonFile } from '../../shared/util'

export const updateKnownEvmErc20TokensFromCache = async () => {
  const knownEvmNetworks = parseJsonFile<KnownEthNetworkConfig[]>(FILE_KNOWN_EVM_NETWORKS, KnownEthNetworksFileSchema)
  const erc20TokensCache = parseJsonFile<Erc20TokenCache[]>(FILE_KNOWN_EVM_ERC20_TOKENS_CACHE)

  for (const network of knownEvmNetworks) {
    const chainId = Number(network.id)
    const cachedTokens = erc20TokensCache.filter((token) => token.chainId === chainId)

    for (const token of network.tokens?.['evm-erc20'] ?? []) {
      const cached = cachedTokens.find(
        (t) => t.chainId === chainId && t.contractAddress.toLowerCase() === token.contractAddress?.toLocaleLowerCase(),
      )
      if (cached) {
        token.symbol = cached.symbol || undefined
        token.decimals = cached.decimals || undefined
        token.name = cached.name || undefined
      }
    }
  }

  await writeJsonFile(FILE_KNOWN_EVM_NETWORKS, knownEvmNetworks, { schema: KnownEthNetworksFileSchema })
}
