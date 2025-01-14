import fs from 'fs'
import path from 'path'

const FILEPATH_PUBLISHED_CHAINS = path.join(path.resolve('./pub/v2/chains/all.json'))
const FILEPATH_CHAINDATA_CHAINS = path.join(path.resolve('./data/chaindata.json'))
const FILEPATH_CHAINDATA_TESTNETS = path.join(path.resolve('./data/testnets-chaindata.json'))

const publishedChainsAll = JSON.parse(fs.readFileSync(FILEPATH_PUBLISHED_CHAINS, 'utf8'))

const chaindata = JSON.parse(fs.readFileSync(FILEPATH_CHAINDATA_CHAINS, 'utf8'))
const chaindataTestnets = JSON.parse(fs.readFileSync(FILEPATH_CHAINDATA_TESTNETS, 'utf8'))

for (const publishedChain of publishedChainsAll) {
  const chaindataChain = chaindata.find((c: any) => c.id === publishedChain.id)
  if (chaindataChain) chaindataChain.oldPrefix = publishedChain.prefix

  const chaindataTestnet = chaindataTestnets.find((c: any) => c.id === publishedChain.id)
  if (chaindataTestnet) chaindataTestnet.oldPrefix = publishedChain.prefix
}

// write back
fs.writeFileSync(FILEPATH_CHAINDATA_CHAINS, JSON.stringify(chaindata, null, 2))
fs.writeFileSync(FILEPATH_CHAINDATA_TESTNETS, JSON.stringify(chaindataTestnets, null, 2))
