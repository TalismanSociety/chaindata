import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { DIR_OUTPUT } from './constants'
import { pushToFileList } from './fileList'
import { mkdirRecursive } from './mkdirRecursive'

// write file (first ensures file directory exists, and also adds file path to `fileList`)
export const writeChaindataFile = async (destination: string, content: string) => {
  const fullDestination = join(DIR_OUTPUT, destination)

  const directory = dirname(fullDestination)
  await mkdirRecursive(directory)

  pushToFileList(destination)
  await writeFile(fullDestination, content)
}
