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

export type TalismanEvmNativeToken = {
  symbol: string
  coingeckoId?: string
  dcentName?: string
  decimals?: number
  mirrorOf?: string
}

export type TalismanEvmErc20Token = {
  symbol: string
  contractAddress: string
  decimals?: number
  coingeckoId?: string
  dcentName?: string
  isDefault?: boolean
}

export type TalismanEvmNetwork = {
  id: string
  name: string
  rpcs: Array<string>
  balancesConfig?: {
    'evm-native'?: TalismanEvmNativeToken
    'evm-erc20'?: {
      tokens: Array<TalismanEvmErc20Token>
    }
  }
  explorerUrl?: string
  substrateChainId?: string
  isTestNet?: boolean

  // TMP fields
  icon?: string
}

export type Erc20TokenCache = {
  chainId: number
  contractAddress: string
  symbol: string
  decimals: number
}

export type EvmNetworkIconCache = {
  icon: string
  etag: string
  path: string
}

export type CoingeckoAssetPlatform = {
  id: string
  chain_identifier: number | null
  name: string
  shortname: string
}

export type CoingeckoCoin = {
  id: string
  symbol: string
  name: string
  platforms: Record<string, string>
}

export type CoingeckoCoinDetails = CoingeckoCoin & {
  id: string
  symbol: string
  name: string
  platforms: Record<string, string>
  image: Record<'thumb' | 'small' | 'large', string>
}
