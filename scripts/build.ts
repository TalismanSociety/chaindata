import startCase from 'lodash/startCase'

import { addChains } from './build/steps/addChains'
import { addEvmNetworks } from './build/steps/addEvmNetworks'
import { addThemeColors } from './build/steps/addThemeColors'
import { applyNativeTokenOverrides } from './build/steps/applyNativeTokenOverrides'
import { fetchChainsExtras } from './build/steps/fetchChainsExtras'
import { fixChainEvmNetworkRelations } from './build/steps/fixChainsEvmNetworkRelations'
import { loadConfig } from './build/steps/loadConfig'
import { setInvalidChainAndEvmNetworkLogosToUnknownLogo } from './build/steps/setInvalidChainAndEvmNetworkLogosToUnknownLogo'
import { setTokenLogos } from './build/steps/setTokenLogos'
import { updateSortIndexes } from './build/steps/updateSortIndexes'
import { writeChaindataIndex } from './build/steps/writeChaindataIndex'
import { cleanupOutputDir } from './build/util'

await cleanupOutputDir()

const steps: Array<() => Promise<void>> = [
  loadConfig,

  addChains,
  // fetchChainsExtras,

  addEvmNetworks,

  fixChainEvmNetworkRelations,

  updateSortIndexes,

  applyNativeTokenOverrides,
  setInvalidChainAndEvmNetworkLogosToUnknownLogo,
  setTokenLogos,
  addThemeColors,

  writeChaindataIndex,
]

for (const [index, executeStep] of steps.entries()) {
  console.log(`Executing step ${index + 1}: ${startCase(executeStep.name)}`)
  await executeStep()
}

// WsProvider keeps the thread open (╯°□°)╯︵ ┻━┻
// as a workaround, force kill it (with a successful exit status) when we're done building
process.exit(0)
