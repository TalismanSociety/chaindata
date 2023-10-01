import { sortChainsAndNetworks } from '../util'
import { sharedData } from './_sharedData'

export const updateSortIndexes = async () => {
  const { chains, evmNetworks } = sharedData

  sortChainsAndNetworks(chains, evmNetworks)
}
