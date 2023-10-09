import startCase from 'lodash/startCase'

import { fetchKnownEvmNetworks } from './fetch-external/steps/01_fetchKnownEvmNetworks'
import { fetchKnownEvmTokens } from './fetch-external/steps/02_fetchKnownEvmTokens'
import { fetchErc20TokenSymbols } from './fetch-external/steps/03_fetchErc20TokenSymbols'
import { updateKnownEvmTokensFromCache } from './fetch-external/steps/04_updateKnownEvmTokensFromCache'
import { fetchKnownEvmNetworksLogos } from './fetch-external/steps/05_fetchKnownEvmNetworksLogos'
import { fetchKnownEvmTokensLogos } from './fetch-external/steps/06_fetchKnownEvmTokensLogos'

const steps: Array<() => Promise<void>> = [
  fetchKnownEvmNetworks,
  fetchKnownEvmTokens,
  fetchErc20TokenSymbols,
  updateKnownEvmTokensFromCache,
  fetchKnownEvmNetworksLogos,
  fetchKnownEvmTokensLogos,
]

for (const [index, executeStep] of steps.entries()) {
  console.log(`Executing step ${index + 1} - ${startCase(executeStep.name)}`)
  const start = process.hrtime()
  await executeStep()
  const stop = process.hrtime(start)
  console.log(
    `Completed step ${index + 1} - ${startCase(executeStep.name)} : ${((stop[0] * 1e9 + stop[1]) / 1e9).toFixed(
      2,
    )} seconds`,
  )
}

process.exit(0)
