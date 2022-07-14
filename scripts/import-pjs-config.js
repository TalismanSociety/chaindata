import {
  prodChains,
  prodParasKusama,
  prodParasKusamaCommon,
  prodParasPolkadot,
  prodParasPolkadotCommon,
  prodRelayKusama,
  prodRelayPolkadot,
} from '@polkadot/apps-config/endpoints/production'
import {
  testChains,
  testParasRococo,
  testParasRococoCommon,
  testParasWestend,
  testParasWestendCommon,
  testRelayRococo,
  testRelayWestend,
} from '@polkadot/apps-config/endpoints/testing'

// import { allNetworks } from '@polkadot/networks'
import fs from 'fs'
import kebabCase from 'lodash/kebabCase.js'
import path from 'path'
import prettier from 'prettier'
import startCase from 'lodash/startCase.js'

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
    .replace(/[ -][0-9]+$/i, '')

    .replace(/[ -]\(?network\)?$/i, '')
    .replace(/[ -]\(?protocol\)?$/i, '')

    .replace(/[ -]\(?mainnet\)?$/i, '')
    .replace(/[ -]\(?stage\)?$/i, '')
    .replace(/[ -]\(?staging\)?$/i, '')
    .replace(/[ -]\(?testnet\)?$/i, '')

    .replace(/[ -]\(?network\)?$/i, '')
    .replace(/[ -]\(?protocol\)?$/i, '')

    .replace(/[ -]\(?parachain\)?$/i, '')
    .replace(/[ -]\(?crowdloan\)?$/i, '')

    .replace(/[ -]\(?kusama\)?$/i, '')
    .replace(/[ -]\(?polkadot\)?$/i, '')
    .replace(/[ -]\(?rococo\)?$/i, '')
    .replace(/[ -]\(?standalone\)?$/i, '')

    .replace(/ by unique$/i, '')
    .replace(/ by polkafoundry$/i, '')
    .replace(/ metaverse$/i, '')

    // remove trailing bracketed stuffs
    .replace(/ \([A-Za-z0-9 ]+\)$/i, '')

    // remove leading/trailing non-alphabeticals
    .replace(/ [^A-Za-z]+$/i, '')
    .replace(/^[^A-Za-z]+ /i, '')

    // turn single-word ALLCAPS names into Startcase names
    .replace(/^[A-Z]+$/, (name) => startCase(name.toLowerCase()))

    // turn single-word alllowercase names into Startcase names
    .replace(/^[a-z]+$/, (name) => startCase(name.toLowerCase()))

    // specific name overrides
    .replace(/^Gm$/, 'GM')
    .replace(/^Kintsugi BTC$/, 'Kintsugi')
    .replace(/^Mangata$/, 'MangataX')

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

// keep track of updated chain ids
const updatedChainIds = []

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
    updatedChainIds.push(chain.id)
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

// check for testnet <-> mainnet name conflicts and append ` Testnet` to conflicting testnet names
const chaindataNames = Object.fromEntries(
  chaindata.map(({ name }) => [name, true])
)
testnetsChaindata.forEach((chain) => {
  if (!chaindataNames[chain.name]) return
  chain.name = `${chain.name} Testnet`
})

// check for kusama <-> polkadot <-> solochain name conflicts and append to conflicting kusama/solochain names
const [soloNames, polkadotNames] = chaindata.reduce(
  ([solo, polka], chain) => {
    if (['polkadot', 'kusama'].includes(chain.id)) return [solo, polka]

    if (!chain.relay) return [[...solo, chain.name], polka]
    if (chain.relay.id === 'polkadot') return [solo, [...polka, chain.name]]

    return [solo, polka]
  },
  [[], []]
)
chaindata.forEach((chain) => {
  if (chain.relay?.id === 'kusama')
    if ([...polkadotNames, ...soloNames].includes(chain.name))
      chain.name = `${chain.name} Kusama`

  if (!chain.relay)
    if ([...polkadotNames].includes(chain.name))
      chain.name = `${chain.name} Standalone`
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

// print existing chains which aren't listed in pjs repo
const chainIds = Object.fromEntries([
  ...chaindata.map(({ id }) => [id, true]),
  ...testnetsChaindata.map(({ id }) => [id, true]),
])
updatedChainIds.forEach((id) => delete chainIds[id])
Object.keys(chainIds).forEach((id) =>
  console.log(
    `Note: chain ${id} exists in chaindata but not in @polkadot/apps-config`
  )
)
