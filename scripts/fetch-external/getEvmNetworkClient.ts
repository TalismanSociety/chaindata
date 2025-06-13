import { Chain, createPublicClient, defineChain, fallback, http, PublicClient } from 'viem'
import * as chains from 'viem/chains'

import { ConfigEvmNetwork } from '../shared/types'

// initialize with viem chains, to benefit from multicall config
const ALL_CHAINS = Object.keys(chains).reduce(
  (acc, curr) => {
    const chain = chains[curr as keyof typeof chains]
    acc[chain.id] = chain
    return acc
  },
  {} as Record<number, Chain>,
)

// create clients as needed, to prevent unnecessary health checks
const CLIENT_CACHE: Record<number, PublicClient> = {}

export const getEvmNetworkClient = (evmNetwork: ConfigEvmNetwork): PublicClient => {
  const chainId = Number(evmNetwork.id)

  if (CLIENT_CACHE[chainId]) return CLIENT_CACHE[chainId]

  // define chain if it doesn't exist
  if (!ALL_CHAINS[chainId]) {
    const symbol = evmNetwork.balancesConfig?.['evm-native']?.symbol ?? 'ETH'
    const decimals = evmNetwork.balancesConfig?.['evm-native']?.decimals ?? 18

    ALL_CHAINS[chainId] = defineChain({
      id: chainId,
      name: evmNetwork.name ?? '',
      network: evmNetwork.name ?? '',
      rpcUrls: {
        public: { http: evmNetwork.rpcs ?? [] },
        default: { http: evmNetwork.rpcs ?? [] },
      },
      nativeCurrency: {
        symbol,
        decimals,
        name: symbol,
      },
    })
  }

  const chain = ALL_CHAINS[chainId]

  if (!CLIENT_CACHE[chainId]) {
    const transport = chain.contracts?.multicall3
      ? http()
      : fallback((evmNetwork.rpcs ?? []).map((rpc) => http(rpc, { batch: { wait: 25 } })))
    const batch = chain.contracts?.multicall3 ? { multicall: { wait: 25 } } : undefined

    CLIENT_CACHE[chainId] = createPublicClient({ chain, transport, batch })
  }

  return CLIENT_CACHE[chainId]
}
