import { cryptoWaitReady } from '@polkadot/util-crypto'
import { watCryptoWaitReady } from '@talismn/scale'
import startCase from 'lodash/startCase'

import { fetchCoingeckoTokensLogos } from './fetch-external/steps/fetchCoingeckoTokensLogos'
import { fetchErc20TokenSymbols } from './fetch-external/steps/fetchErc20TokenSymbols'
import { fetchKnownEvmNetworks } from './fetch-external/steps/fetchKnownEvmNetworks'
import { fetchKnownEvmNetworksLogos } from './fetch-external/steps/fetchKnownEvmNetworksLogos'
import { fetchKnownEvmTokens } from './fetch-external/steps/fetchKnownEvmTokens'
import { updateChainsExtrasCache } from './fetch-external/steps/updateChainsExtrasCache'
import { updateKnownEvmTokensFromCache } from './fetch-external/steps/updateKnownEvmTokensFromCache'

const steps: Array<() => Promise<void>> = [
  fetchKnownEvmNetworks,
  fetchKnownEvmTokens,
  fetchErc20TokenSymbols,
  updateKnownEvmTokensFromCache,
  fetchKnownEvmNetworksLogos,
  fetchCoingeckoTokensLogos,
  updateChainsExtrasCache,
]

await Promise.all([
  // wait for `@polkadot/util-crypto` to be ready (it needs to load some wasm)
  cryptoWaitReady(),
  // wait for `@talismn/scale` to be ready (it needs to load some wasm)
  watCryptoWaitReady(),
])

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
