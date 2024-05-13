import { readFile, writeFile } from 'node:fs/promises'

import prettier from 'prettier'

import { FILE_KNOWN_EVM_ERC20_TOKENS_CACHE, FILE_KNOWN_EVM_NETWORKS, PRETTIER_CONFIG } from '../../shared/constants'
import { ConfigEvmNetwork, Erc20TokenCache } from '../../shared/types'

export const updateKnownEvmErc20TokensFromCache = async () => {
  const knownEvmNetworks: ConfigEvmNetwork[] = JSON.parse(await readFile(FILE_KNOWN_EVM_NETWORKS, 'utf-8'))
  const erc20TokensCache: Erc20TokenCache[] = JSON.parse(await readFile(FILE_KNOWN_EVM_ERC20_TOKENS_CACHE, 'utf-8'))

  for (const network of knownEvmNetworks) {
    const chainId = Number(network.id)
    const cachedTokens = erc20TokensCache.filter((token) => token.chainId === chainId)

    if (network.balancesConfig?.['evm-erc20']?.tokens)
      for (const token of network.balancesConfig?.['evm-erc20']?.tokens) {
        const cached = cachedTokens.find(
          (t) =>
            t.chainId === chainId && t.contractAddress.toLowerCase() === token.contractAddress?.toLocaleLowerCase(),
        )
        if (token.symbol === 'BEANS') console.debug('BEANS token (debug):', { token, cached })
        if (cached) {
          token.symbol = cached.symbol
          token.decimals = cached.decimals
        }
      }
  }

  await writeFile(
    FILE_KNOWN_EVM_NETWORKS,
    await prettier.format(JSON.stringify(knownEvmNetworks, null, 2), {
      ...PRETTIER_CONFIG,
      parser: 'json',
    }),
  )
}
