import 'anylogger-loglevel'

import { cryptoWaitReady } from '@polkadot/util-crypto'
import startCase from 'lodash/startCase'
import loglevel from 'loglevel'

import { fetchExternalSteps } from './fetch-external/steps'
import { logDuration } from './shared/logDuration'

// set loglevel for @talismn/* libraries
loglevel.setLevel('info')

// Parse --steps argument to filter which steps to run
const stepsArg = process.argv.find((arg) => arg.startsWith('--steps=') || arg === '--steps')
let stepsToRun: string[] | null = null
if (stepsArg) {
  const stepsIndex = process.argv.indexOf(stepsArg)
  const stepsValue = stepsArg.includes('=') ? stepsArg.split('=')[1] : process.argv[stepsIndex + 1]
  if (stepsValue) {
    stepsToRun = stepsValue.split(',').map((s) => s.trim().toLowerCase())
    console.log(`Filtering to steps: ${stepsToRun.join(', ')}`)
  }
}

const stop = logDuration('fetch-external')

// TODO check if this is still necessary
await cryptoWaitReady()

for (const [index, executeStep] of fetchExternalSteps.entries()) {
  // Skip steps if --steps filter is provided and this step doesn't match
  if (stepsToRun && !stepsToRun.some((s) => executeStep.name.toLowerCase().includes(s))) {
    continue
  }

  console.log(`Executing step ${index + 1}: ${startCase(executeStep.name)}`)

  const stop = logDuration(`step ${index + 1} ${startCase(executeStep.name)}`)

  await executeStep()

  stop()
}

stop()

process.exit(0)
