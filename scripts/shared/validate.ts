import z, { ZodError } from 'zod/v4'

export const validate = <T>(data: unknown, schema: z.ZodType<T>, label: string): T => {
  const result = schema.safeParse(data)
  if (!result.success) {
    console.error('Failed to validate', label)
    console.error(result.error)
    throw new Error('Invalid data')
  }
  return result.data
}

/**
 * Outputs the data to the console if validation fails, useful for debugging
 */
export const validateDebug = <T>(data: T, schema: z.ZodType<T>, label: string): T => {
  try {
    return schema.parse(data)
  } catch (err) {
    console.error('Failed to validate %s:', label, data)
    console.error(err as ZodError)
    throw new Error(`Invalid data for ${label}`)
  }
}
