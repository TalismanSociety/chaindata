import { readFile, writeFile } from 'node:fs/promises'

import { PromisePool } from '@supercharge/promise-pool'
import prettier from 'prettier'
import { createClient, hexToNumber, http } from 'viem'

import { FILE_KNOWN_EVM_NETWORKS, FILE_KNOWN_EVM_NETWORKS_RPCS_CACHE } from '../../shared/constants'
import { ConfigEvmNetwork, EthereumListsChain, EvmNetworkRpcCache } from '../../shared/types'

const isValidRpc = (rpc: string) => rpc.startsWith('https://') && !rpc.includes('${')
const isActiveChain = (chain: EthereumListsChain) => !chain.status || chain.status !== 'deprecated'

export const fetchKnownEvmNetworks = async () => {
  const response = await fetch('https://chainid.network/chains.json')
  const chainsList = (await response.json()) as Array<EthereumListsChain>

  const knownEvmNetworks = chainsList
    .filter((chain) => !!chain.chainId)
    .filter(isActiveChain)
    .filter((chain) => chain.rpc.filter(isValidRpc).length)
    .map((chain) => {
      const evmNetwork: ConfigEvmNetwork = {
        id: chain.chainId.toString(),
        name: chain.name,
        rpcs: chain.rpc.filter(isValidRpc),
        icon: chain.icon,
      }

      const explorerUrl = chain.explorers?.[0]?.url
      if (explorerUrl) evmNetwork.explorerUrl = explorerUrl

      if (chain.nativeCurrency) {
        evmNetwork.balancesConfig = {
          'evm-native': {
            symbol: chain.nativeCurrency.symbol,
            decimals: chain.nativeCurrency.decimals,
          },
        }
      }

      if (
        chain.faucets.length ||
        chain.name.toLocaleLowerCase().includes('testnet') ||
        chain.rpc.some((rpc) => rpc.includes('testnet'))
      )
        evmNetwork.isTestnet = true

      return evmNetwork
    })

  const knownEvmNetworksRpcsCache = JSON.parse(
    await readFile(FILE_KNOWN_EVM_NETWORKS_RPCS_CACHE, 'utf-8'),
  ) as EvmNetworkRpcCache[]

  // yeet the 50 oldest entries in cache to force them to be retested
  knownEvmNetworksRpcsCache.sort((a, b) => a.timestamp - b.timestamp)
  knownEvmNetworksRpcsCache.splice(0, 50)

  // test RPCs : some have invalid SSL certificates, unresovable DNS, or don't exist anymore
  await PromisePool.withConcurrency(4)
    .for(knownEvmNetworks)
    .process(async (network): Promise<void> => {
      if (!network.rpcs) return

      const checkedRpcs = await Promise.all(
        network.rpcs.map(async (rpcUrl) => {
          const cached = knownEvmNetworksRpcsCache.find((c) => c.chainId === network.id && c.rpcUrl === rpcUrl)
          if (cached) return cached.isValid ? rpcUrl : null

          try {
            const client = createClient({ transport: http(rpcUrl, { retryCount: 0 }) })
            const hexChainId = await client.request({ method: 'eth_chainId' })
            const evmNetworkId = String(hexToNumber(hexChainId))
            const isValid = network.id === evmNetworkId
            knownEvmNetworksRpcsCache.push({ chainId: network.id, rpcUrl, isValid, timestamp: Date.now() })
            return isValid ? rpcUrl : null
          } catch (err) {
            // const anyError = err as any
            // console.log(
            //   "Invalid RPC for network '%s' : %s",
            //   network.name,
            //   rpcUrl,
            //   anyError?.shortMessage ?? anyError?.message ?? 'unknown error',
            // )
            knownEvmNetworksRpcsCache.push({ chainId: network.id, rpcUrl, isValid: false, timestamp: Date.now() })
            // ignore, consider invalid
            return null
          }
        }),
      )

      network.rpcs = checkedRpcs.filter(Boolean) as string[]
    })

  // sort by network then by rpc url
  knownEvmNetworksRpcsCache.sort((a, b) =>
    a.chainId !== b.chainId ? Number(a.chainId) - Number(b.chainId) : a.rpcUrl.localeCompare(b.rpcUrl),
  )

  await writeFile(
    FILE_KNOWN_EVM_NETWORKS_RPCS_CACHE,
    await prettier.format(JSON.stringify(knownEvmNetworksRpcsCache, null, 2), {
      parser: 'json',
    }),
  )

  const validNetworks = knownEvmNetworks
    .filter((network) => network.rpcs?.length)
    .sort((a, b) => Number(a.id) - Number(b.id))

  await writeFile(
    FILE_KNOWN_EVM_NETWORKS,
    await prettier.format(JSON.stringify(validNetworks, null, 2), {
      parser: 'json',
    }),
  )
}
