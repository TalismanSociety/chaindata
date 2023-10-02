import startCase from 'lodash/startCase'

import { doSomeThings } from './fetch-external/steps/doSomeThings'

const steps: Array<() => Promise<void>> = [doSomeThings]

for (const [index, executeStep] of steps.entries()) {
  console.log(`Executing step ${index + 1}: ${startCase(executeStep.name)}`)
  await executeStep()
}

process.exit(0)
