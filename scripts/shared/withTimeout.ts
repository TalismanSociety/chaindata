import { throwAfter } from './throwAfter'

export const withTimeout = <T>(func: () => Promise<T>, timeout: number, msgPrefix?: string): Promise<T> =>
  Promise.race([func(), throwAfter(timeout, `${msgPrefix ? `${msgPrefix}:` : ''}Timeout after ${timeout}ms`)])
