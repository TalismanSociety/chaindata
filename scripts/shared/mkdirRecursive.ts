import { mkdir } from 'node:fs/promises'
import { join, sep } from 'node:path'

import { exists } from './exists'

// TODO: Replace `mkdirRecursive` with `mkdir(path, { recursive: true })` after this is fixed:
// https://github.com/oven-sh/bun/issues/4627#issuecomment-1732855199
export const mkdirRecursive = async (path: string) => {
  const splits = path.split(sep)
  for (const [index, split] of splits.entries()) {
    const directory = join(...splits.slice(0, index), split)

    if (await exists(directory)) continue
    await mkdir(directory)
  }
}
