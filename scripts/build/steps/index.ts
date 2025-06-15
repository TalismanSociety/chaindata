import { cleanupOutputDir } from '../../shared/util'
import { buildConsolidatedData } from './buildConsolidatedData'
import { buildMiniMetadatasPolkadot } from './buildMiniMetadatasPolkadot'
import { buildNetworksEthereum } from './buildNetworksEthereum'
import { buildNetworksPolkadot } from './buildNetworksPolkadot'
import { buildTokensEthereum } from './buildTokensEthereum'
import { buildTokensPolkadot } from './buildTokensPolkadot'

// to provide better debugging experience, output of each step is now persisted in the output directory
export const buildSteps: Array<() => Promise<void>> = [
  cleanupOutputDir,

  buildTokensPolkadot,
  buildNetworksPolkadot,
  buildMiniMetadatasPolkadot,

  buildNetworksEthereum,
  buildTokensEthereum,

  // TODO identify duplicates in tokens and networks

  // TODO theme colors
  // TODO check novasama

  // TODO fix logo urls ?

  // TODO remove orphan tokens
  // TODO remove orphan substrateChainId ?
  // TODO check each network has an existing nativeTokenId

  buildConsolidatedData,

  // loadConfig,

  // addChains,
  // mergeChainsExtras,
  // addNovasamaMetadataPortalUrls,

  // addEvmNetworks,
  // removeInvalidErc20Tokens,
  // fixChainEvmNetworkRelations,

  // updateSortIndexes,

  // applyNativeTokenOverrides,
  // setTokenLogos,
  // addThemeColors,

  // writeChaindataIndex,
]
