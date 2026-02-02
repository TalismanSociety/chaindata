export type MetadataPortalUrls = Array<{
  id: string
  isTestnet: boolean
  meta: {
    name: string
    title: string
  }
  urls: {
    chainspecQrUrl: string
    latestMetadataQrUrl: string
  }
}>

export type ChainlistRpc = string | { url: string; tracking?: 'none' | 'limited' | 'yes'; trackingDetails?: string }

export type ChainlistChain = {
  name: string
  chainId: number
  networkId?: number
  shortName: string
  chain: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpc: Array<ChainlistRpc>
  faucets: Array<string>
  infoURL: string
  status?: 'active' | 'incubating' | 'deprecated'
  explorers?: Array<{ name: string; url: string; standard?: string; icon?: string }>
  icon?: string
  features?: Array<{ name: string }>
  parent?: { type: string; chain: string; bridges?: Array<{ url: string }> }
  slip44?: number
  tvl?: number
  chainSlug?: string
  isTestnet?: boolean
}
