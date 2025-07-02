import prettier from 'prettier'
import { stringify as yamlify } from 'yaml'

import { PRETTIER_CONFIG } from './constants'

export const prettifyJson = async (data: unknown) => {
  try {
    return await prettier.format(JSON.stringify(data, null, 2), {
      ...PRETTIER_CONFIG,
      parser: 'json',
    })
  } catch (cause) {
    // wrap error to prevent HUGE error messages
    throw new Error('Failed to prettify JSON', { cause })
  }
}

export const prettifyYaml = async (data: unknown) => {
  try {
    return await prettier.format(yamlify(data), {
      ...PRETTIER_CONFIG,
      parser: 'yaml',
    })
  } catch (cause) {
    // wrap error to prevent HUGE error messages
    throw new Error('Failed to prettify YAML', { cause })
  }
}
