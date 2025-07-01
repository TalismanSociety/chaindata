import { writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { stringify as yamlify } from 'yaml'
import z from 'zod/v4'

import { mkdirRecursive } from './mkdirRecursive'
import { prettifyJson, prettifyYaml } from './prettify'
import { validate } from './validate'

type WriteJsonOptions<T> = {
  schema?: z.ZodType<T>
  format?: boolean
}

export const writeJsonFile = async <T>(
  filePath: string,
  data: unknown,
  opts: WriteJsonOptions<T> = {},
): Promise<void> => {
  opts = Object.assign({ format: true }, opts)

  if (!filePath.endsWith('.json')) throw new Error(`Invalid file extension for JSON file: ${filePath}`)

  if (opts.schema) data = validate(data, opts.schema, `${filePath} (before saving)`)

  await mkdirRecursive(dirname(filePath))

  writeFileSync(filePath, opts.format ? await prettifyJson(data) : JSON.stringify(data))

  console.debug(filePath, 'updated')
}

export const writeYamlFile = async <T>(
  filePath: string,
  data: unknown,
  opts: WriteJsonOptions<T> = {},
): Promise<void> => {
  opts = Object.assign({ format: true }, opts)

  if (!filePath.endsWith('.yaml')) throw new Error(`Invalid file extension for YAML file: ${filePath}`)

  if (opts.schema) data = validate(data, opts.schema, `${filePath} (before saving)`)

  await mkdirRecursive(dirname(filePath))

  writeFileSync(filePath, opts.format ? await prettifyYaml(data) : yamlify(data))

  console.debug(filePath, 'updated')
}
