import { readFile, writeFile } from 'node:fs/promises'

import prettier from 'prettier'
import { BaseError, TimeoutError, getContract } from 'viem'

import { erc20Abi } from '../erc20Abi'
import { getEvmNetworkClient } from '../getEvmNetworkClient'
import { Erc20TokenCache, TalismanEvmNetwork } from '../types'

const isCached = (tokenCache: Erc20TokenCache[], chainId: number, contractAddress: string) =>
  tokenCache.some((t) => t.chainId === chainId && t.contractAddress === contractAddress)

const updateTokenCache = async (
  tokenCache: Erc20TokenCache[],
  evmNetwork: TalismanEvmNetwork,
  contractAddress: string,
) => {
  const chainId = Number(evmNetwork.id)

  if (isCached(tokenCache, chainId, contractAddress)) return

  try {
    const client = getEvmNetworkClient(evmNetwork)
    const contract = getContract({
      address: contractAddress as `0x${string}`,
      abi: erc20Abi,
      publicClient: client,
    })
    const [symbol, decimals] = await Promise.all([contract.read.symbol(), contract.read.decimals()])

    tokenCache.push({
      chainId,
      contractAddress,
      symbol,
      decimals,
    })
  } catch (err) {
    if (err instanceof TimeoutError) {
      console.warn('Timeout on network:%s ', evmNetwork.name, evmNetwork.id)
      return null
    }
    const viemError = err as BaseError
    console.warn('Failed to fetch token info', {
      network: `${evmNetwork.name} (${evmNetwork.id})`,
      contractAddress,
      err: viemError.shortMessage ?? viemError.message,
    })
  }
}

export const fetchErc20TokenSymbols = async () => {
  const knownEvmNetworks = JSON.parse(await readFile('known-evm-networks.json', 'utf-8')) as TalismanEvmNetwork[]
  const tokensCache = JSON.parse(await readFile('known-evm-tokens-cache.json', 'utf-8')) as Erc20TokenCache[]

  const promises = knownEvmNetworks
    .filter((network) => network.balancesConfig?.['evm-erc20']?.tokens.length)
    .flatMap(
      (network) =>
        network.balancesConfig?.['evm-erc20']?.tokens
          .filter((token) => !isCached(tokensCache, Number(network.id), token.contractAddress))
          .map((token) => updateTokenCache(tokensCache, network, token.contractAddress)) ?? [],
    )

  await Promise.all(promises)

  tokensCache.sort((a, b) => {
    if (a.chainId !== b.chainId) return a.chainId - b.chainId
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol)
    return a.contractAddress.localeCompare(b.contractAddress)
  })

  await writeFile(
    'known-evm-tokens-cache.json',
    await prettier.format(JSON.stringify(tokensCache, null, 2), {
      parser: 'json',
    }),
  )
}
