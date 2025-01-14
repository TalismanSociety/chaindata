import fs from 'fs'
import path from 'path'

const FILEPATH_PUBLISHED_CHAINS = path.join(path.resolve('./pub/v2/chains/all.json'))
const FILEPATH_CHAINDATA_CHAINS = path.join(path.resolve('./data/chaindata.json'))

const publishedChainsAll = JSON.parse(fs.readFileSync(FILEPATH_PUBLISHED_CHAINS, 'utf8'))
const chaindata = JSON.parse(fs.readFileSync(FILEPATH_CHAINDATA_CHAINS, 'utf8'))

for (const publishedChain of publishedChainsAll) {
  const chaindataChain = chaindata.find((c: any) => c.id === publishedChain.id)
  if (!chaindataChain) continue

  chaindataChain.oldPrefix = publishedChain.prefix
}

// write back
fs.writeFileSync(FILEPATH_CHAINDATA_CHAINS, JSON.stringify(chaindata, null, 2))
