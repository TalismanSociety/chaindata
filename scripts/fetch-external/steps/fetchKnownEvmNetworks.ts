import { z } from 'zod/v4'

import { CHAINLIST_API_URL, FILE_INPUT_NETWORKS_ETHEREUM, FILE_KNOWN_EVM_NETWORKS } from '../../shared/constants'
import { parseYamlFile } from '../../shared/parseFile'
import {
  EthNetworksConfigFileSchema,
  KnownEthNetworkConfig,
  KnownEthNetworkConfigSchema,
  KnownEthNetworksFileSchema,
} from '../../shared/schemas'
import { ChainlistChain, ChainlistRpc } from '../../shared/types'
import { VIEM_CHAINS } from '../../shared/viemChains'
import { writeJsonFile } from '../../shared/writeFile'

const IGNORED_CHAINS = [
  1313500, // Xerom, a dead project with malicious RPC url
  1200, // Cuckoo chain - can be un-ignored when https://github.com/MetaMask/eth-phishing-detect/issues/89066 closed
  1210, // Cuckoo testnet - as above
  728126428, // TRX - unsupported address format
  31337, // GoChain testnet - same ID as Anvil and Hardhat, which are both here to stay.

  128, // Huobi ECO Chain Mainnet - public RPCS are not working
  999, // This is currently used by Hyperliquid, but viem thinks its Zora goerli and chainlist thinks its WanChain Testnet
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

const isActiveChain = (chain: ChainlistChain) => !chain.status || chain.status !== 'deprecated'
const isAllowedChain = (chain: ChainlistChain) => !IGNORED_CHAINS.includes(chain.chainId)

const validateNetwork = (network: { id: string }, networkSchema: z.ZodType<any>) => {
  const parsable = networkSchema.safeParse(network)
  if (!parsable.success) {
    console.error(parsable.error.message, { issues: parsable.error.issues, network })
    throw new Error(`Failed to parse network "${network.id}"`)
  }
}

/** Extract URL from chainlist RPC entry (can be string or object with url property) */
const getRpcUrl = (rpc: ChainlistRpc): string => (typeof rpc === 'string' ? rpc : rpc.url)

/** Get tracking level from chainlist RPC entry (default to undefined if not specified) */
const getRpcTracking = (rpc: ChainlistRpc): 'none' | 'limited' | 'yes' | undefined =>
  typeof rpc === 'string' ? undefined : rpc.tracking

/** Sort RPCs by privacy: none > limited > yes > unspecified */
const sortRpcsByPrivacy = (rpcs: ChainlistRpc[]): string[] => {
  const trackingOrder = { none: 0, limited: 1, yes: 2, undefined: 3 }

  return rpcs
    .filter((rpc) => isValidRpcUrl(getRpcUrl(rpc)))
    .sort((a, b) => {
      const trackingA = getRpcTracking(a)
      const trackingB = getRpcTracking(b)
      return (trackingOrder[trackingA ?? 'undefined'] ?? 3) - (trackingOrder[trackingB ?? 'undefined'] ?? 3)
    })
    .map(getRpcUrl)
}

/** Determine if chain is a testnet using chainlist's isTestnet flag with heuristic fallback */
const isTestnetChain = (chain: ChainlistChain): boolean => {
  // Use chainlist's explicit flag if available
  if (chain.isTestnet !== undefined) return chain.isTestnet

  // Fallback to heuristics
  const lowerName = chain.name.toLocaleLowerCase()
  if (chain.faucets?.length) return true
  if (lowerName.includes('testnet') || lowerName.includes('goerli') || lowerName.includes('sepolia')) return true

  const rpcUrls = chain.rpc.map(getRpcUrl)
  if (rpcUrls.some((rpc) => rpc.includes('testnet') || rpc.includes('goerli') || rpc.includes('sepolia'))) return true

  return false
}

export const fetchKnownEvmNetworks = async () => {
  console.log('Fetching EVM networks from chainlist...')
  const response = await fetch(CHAINLIST_API_URL)
  const chainsList = (await response.json()) as Array<ChainlistChain>
  console.log(`Fetched ${chainsList.length} chains from chainlist`)

  const knownEvmNetworks = chainsList
    .filter((chain) => !!chain.chainId)
    .filter(isAllowedChain)
    .filter(isActiveChain)
    .filter((chain) => chain.rpc.some((rpc) => isValidRpcUrl(getRpcUrl(rpc))))
    .map((chain) => {
      const id = chain.chainId.toString()
      const viemChain = VIEM_CHAINS[id]
      const viemRpcs = viemChain?.rpcUrls?.default?.http ?? []

      // Sort chainlist RPCs by privacy, then append viem RPCs
      const chainlistRpcs = sortRpcsByPrivacy(chain.rpc)
      const allRpcs = [...new Set([...chainlistRpcs, ...viemRpcs.filter(isValidRpcUrl)])]

      // Icon can be a string name or an object with url - only use string names
      const icon = typeof chain.icon === 'string' ? chain.icon : undefined

      const evmNetwork: Partial<KnownEthNetworkConfig> & { id: string } = {
        id,
        name: chain.name,
        rpcs: allRpcs,
        shortName: chain.shortName,
        icon,
        chainSlug: chain.chainSlug,
      }

      const explorerUrl = chain.explorers?.[0]?.url
      if (explorerUrl) {
        // Ensure the URL has a protocol prefix
        const normalizedUrl = explorerUrl.startsWith('http') ? explorerUrl : `https://${explorerUrl}`
        evmNetwork.blockExplorerUrls = [normalizedUrl]
      }

      evmNetwork.nativeCurrency = {
        symbol: chain.nativeCurrency.symbol,
        decimals: chain.nativeCurrency.decimals,
        name: chain.nativeCurrency.name,
      }

      if (isTestnetChain(chain)) evmNetwork.isTestnet = true

      validateNetwork(evmNetwork, KnownEthNetworkConfigSchema)

      return evmNetwork
    })

  // Add networks from manual config that are missing in chainlist (e.g. hyperliquid)
  // YAML entries without full definitions (rpcs, nativeCurrency) are just overrides for chainlist data
  // If the network isn't in chainlist, those override-only entries can be discarded
  const manualEvmNetworks = parseYamlFile(FILE_INPUT_NETWORKS_ETHEREUM, EthNetworksConfigFileSchema)
  const knownNetworkIds = knownEvmNetworks.map((network) => network.id)
  for (const network of manualEvmNetworks.filter((n) => !knownNetworkIds.includes(n.id))) {
    // Skip override-only entries (no rpcs or incomplete nativeCurrency)
    if (!network.rpcs?.length || !network.nativeCurrency?.symbol || !network.nativeCurrency?.decimals) {
      continue
    }

    const parsed = KnownEthNetworkConfigSchema.safeParse({
      id: network.id,
      name: network.name,
      isTestnet: network.isTestnet,
      isDefault: network.isDefault,
      nativeCurrency: network.nativeCurrency,
      rpcs: network.rpcs,
    })
    if (parsed.success) {
      console.log(
        'Adding known network %s - %s from manual config (missing in chainlist)',
        parsed.data.id,
        parsed.data.name,
      )
      knownEvmNetworks.push(parsed.data)
    } else console.warn('Failed to parse network', network.id, parsed.error)
  }

  const validNetworks = knownEvmNetworks.sort((a, b) => Number(a.id) - Number(b.id))
  console.log(`Writing ${validNetworks.length} known EVM networks`)

  await writeJsonFile(FILE_KNOWN_EVM_NETWORKS, validNetworks, {
    schema: KnownEthNetworksFileSchema,
  })
}
