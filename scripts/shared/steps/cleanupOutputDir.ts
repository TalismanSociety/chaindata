import { rm } from 'node:fs/promises'

import { DIR_OUTPUT } from '../constants'

export const cleanupOutputDir = async () => await rm(DIR_OUTPUT, { recursive: true, force: true })
