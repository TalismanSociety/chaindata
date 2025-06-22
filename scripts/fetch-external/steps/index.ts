import { checkEthereumRpcs } from './checkEthereumRpcs'
import { checkPolkadotRpcs } from './checkPolkadotRpcs'
import { fetchCoingeckoTokensLogos } from './fetchCoingeckoTokensLogos'
import { fetchDotNetworksMetadataExtracts } from './fetchDotNetworksMetadataExtracts'
import { fetchDotNetworksSpecs } from './fetchDotNetworksSpecs'
import { fetchDotTokens } from './fetchDotTokens'
import { fetchErc20TokenDetails } from './fetchErc20TokenDetails'
import { fetchKnownEvmNetworks } from './fetchKnownEvmNetworks'
import { fetchKnownEvmNetworksCoingeckoLogos } from './fetchKnownEvmNetworksCoingeckoLogos'
import { fetchKnownEvmNetworksLogos } from './fetchKnownEvmNetworksLogos'
import { fetchKnownEvmTokens } from './fetchKnownEvmTokens'
import { fetchNovasamaMetadataPortalUrls } from './fetchNovasamaMetadataPortalUrls'
import { fetchUniswapv2TokenExtras } from './fetchUniswapv2TokenExtras'
import { updateKnownEvmErc20TokensFromCache } from './updateKnownEvmErc20TokensFromCache'
import { validateConfigFiles } from './validateConfigFiles'

export const fetchExternalSteps: Array<() => Awaited<void>> = [
  validateConfigFiles,
  fetchKnownEvmNetworks,
  checkPolkadotRpcs,
  // checkEthereumRpcs, // WIP
  fetchKnownEvmNetworksCoingeckoLogos,
  fetchKnownEvmTokens,
  fetchErc20TokenDetails,
  updateKnownEvmErc20TokensFromCache,
  // NOTE: Put after the ERC20 steps, this one needs up-to-date erc20 coingeckoIds
  // It extracts them from known-evm-networks.json & known-evm-networks-overrides.json!
  fetchUniswapv2TokenExtras,
  fetchKnownEvmNetworksLogos,
  fetchCoingeckoTokensLogos,
  fetchNovasamaMetadataPortalUrls,
  fetchDotNetworksSpecs,
  fetchDotNetworksMetadataExtracts,
  fetchDotTokens,
]
