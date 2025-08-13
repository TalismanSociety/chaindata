import { z } from 'zod/v4'

import { FILE_KNOWN_EVM_NETWORKS } from '../../shared/constants'
import { KnownEthNetworkConfig, KnownEthNetworkConfigSchema, KnownEthNetworksFileSchema } from '../../shared/schemas'
import { EthereumListsChain } from '../../shared/types'
import { VIEM_CHAINS } from '../../shared/viemChains'
import { writeJsonFile } from '../../shared/writeFile'

const IGNORED_CHAINS = [
  1313500, // Xerom, a dead project with malicious RPC url
  1200, // Cuckoo chain - can be un-ignored when https://github.com/MetaMask/eth-phishing-detect/issues/89066 closed
  1210, // Cuckoo testnet - as above
  728126428, // TRX - unsupported address format
  31337, // GoChain testnet - same ID as Anvil and Hardhat, which are both here to stay.

  128, // Huobi ECO Chain Mainnet - public RPCS are not working
  999, // This is currently used by Hyperliquid, but viem think its Zora goerli and ethereum-lists thinks its WanChain Testnet
]

const isValidRpcUrl = (rpcUrl: string) => {
  if (rpcUrl.includes('${')) return false // contains keys that need to be replaced

  try {
    const url = new URL(rpcUrl)
    if (url.protocol !== 'https:') return false
    if (url.hostname === '127.0.0.1') return false
    if (url.username || url.password) return false // contains credentials
    return true
  } catch {
    // can't parse
    return false
  }
}
const isActiveChain = (chain: EthereumListsChain) => !chain.status || chain.status !== 'deprecated'
const isAllowedChain = (chain: EthereumListsChain) => !IGNORED_CHAINS.includes(chain.chainId)

const validateNetwork = (network: { id: string }, networkSchema: z.ZodType<any>) => {
  const parsable = networkSchema.safeParse(network)
  if (!parsable.success) {
    console.error(parsable.error.message, { issues: parsable.error.issues, network })
    throw new Error(`Failed to parse network "${network.id}"`)
  }
}

export const fetchKnownEvmNetworks = async () => {
  const response = await fetch('https://chainid.network/chains.json')
  const chainsList = (await response.json()) as Array<EthereumListsChain>

  const knownEvmNetworks = chainsList
    .filter((chain) => !!chain.chainId)
    .filter(isAllowedChain)
    .filter(isActiveChain)
    .filter((chain) => chain.rpc.filter(isValidRpcUrl).length)
    .map((chain) => {
      const id = chain.chainId.toString()
      const viemChain = VIEM_CHAINS[id]
      const viemRpcs = viemChain?.rpcUrls?.default?.http ?? []

      const evmNetwork: Partial<KnownEthNetworkConfig> & { id: string } = {
        id: chain.chainId.toString(),
        name: chain.name,
        rpcs: chain.rpc.concat(...viemRpcs).filter(isValidRpcUrl),
        shortName: chain.shortName,
        icon: chain.icon,
      }

      const explorerUrl = chain.explorers?.[0]?.url
      if (explorerUrl) evmNetwork.blockExplorerUrls = [explorerUrl]

      evmNetwork.nativeCurrency = {
        symbol: chain.nativeCurrency.symbol,
        decimals: chain.nativeCurrency.decimals,
        name: chain.nativeCurrency.name,
      }

      const lowerName = chain.name.toLocaleLowerCase()

      if (
        chain.faucets.length ||
        lowerName.includes('testnet') ||
        lowerName.includes('goerli') ||
        lowerName.includes('sepolia') ||
        chain.rpc.some((rpc) => rpc.includes('testnet') || rpc.includes('goerli') || rpc.includes('sepolia'))
      )
        evmNetwork.isTestnet = true

      validateNetwork(evmNetwork, KnownEthNetworkConfigSchema)

      return evmNetwork
    })

  const validNetworks = knownEvmNetworks.sort((a, b) => Number(a.id) - Number(b.id))

  await writeJsonFile(FILE_KNOWN_EVM_NETWORKS, validNetworks, {
    schema: KnownEthNetworksFileSchema,
  })
}
