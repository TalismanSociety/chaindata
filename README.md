# Chaindata

<img src="assets/talisman.svg" alt="Talisman" width="15%" align="right" />

[![api-link](https://img.shields.io/website?label=api&logo=github&logoColor=white&style=flat-square&up_message=online&down_message=offline&url=https%3A%2F%2Fraw.githubusercontent.com%2FTalismanSociety%2Fchaindata%2Fmain%2Fpub%2Fv1%2Findex.txt)](https://raw.githubusercontent.com/TalismanSociety/chaindata/main/pub/v1/index.txt)
[![discord-link](https://img.shields.io/discord/858891448271634473?logo=discord&logoColor=white&style=flat-square)](https://discord.gg/talisman)

A **community controlled** repository of [relay](https://wiki.polkadot.network/docs/learn-architecture#relay-chain) and [parachain](https://wiki.polkadot.network/docs/learn-architecture#parachain-and-parathread-slots) information in the [Polkadot ecosystem](https://polkadot.network/).

The goals of this repo are:

1. Provide a community-managed index of Polkadot parachains and their connection information (rpcs, chainspecs)
1. Provide a source of chain and token assets across the ecosystem
1. Enable developers to retrieve this information via an API suitable to their project (json/rest, npm [**soon™**](https://github.com/TalismanSociety/chaindata/issues/35))
1. Move towards a decentralised model

## Usage

The files in this repo, `data/chaindata.json`, `data/testnets-chaindata.json` and `data/evm-networks.json` are used to configure a GitHub workflow which scrapes information from each chain and publishes it as a collection of JSON files in the `pub` directory of this repo.

The published files can be browsed at this URL: https://raw.githubusercontent.com/TalismanSociety/chaindata/main/pub/v1/index.txt

As an example, you could use this request to get a summary of all chains including the the names, logos, [genesisHashes](## 'the hash of the first block on the chain') and [address type prefixes](https://wiki.polkadot.network/docs/learn-account-advanced#address-format):

```ts
const chainsSummaryUrl = "https://raw.githubusercontent.com/TalismanSociety/chaindata/main/pub/v1/chains/summary.json"
const summary = await fetch(chainsSummaryUrl).then(result => result.json())
```

For an example of a more advanced use-case, you can check out the [Talisman wallet](https://github.com/TalismanSociety/talisman) source code.  
The wallet uses chaindata to populate a database of chains and tokens which is used for features like account balance subscriptions and sending funds.

## Chaindata `pub` versions

When breaking changes are made to the format of the built chaindata files, we increment the `pub` directory version.

Old directories are generally not kept up-to-date, but they are also not deleted.

The effect of this is that newer `@talismn/balances` releases will target the newer `pub` version, while older releases will continue to operate with the most up-to-date chaindata before the breaking change occurred.

A brief rundown of the changes introduced by each `pub` version:

- **`dist` -> `pub/v1`**  
  The miniMetadatas for the `substrate-native` balance module now include types for `Balances::Holds` and `Balances::Locks`.  
  Without upgrading `@talismn/balances`, these new types cause `PortableRegistry` to throw on construction of a `new Metadata(miniMetadata)`.

- **`pub/v1` -> `pub/v2`**  
  All miniMetadatas have been upgraded from metadata format v14 to v15.  
  Without upgrading `@talismn/balances`, the new format causes the library to throw.

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

### To build the pub directory locally:

1. Install `pnpm` via [corepack](https://nodejs.org/api/corepack.html) by running `corepack enable` on the command line
1. Clone the repo with  
   `git clone git@github.com:TalismanSociety/chaindata.git`
1. Install the dependencies with  
   `pnpm install`
1. Copy `.env.sample` to `.env` and fill in the variables
1. Run the build with  
   `pnpm build`

### File structure

Some files are edited manually, some other are generated automatically as part of the CI.

The table below describes the purpose of each file and how it is edited.

| File name                                        | Edit Type | Purpose                                                                                       |
| ------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------- |
| `data/chaindata.json`                            | manual    | A list of all parachains and relay chains in the Polkadot ecosystem                           |
| `data/testnets-chaindata.json`                   | manual    | A list of all parachains and relay chains in the Polkadot ecosystem                           |
| `data/generated/chains-extras-cache.json`        | automatic | Caches static data for each substrate chain                                                   |
| `data/evm-networks.json`                         | manual    | List of EVM chains supported by default in Talisman                                           |
| `data/generated/known-evm-networks.json`         | automatic | List of EVM networks, generated from [ethereum-lists](https://github.com/ethereum-lists)      |
| `data/known-evm-networks-overrides.json`         | manual    | Overrides to `known-evm-networks.json`, matched by chain id                                   |
| `data/cache/known-evm-networks-icons-cache.json` | automatic | Caches images for each network defined in [ethereum-lists](https://github.com/ethereum-lists) |
| `data/cache/known-evm-tokens-cache.json`         | automatic | Caches static data for ERC20 tokens                                                           |

## Dev Resources

#### Sections needing improvement

There are a few sections in this repo which could do with a tidy up.  
Here is a list of some of them, feel free to add more!

- The use of relative logo paths vs absolute logo paths is confusing.  
  We should decide on one, and then also clear up exactly how it is that logos are handled in the repo.  
  By `clear up`, I mean to make the code easier to understand where possible, and to add docs anywhere it needs to remain complex.  
  It is currently unclear to contributors whether they only need to add their own logos, or if changes also need to be made to the files in `data`.

- The code for merging `known-evm-networks.json` with `evm-networks.json` is complex, stateful, full of side-effects and therefore difficult to re-use between the build stage and the fetch-external stage.  
  It is currently co-located inside of `scripts/build/steps/addEvmNetworks.ts`.  
  We should decide on a simpler mechanism for merging these two files, and extract the implementation of that into a util file.  
  An example of where this currently fails is in `scripts/fetch-external/steps/fetchErc20TokenSymbols.ts`.  
  In here we append the two files like so `const allNetworks = knownEvmNetworks.concat(evmNetworks)`, which results in duplicate networks in the `allNetworks` list.  
  This makes it difficult to e.g. extract a coingeckoId for a given erc20 contract address on a given network, since the code using `allNetworks` needs to account for duplicate networks with potentially conflicting information.

- Currently all of the EVM tokens are hydrated from known-tokens, while all substrate tokens are hydrated from tokens.json.  
  This is counter-intuitive, and so it leads to questions like "Why can I only see substrate tokens on chaindata? Are the EVM tokens missing / broken?"  
  We should either consolidate the two lists of tokens in one place, or change the naming used to clarify that not _all_ tokens can be found in one place.

#### Query the top 100 (by TVL) Uniswap V2 pool addresses

```shell
curl 'https://interface.gateway.uniswap.org/v1/graphql' \
-X 'POST' \
-H 'Content-Type: application/json' \
-H 'Origin: https://app.uniswap.org' \
--data-binary '{"operationName":"TopV2Pairs","variables":{"first":100,"chain":"ETHEREUM"},"query":"query TopV2Pairs($chain: Chain!, $first: Int!, $cursor: Float, $tokenAddress: String) {\n  topV2Pairs(\n    first: $first\n    chain: $chain\n    tokenFilter: $tokenAddress\n    tvlCursor: $cursor\n  ) {\n    protocolVersion\n    address\n  }\n}"}'
```

Possible values for `chain` when this was written:

```
ARBITRUM, AVALANCHE, ETHEREUM, ETHEREUM_GOERLI, ETHEREUM_SEPOLIA, OPTIMISM, POLYGON, CELO, BNB, BASE, BLAST
```
