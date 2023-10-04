import startCase from 'lodash/startCase'

import { doSomeThings } from './fetch-external/steps/doSomeThings'
import { fetchKnownEvmNetworks } from './fetch-external/steps/fetchKnownEvmNetworks'

const steps: Array<() => Promise<void>> = [doSomeThings, fetchKnownEvmNetworks]

for (const [index, executeStep] of steps.entries()) {
  console.log(`Executing step ${index + 1}: ${startCase(executeStep.name)}`)
  await executeStep()
}

process.exit(0)
