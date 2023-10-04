import { readFile, writeFile } from 'node:fs/promises'

import prettier from 'prettier'

import { CachedErc20Token, TalismanEvmNetwork } from '../types'

export const updateKnownEvmTokensFromCache = async () => {
  const knownEvmNetworks = JSON.parse(await readFile('known-evm-networks.json', 'utf-8')) as TalismanEvmNetwork[]
  const tokensCache = JSON.parse(await readFile('known-evm-tokens-cache.json', 'utf-8')) as CachedErc20Token[]

  for (const network of knownEvmNetworks) {
    const chainId = Number(network.id)
    const cachedTokens = tokensCache.filter((token) => token.chainId === chainId)

    if (network.balancesConfig?.['evm-erc20']?.tokens)
      for (const token of network.balancesConfig?.['evm-erc20']?.tokens) {
        const cached = cachedTokens.find((t) => t.chainId === chainId && t.contractAddress === token.contractAddress)
        if (cached) {
          token.symbol = cached.symbol
          token.decimals = cached.decimals
        }
      }
  }

  await writeFile(
    'known-evm-networks.json',
    await prettier.format(JSON.stringify(knownEvmNetworks, null, 2), {
      parser: 'json',
    }),
  )
}
