import 'anylogger-loglevel'

import { cryptoWaitReady } from '@polkadot/util-crypto'
import { watCryptoWaitReady } from '@talismn/scale'
import startCase from 'lodash/startCase'
import loglevel from 'loglevel'

import { fetchExternalSteps } from './fetch-external/steps'

loglevel.setLevel('info')

// import { buildSteps } from './build/steps'
// const steps: Array<() => Promise<void>> = [
//   // update local data
//   ...fetchExternalSteps,

//   // update pub folder (use only for local testing, on github this will be run by the build script)
//   ...buildSteps
// ]

await Promise.all([
  // wait for `@polkadot/util-crypto` to be ready (it needs to load some wasm)
  cryptoWaitReady(),
  // wait for `@talismn/scale` to be ready (it needs to load some wasm)
  watCryptoWaitReady(),
])

for (const [index, executeStep] of fetchExternalSteps.entries()) {
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
