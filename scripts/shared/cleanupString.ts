// trims and also removes NULL characters that can be found in bytes32 converted strings
export const cleanupString = (str: string) => str.replace(/\0/g, '').trim()
