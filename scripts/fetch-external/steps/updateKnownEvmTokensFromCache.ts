import { readFile, writeFile } from 'node:fs/promises'

import prettier from 'prettier'

import { FILE_KNOWN_EVM_NETWORKS, FILE_KNOWN_EVM_TOKENS_CACHE } from '../../shared/constants'
import { Erc20TokenCache, TalismanEvmNetwork } from '../../shared/types'

export const updateKnownEvmTokensFromCache = async () => {
  const knownEvmNetworks = JSON.parse(await readFile(FILE_KNOWN_EVM_NETWORKS, 'utf-8')) as TalismanEvmNetwork[]
  const tokensCache = JSON.parse(await readFile(FILE_KNOWN_EVM_TOKENS_CACHE, 'utf-8')) as Erc20TokenCache[]

  for (const network of knownEvmNetworks) {
    const chainId = Number(network.id)
    const cachedTokens = tokensCache.filter((token) => token.chainId === chainId)

    if (network.balancesConfig?.['evm-erc20']?.tokens)
      for (const token of network.balancesConfig?.['evm-erc20']?.tokens) {
        const cached = cachedTokens.find(
          (t) => t.chainId === chainId && t.contractAddress.toLowerCase() === token.contractAddress.toLocaleLowerCase(),
        )
        if (token.symbol === 'BEANS') console.log({ token, cached })
        if (cached) {
          token.symbol = cached.symbol
          token.decimals = cached.decimals
        }
      }
  }

  await writeFile(
    FILE_KNOWN_EVM_NETWORKS,
    await prettier.format(JSON.stringify(knownEvmNetworks, null, 2), {
      parser: 'json',
    }),
  )
}
