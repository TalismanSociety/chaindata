import { exists, mkdir, rm } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { DIR_OUTPUT } from './constants'

// Can be used for nicer vscode syntax highlighting & auto formatting
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#raw_strings
export const html = (strings: readonly string[], ...substitutions: any[]) =>
  String.raw({ raw: strings }, ...substitutions)

export const cleanupOutputDir = async () =>
  await rm(DIR_OUTPUT, { recursive: true, force: true })

// keep track of written files, so we can provide links from an index page
const fileList: string[] = []
export const getFileList = () => fileList.slice() // return a copy

// write file (first ensures file directory exists, and also adds file path to `fileList`)
export const writeFile = async (destination: string, content: string) => {
  const fullDestination = join(DIR_OUTPUT, destination)

  const directory = dirname(fullDestination)
  await mkdirRecursive(directory)

  fileList.push(destination)
  await Bun.write(fullDestination, content)
}

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
