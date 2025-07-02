import { PathLike } from 'node:fs'
import { access } from 'node:fs/promises'

export const exists = async (path: PathLike) =>
  await access(path)
    .then(() => true)
    .catch(() => false)
