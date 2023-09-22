# Chaindata

<img src="assets/talisman.svg" alt="Talisman" width="15%" align="right" />

[![api-link](https://img.shields.io/website?label=api&logo=github&logoColor=white&style=flat-square&up_message=online&down_message=offline&url=https%3A%2F%2Ftalismansociety.github.io%2Fchaindata)](https://talismansociety.github.io/chaindata)
[![discord-link](https://img.shields.io/discord/858891448271634473?logo=discord&logoColor=white&style=flat-square)](https://discord.gg/talisman)

A **community controlled** repository of [relay](https://wiki.polkadot.network/docs/learn-architecture#relay-chain) and [parachain](https://wiki.polkadot.network/docs/learn-architecture#parachain-and-parathread-slots) information in the [Polkadot ecosystem](https://polkadot.network/).

The goals of this repo are:

1. Provide a community-managed index of Polkadot parachains and their connection information (rpcs, chainspecs)
1. Provide a source of chain and token assets across the ecosystem
1. Enable developers to retrieve this information via an API suitable to their project (json/rest, npm [**soon™**](https://github.com/TalismanSociety/chaindata/issues/35))
1. Move towards a decentralised model

## Usage

The files in this repo, `chaindata.json`, `testnets-chaindata.json` and `evm-networks.json` are used to configure a GitHub workflow which scrapes information from each chain and publishes it as a collection of JSON files on GitHub Pages.

The published files can be browsed at this URL: https://talismansociety.github.io/chaindata

As an example, you could make this request to get the names, [genesisHashes](## 'the hash of the first block on the chain') and [address type prefixes](https://wiki.polkadot.network/docs/learn-account-advanced#address-format) for all chains:

```ts
const chains = await(
  await fetch(`https://talismansociety.github.io/chaindata/chains.json`)
).json()
```

For an example of a more advanced use-case, you can check out the [Talisman wallet](https://github.com/TalismanSociety/talisman) source code.  
The wallet uses chaindata to populate a database of chains and tokens which is used for features like account balance subscriptions and sending funds.

## Contributing

To make a contribution, please fork this repo and make your changes in your fork, then open a PR to merge your changes back into this repo.

### To add chain or token logos:

#### Substrate chain logos

1. Identify the chain `id` from `chaindata.json` or `testnets-chaindata.json`
1. Add your logo (in `svg` format) to `assets/chains/${id}.svg`

#### EVM chain logos

1. Identify the chain `id` from https://chainlist.org  
   **Use the base-10 id** (e.g. `1`, or `137`), **not** the base-16 id (e.g. `0x1`, or `0x89`)
1. Add your logo (in `svg` format) to `assets/chains/${id}.svg`

#### Token logos

1. Identify the token symbol (e.g. `KSM`)
1. Add your logo (in `svg` format) to `assets/tokens/${symbol}.svg`

### To build the github pages endpoint locally:

1. Install [bun](bun.sh)
1. Clone the repo via  
   `git clone git@github.com:TalismanSociety/chaindata.git`
1. Install the deps via  
   `bun install`
1. Run the build via  
   `bun run build`
