import keyBy from 'lodash/keyBy'
import * as viemChains from 'viem/chains'

export const VIEM_CHAINS = keyBy(viemChains, (c) => String(c.id)) as Record<string, viemChains.Chain>

// exclude zora, which uses same id as Hyperliquid
delete VIEM_CHAINS['999']
