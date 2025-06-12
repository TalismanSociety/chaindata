import 'anylogger-loglevel'

import { cryptoWaitReady } from '@polkadot/util-crypto'
import startCase from 'lodash/startCase'
import loglevel from 'loglevel'

import { fetchExternalSteps } from './fetch-external/steps'

// set loglevel for @talismn/* libraries
loglevel.setLevel('info')

// TODO check if this is still necessary
await cryptoWaitReady()

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
