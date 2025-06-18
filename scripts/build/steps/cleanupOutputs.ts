import fs from 'node:fs'

import { DIR_OUTPUT } from '../../shared/constants'

const FILES_TO_KEEP = ['chaindata.json', 'chaindata.min.json']

export const cleanupOutputs = () => {
  const files = fs.readdirSync(DIR_OUTPUT)
  for (const file of files.filter((file) => !FILES_TO_KEEP.includes(file)))
    fs.rmSync(`${DIR_OUTPUT}/${file}`, { recursive: true, force: true })
}
