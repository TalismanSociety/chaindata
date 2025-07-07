import { checkEthereumRpcs } from './checkEthereumRpcs'
import { checkPolkadotRpcs } from './checkPolkadotRpcs'
import { fetchCoingeckoTokensLogos } from './fetchCoingeckoTokensLogos'
import { fetchDotNetworksMetadataExtracts } from './fetchDotNetworksMetadataExtracts'
import { fetchDotNetworksSpecs } from './fetchDotNetworksSpecs'
import { fetchDotTokens } from './fetchDotTokens'
// import { fetchErc20TokenDetails } from './fetchErc20TokenDetails'
import { fetchEthTokens } from './fetchEthTokens'
import { fetchKnownEvmNetworks } from './fetchKnownEvmNetworks'
import { fetchKnownEvmNetworksCoingeckoLogos } from './fetchKnownEvmNetworksCoingeckoLogos'
import { fetchKnownEvmNetworksLogos } from './fetchKnownEvmNetworksLogos'
import { fetchKnownEvmTokens } from './fetchKnownEvmTokens'
import { fetchNovasamaMetadataPortalUrls } from './fetchNovasamaMetadataPortalUrls'
// import { fetchUniswapv2TokenExtras } from './fetchUniswapv2TokenExtras'
// import { updateKnownEvmErc20TokensFromCache } from './updateKnownEvmErc20TokensFromCache'
import { validateConfigFiles } from './validateConfigFiles'

export const fetchExternalSteps: Array<() => Promise<void> | void> = [
  validateConfigFiles,
  fetchKnownEvmNetworks,
  checkPolkadotRpcs,
  checkEthereumRpcs,
  fetchKnownEvmNetworksCoingeckoLogos,
  fetchKnownEvmTokens,
  fetchKnownEvmNetworksLogos,
  fetchCoingeckoTokensLogos,
  fetchNovasamaMetadataPortalUrls,
  fetchDotNetworksSpecs,
  fetchDotNetworksMetadataExtracts,
  fetchDotTokens,
  fetchEthTokens,
]
