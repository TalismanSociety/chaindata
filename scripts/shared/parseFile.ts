import { readFileSync } from 'node:fs'

import { parse as parseYaml } from 'yaml'
import z from 'zod/v4'

import { validate } from './validate'

export const parseYamlFile = <T>(filePath: string, schema?: z.ZodType<T>): T => {
  if (!filePath.endsWith('.yaml') && !filePath.endsWith('.yml'))
    throw new Error(`Invalid file extension for YAML file: ${filePath}`)

  const data = parseYaml(readFileSync(filePath, 'utf-8')) as T

  return schema ? validate(data, schema, filePath) : data
}

export const parseJsonFile = <T>(filePath: string, schema?: z.ZodType<T>): T => {
  if (!filePath.endsWith('.json')) throw new Error(`Invalid file extension for JSON file: ${filePath}`)

  const data = JSON.parse(readFileSync(filePath, 'utf-8')) as T

  return schema ? validate(data, schema, filePath) : data
}
