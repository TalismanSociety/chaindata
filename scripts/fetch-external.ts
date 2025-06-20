import 'anylogger-loglevel'

import { cryptoWaitReady } from '@polkadot/util-crypto'
import startCase from 'lodash/startCase'
import loglevel from 'loglevel'

import { fetchExternalSteps } from './fetch-external/steps'
import { logDuration } from './shared/util'

// set loglevel for @talismn/* libraries
loglevel.setLevel('info')

const stop = logDuration('fetch-external')

// TODO check if this is still necessary
await cryptoWaitReady()

for (const [index, executeStep] of fetchExternalSteps.entries()) {
  console.log(`Executing step ${index + 1}: ${startCase(executeStep.name)}`)

  const stop = logDuration(`step ${index + 1} ${startCase(executeStep.name)}`)

  await executeStep()

  stop()
}

stop()

process.exit(0)
