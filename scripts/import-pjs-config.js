import {
  prodChains,
  prodRelayPolkadot,
  prodParasPolkadotCommon,
  prodParasPolkadot,
  prodRelayKusama,
  prodParasKusama,
  prodParasKusamaCommon,
} from '@polkadot/apps-config/endpoints/production'
import { allNetworks } from '@polkadot/networks'
import path from 'path'
import fs from 'fs'
import prettier from 'prettier'
import kebabCase from 'lodash/kebabCase.js'

const customChainIds = {
  aleph: 'aleph-zero',
  bifrost: 'bifrost-ksm',
  bitcountryPioneer: 'bit-country-pioneer',
  crab: 'darwinia-crab',
  crustParachain: 'crust',
  heiko: 'parallel-heiko',
  hydra: 'hydradx',
  kilt: 'kilt-spiritnet',
  kintsugi: 'kintsugi-btc',
  loomNetwork: 'loom',
  odyssey: 'ares',
  shadow: 'crust-shadow',
  sora_ksm: 'sora-kusama',
  subgame: 'subgame-gamma',
  subsocialX: 'subsocialx',
}
const deriveId = (info) => customChainIds[info] || kebabCase(info).toLowerCase()

const trimName = (text) =>
  text
    // general suffixes which look ugly
    .replace(/ \(kusama\)$/i, '')
    .replace(/ kusama$/i, '')
    .replace(/ mainnet$/i, '')
    .replace(/ network$/i, '')
    .replace(/ parachain$/i, '')
    .replace(/ polkadot$/i, '')
    .replace(/ protocol$/i, '')

    // specific name overrides
    .replace(/^KICO$/, 'Kico')
    .replace(/^Kintsugi BTC$/, 'Kintsugi')
    .replace(/^Mangata$/, 'MangataX')
    .replace(/^PolkaSmith by PolkaFoundry$/, 'PolkaSmith')
    .replace(/^QUARTZ by UNIQUE$/, 'Quartz')
    .replace(/^SORA Kusama$/, 'Sora Kusama')
    .replace(/^SORA$/, 'Sora')
    .replace(/^Shiden Crowdloan 2$/, 'Shiden')

const chaindataMap = Object.fromEntries(
  JSON.parse(fs.readFileSync('chaindata.json')).map((chain) => [
    chain.id,
    chain,
  ])
)

// solo chains
prodChains.forEach((para) => {
  const id = deriveId(para.info)
  const chain = chaindataMap[id] || { id }

  chain.name = trimName(para.text)
  if (!chain.account) chain.account = '*25519'
  chain.rpcs = Object.values(para.providers).filter((url) =>
    url.startsWith('wss://')
  )
  delete chain.paraId
  delete chain.relay

  chaindataMap[chain.id] = chain
})

// relay chains
;[(prodRelayPolkadot, prodRelayKusama)].forEach((para) => {
  const id = deriveId(para.info)
  const chain = chaindataMap[id] || { id }

  chain.name = trimName(para.text)
  if (!chain.account) chain.account = '*25519'
  chain.rpcs = Object.values(para.providers).filter((url) =>
    url.startsWith('wss://')
  )
  delete chain.paraId
  delete chain.relay

  chaindataMap[chain.id] = chain
})

// polkadot parachains
;[...prodParasPolkadot, ...prodParasPolkadotCommon].forEach((para) => {
  const id = deriveId(para.info)
  const chain = chaindataMap[id] || { id }

  chain.name = trimName(para.text)
  if (!chain.account) chain.account = '*25519'
  chain.rpcs = Object.values(para.providers).filter((url) =>
    url.startsWith('wss://')
  )
  chain.paraId = para.paraId
  chain.relay = { id: 'polkadot' }

  chaindataMap[chain.id] = chain
})

// kusama parachains
;[...prodParasKusama, ...prodParasKusamaCommon].forEach((para) => {
  const id = deriveId(para.info)
  const chain = chaindataMap[id] || { id }

  chain.name = trimName(para.text)
  if (!chain.account) chain.account = '*25519'
  chain.rpcs = Object.values(para.providers).filter((url) =>
    url.startsWith('wss://')
  )
  chain.paraId = para.paraId
  chain.relay = { id: 'kusama' }

  chaindataMap[chain.id] = chain
})

const chaindata = Object.values(chaindataMap).sort((a, b) => {
  if (a.id === b.id) return 0
  if (a.id === 'polkadot') return -1
  if (b.id === 'polkadot') return 1
  if (a.id === 'kusama') return -1
  if (b.id === 'kusama') return 1
  return a.id.localeCompare(b.id)
})

fs.writeFileSync(
  'chaindata.json',
  prettier.format(JSON.stringify(chaindata, null, 2), { parser: 'json' })
)

console.log('Import complete!')

const polkadotChainsByParaId = {}
const kusamaChainsByParaId = {}
chaindata.forEach((chain) => {
  if (chain.relay?.id === 'polkadot') {
    polkadotChainsByParaId[chain.paraId] = [
      ...(polkadotChainsByParaId[chain.paraId] || []),
      chain.id,
    ]
  }
  if (chain.relay?.id === 'kusama') {
    kusamaChainsByParaId[chain.paraId] = [
      ...(kusamaChainsByParaId[chain.paraId] || []),
      chain.id,
    ]
  }
})

Object.entries(polkadotChainsByParaId)
  .filter(([, chainIds]) => chainIds.length > 1)
  .forEach((conflict) => {
    console.log(
      `Conflicting polkadot paraId ${conflict[0]}: ${conflict[1].join(', ')}`
    )
  })
Object.entries(kusamaChainsByParaId)
  .filter(([, chainIds]) => chainIds.length > 1)
  .forEach((conflict) => {
    console.log(
      `Conflicting kusama paraId ${conflict[0]}: ${conflict[1].join(', ')}`
    )
  })

chaindata.forEach((chain) => {
  const hasLogo = fs.existsSync(path.join('assets', chain.id, 'logo.svg'))
  if (hasLogo) return

  console.log(`Missing logo for chain ${chain.id}`)
})
