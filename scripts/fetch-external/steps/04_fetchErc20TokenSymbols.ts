import { readFile, writeFile } from 'node:fs/promises'

import prettier from 'prettier'
import { BaseError, TimeoutError, getContract } from 'viem'

import { Erc20TokenCache, TalismanEvmNetwork } from '../../shared/types'
import { erc20Abi } from '../erc20Abi'
import { getEvmNetworkClient } from '../getEvmNetworkClient'

const IGNORED_TOKENS = [
  { chainId: 1, contractAddress: '0x0d88ed6e74bbfd96b831231638b66c05571e824f' },
  { chainId: 1, contractAddress: '0xf56b164efd3cfc02ba739b719b6526a6fa1ca32a' },
  { chainId: 1, contractAddress: '0x9f284e1337a815fe77d2ff4ae46544645b20c5ff' },
  { chainId: 1, contractAddress: '0x9469d013805bffb7d3debe5e7839237e535ec483' },
  { chainId: 1, contractAddress: '0x431ad2ff6a9c365805ebad47ee021148d6f7dbe0' },
  { chainId: 1, contractAddress: '0xf1290473e210b2108a85237fbcd7b6eb42cc654f' },
  { chainId: 1, contractAddress: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2' },
  { chainId: 1, contractAddress: '0x8e0e57dcb1ce8d9091df38ec1bfc3b224529754a' },
  { chainId: 1, contractAddress: '0xfb559ce67ff522ec0b9ba7f5dc9dc7ef6c139803' },
  { chainId: 1, contractAddress: '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359' },
  { chainId: 1, contractAddress: '0xdcd85914b8ae28c1e62f1c488e1d968d5aaffe2b' },
  { chainId: 1, contractAddress: '0xa00744882684c3e4747faefd68d283ea44099d03' },
  { chainId: 1, contractAddress: '0x1da4858ad385cc377165a298cc2ce3fce0c5fd31' },
  { chainId: 1, contractAddress: '0xbdeb4b83251fb146687fa19d1c660f99411eefe3' },
  { chainId: 1, contractAddress: '0xc19b6a4ac7c7cc24459f08984bbd09664af17bd1' },
  { chainId: 56, contractAddress: '0x3e3b357061103dc040759ac7dceeaba9901043ad' },
  { chainId: 137, contractAddress: '0x8af78f0c818302164f73b2365fe152c2d1fe80e1' },
  { chainId: 137, contractAddress: '0xf4bb0ed25ac7bcc9c327b88bac5ca288a08ec41e' },
  { chainId: 295, contractAddress: '0x00000000000000000000000000000000001a88b2' },
  { chainId: 295, contractAddress: '0x000000000000000000000000000000000006f89a' },
  { chainId: 324, contractAddress: '0x47EF4A5641992A72CFd57b9406c9D9cefEE8e0C4/token-transfers' },
  { chainId: 42161, contractAddress: '0xafa5676a6ef790f08290dd4a45e0ec2a5cc5cdab' },
  { chainId: 3693, contractAddress: '0xc84d8d03aa41ef941721a4d77b24bb44d7c7ac55' },
]

const isCached = (tokenCache: Erc20TokenCache[], chainId: number, contractAddress: string) =>
  tokenCache.some((t) => t.chainId === chainId && t.contractAddress === contractAddress)

const updateTokenCache = async (
  tokenCache: Erc20TokenCache[],
  evmNetwork: TalismanEvmNetwork,
  contractAddress: string,
) => {
  const chainId = Number(evmNetwork.id)

  if (IGNORED_TOKENS.some((t) => t.chainId === chainId && t.contractAddress === contractAddress)) return

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
