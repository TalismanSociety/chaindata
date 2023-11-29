import startCase from 'lodash/startCase'

import { buildSteps } from './build/steps'

for (const [index, executeStep] of buildSteps.entries()) {
  console.log(`Executing step ${index + 1}: ${startCase(executeStep.name)}`)
  await executeStep()
}

// WsProvider keeps the thread open (╯°□°)╯︵ ┻━┻
// as a workaround, force kill it (with a successful exit status) when we're done building
process.exit(0)
