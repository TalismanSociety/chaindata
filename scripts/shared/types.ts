import { LegacyEvmNetwork } from '@talismn/chaindata-provider'

/** Represents a Chain from `chaindata.json` or `testnets-chaindata.json` */
export type ConfigChain = {
  id: string
  isTestnet?: boolean
  isDefault?: boolean
  name?: string
  themeColor?: string
  account?: string
  blockExplorerUrls?: string[]
  subscanUrl?: string
  chainspecQrUrl?: string
  latestMetadataQrUrl?: string
  overrideNativeTokenId?: string
  isUnknownFeeToken?: boolean
  feeToken?: string
  oldPrefix?: number
  rpcs?: string[]
  paraId?: number
  relay?: { id: string }
  balancesConfig?: Record<string, Record<string, unknown>>
  hasExtrinsicSignatureTypePrefix?: boolean
  registryTypes?: any
  signedExtensions?: any
  hasCheckMetadataHash?: boolean
}

/** Represents an EvmNetwork from `evm-networks.json` */
export type ConfigEvmNetwork = {
  id: string
  substrateChainId?: string
  name?: string
  logo?: string
  isDefault?: boolean
  forceScan?: boolean
  preserveGasEstimate?: boolean
  themeColor?: string
  isTestnet?: boolean
  explorerUrl?: string
  rpcs?: string[]
  icon?: string
  feeType?: LegacyEvmNetwork['feeType']
  l2FeeType?: LegacyEvmNetwork['l2FeeType']
  erc20aggregator?: LegacyEvmNetwork['erc20aggregator']
}

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
