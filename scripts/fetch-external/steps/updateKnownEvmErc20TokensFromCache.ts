import { FILE_KNOWN_EVM_ERC20_TOKENS_CACHE, FILE_KNOWN_EVM_NETWORKS } from '../../shared/constants'
import { ConfigEvmNetwork, Erc20TokenCache } from '../../shared/types.legacy'
import { KnownEthNetworksFileSchema } from '../../shared/types.v4'
import { parseJsonFile, writeJsonFile } from '../../shared/util'

export const updateKnownEvmErc20TokensFromCache = async () => {
  const knownEvmNetworks = parseJsonFile<ConfigEvmNetwork[]>(FILE_KNOWN_EVM_NETWORKS)
  const erc20TokensCache = parseJsonFile<Erc20TokenCache[]>(FILE_KNOWN_EVM_ERC20_TOKENS_CACHE)

  for (const network of knownEvmNetworks) {
    const chainId = Number(network.id)
    const cachedTokens = erc20TokensCache.filter((token) => token.chainId === chainId)

    if (network.balancesConfig?.['evm-erc20']?.tokens)
      for (const token of network.balancesConfig?.['evm-erc20']?.tokens) {
        const cached = cachedTokens.find(
          (t) =>
            t.chainId === chainId && t.contractAddress.toLowerCase() === token.contractAddress?.toLocaleLowerCase(),
        )
        if (cached) {
          token.symbol = cached.symbol
          token.decimals = cached.decimals
          token.name = token.name || cached.name // feels better to keep the name from coingecko if available
        }
      }
  }

  await writeJsonFile(FILE_KNOWN_EVM_NETWORKS, knownEvmNetworks, { schema: KnownEthNetworksFileSchema, format: true })
}
