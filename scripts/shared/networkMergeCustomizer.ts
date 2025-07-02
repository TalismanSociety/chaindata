/** Used to merge `known-evm-networks-overrides.json` into `known-evm-networks.json` */
export const networkMergeCustomizer = (objValue: any, srcValue: any, key: string, object: any, source: any): any => {
  // override everything except balanceConfig["evm-erc20"].tokens, which must be added one by one
  if (Array.isArray(objValue)) {
    // TODO support overriding properties on array items, such as forcing a coingeckoId for one token
    return objValue.concat(srcValue)
  }
}
