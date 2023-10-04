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
}

export type CachedErc20Token = {
  chainId: number
  contractAddress: string
  symbol: string
  decimals: number
}
