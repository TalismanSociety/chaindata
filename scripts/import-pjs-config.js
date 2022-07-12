import {
  prodChains,
  prodRelayPolkadot,
  prodParasPolkadot,
  prodParasPolkadotCommon,
  prodRelayKusama,
  prodParasKusama,
  prodParasKusamaCommon,
} from '@polkadot/apps-config/endpoints/production'
import {
  testChains,
  testRelayWestend,
  testParasWestend,
  testParasWestendCommon,
  testRelayRococo,
  testParasRococo,
  testParasRococoCommon,
} from '@polkadot/apps-config/endpoints/testing'
// import { allNetworks } from '@polkadot/networks'
import path from 'path'
import fs from 'fs'
import prettier from 'prettier'
import kebabCase from 'lodash/kebabCase.js'

// a map of pjs ids to their talisman chaindata equivalents
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
// a map of testnet pjs ids to their talisman chaindata equivalents
const customTestnetChainIds = {
  acala: 'mandala-testnet',
  aleph: 'aleph-zero-testnet',
}

// derive talisman id from pjs id
const deriveId = (info) => customChainIds[info] || kebabCase(info).toLowerCase()
const deriveTestnetId = (info) =>
  customTestnetChainIds[info] || `${kebabCase(info).toLowerCase()}-testnet`

// fix up pjs chain names to match talisman
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
    .replace(/^Zero$/, 'Zero Alphaville')

    // trim leading/trailing spaces
    .trim()

// import existing chaindata
const chaindataMap = Object.fromEntries(
  JSON.parse(fs.readFileSync('chaindata.json')).map((chain) => [
    chain.id,
    chain,
  ])
)
// import existing testnets chaindata
const testnetsChaindataMap = Object.fromEntries(
  JSON.parse(fs.readFileSync('testnets-chaindata.json')).map((chain) => [
    chain.id,
    chain,
  ])
)

// derive talisman chain from pjs chain and add to chaindata
const addParaToMap =
  (relay, isTestnet = false) =>
  (para) => {
    const map = isTestnet ? testnetsChaindataMap : chaindataMap

    const id = isTestnet ? deriveTestnetId(para.info) : deriveId(para.info)
    const chain = map[id] || { id }

    chain.name = trimName(para.text)
    if (!chain.account) chain.account = '*25519'
    chain.rpcs = Object.values(para.providers).filter((url) =>
      url.startsWith('wss://')
    )
    if (relay) {
      chain.paraId = para.paraId
      chain.relay = relay
    } else {
      delete chain.paraId
      delete chain.relay
    }

    map[chain.id] = chain
  }

// derive solo chains
prodChains.forEach(addParaToMap(null))

// derive relay chains
;[prodRelayPolkadot, prodRelayKusama].forEach(addParaToMap(null))

// derive polkadot parachains
;[...prodParasPolkadot, ...prodParasPolkadotCommon].forEach(
  addParaToMap({ id: 'polkadot' })
)

// derive kusama parachains
;[...prodParasKusama, ...prodParasKusamaCommon].forEach(
  addParaToMap({ id: 'kusama' })
)

// derive solo (testnets) chains
testChains.forEach(addParaToMap(null, true))

// derive relay (testnets) chains
;[testRelayWestend, testRelayRococo].forEach(addParaToMap(null, true))

// derive westend parachains
;[...testParasWestend, ...testParasWestendCommon].forEach(
  addParaToMap({ id: 'westend-testnet' }, true)
)

// derive rococo parachains
;[...testParasRococo, ...testParasRococoCommon].forEach(
  addParaToMap({ id: 'rococo-testnet' }, true)
)

// sort chaindata
const chaindata = Object.values(chaindataMap).sort((a, b) => {
  if (a.id === b.id) return 0
  if (a.id === 'polkadot') return -1
  if (b.id === 'polkadot') return 1
  if (a.id === 'kusama') return -1
  if (b.id === 'kusama') return 1
  return a.id.localeCompare(b.id)
})

// sort testnets chaindata
const testnetsChaindata = Object.values(testnetsChaindataMap).sort((a, b) => {
  if (a.id === b.id) return 0
  if (a.id === 'westend-testnet') return -1
  if (b.id === 'westend-testnet') return 1
  if (a.id === 'rococo-testnet') return -1
  if (b.id === 'rococo-testnet') return 1
  return a.id.localeCompare(b.id)
})

// write updated files
fs.writeFileSync(
  'chaindata.json',
  prettier.format(JSON.stringify(chaindata, null, 2), { parser: 'json' })
)
fs.writeFileSync(
  'testnets-chaindata.json',
  prettier.format(JSON.stringify(testnetsChaindata, null, 2), {
    parser: 'json',
  })
)

console.log('Import complete!')

// check for missing chain logos
;[...chaindata, ...testnetsChaindata].forEach((chain) => {
  const hasLogo = fs.existsSync(path.join('assets', chain.id, 'logo.svg'))
  if (hasLogo) return

  console.log(`Missing logo for chain ${chain.id}`)
})

// check for paraId conflicts on each relay chain
const relayChainsByParaId = {}
;[...chaindata, ...testnetsChaindata].forEach((chain) => {
  if (typeof chain.relay?.id !== 'string') return
  relayChainsByParaId[chain.relay?.id] =
    relayChainsByParaId[chain.relay?.id] || {}
  relayChainsByParaId[chain.relay?.id][chain.paraId] =
    relayChainsByParaId[chain.relay?.id][chain.paraId] || []
  relayChainsByParaId[chain.relay?.id][chain.paraId].push(chain.id)
})

Object.entries(relayChainsByParaId).forEach(([relayId, chains]) => {
  Object.entries(chains)
    .filter(([, chainIds]) => chainIds.length > 1)
    .forEach((conflict) => {
      console.log(
        `Conflicting ${relayId} paraId ${conflict[0]}: ${conflict[1].join(
          ', '
        )}`
      )
    })
})

// check for id conflicts between testnets and production
for (const id of Object.keys(chaindataMap)) {
  if (!testnetsChaindataMap[id]) continue
  console.log(`Testnet id ${id} conflicts with production`)
}
