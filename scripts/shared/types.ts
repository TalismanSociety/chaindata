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

export type EthereumListsChain = {
  name: string
  chainId: number
  shortName: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpc: Array<string>
  faucets: Array<string>
  infoURL: string
  status?: 'active' | 'incubating' | 'deprecated'
  explorers?: Array<{ name: string; url: string; standard?: string }>
  icon?: string
}
