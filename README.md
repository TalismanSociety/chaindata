# Chaindata

<img src="assets/talisman.svg" alt="Talisman" width="15%" align="right" />

[![api-link](https://img.shields.io/website?label=api&logo=github&logoColor=white&style=flat-square&up_message=online&down_message=offline&url=https%3A%2F%2Fraw.githubusercontent.com%2FTalismanSociety%2Fchaindata%2Fmain%2Fpub%2Fv13%2Fchaindata.min.json)](https://raw.githubusercontent.com/TalismanSociety/chaindata/main/pub/v13/chaindata.min.json)
[![discord-link](https://img.shields.io/discord/858891448271634473?logo=discord&logoColor=white&style=flat-square)](https://discord.gg/talisman)

A **community controlled** index of networks, tokens and assets for the [Polkadot](https://polkadot.network/), Ethereum and Solana ecosystems.

The goals of this repo are:

1. Provide a community-managed index of networks and their connection information (RPCs, genesis hashes, metadata)
1. Provide a source of network and token logos across the ecosystem
1. Publish this information as JSON files that any project can consume

## Usage

The published files are consolidated JSON documents containing every network, token and Substrate miniMetadata:

- `https://raw.githubusercontent.com/TalismanSociety/chaindata/main/pub/<version>/chaindata.json`
- `https://raw.githubusercontent.com/TalismanSociety/chaindata/main/pub/<version>/chaindata.min.json`

`<version>` is the current `pub` version, `v13` at the time of writing.
It changes whenever the format of the published files breaks, see [Chaindata `pub` versions](#chaindata-pub-versions) below for the version list and how to find the latest one.

Their shape is `{ networks: Network[], tokens: Token[], miniMetadatas: MiniMetadata[] }`.
Types and Zod schemas for each object are exported by the `@talismn/chaindata-provider` package.

Talisman products consume these files through `@talismn/chaindata-provider`, which exposes a `ChaindataProvider` that keeps itself in sync with the published files.
For a real-world example, see the [Talisman Wallet](https://github.com/TalismanSociety/talisman) source code, where the provider powers balance subscriptions and sending funds.

Logos are also served straight from this repo, e.g. https://raw.githubusercontent.com/TalismanSociety/chaindata/main/assets/tokens/dot.svg

## Chaindata `pub` versions

Each `pub/vN` directory corresponds to a breaking change in the format of the published files.
The version number is not stored in this repo: the build reads `MINIMETADATA_VERSION` from `@talismn/chaindata-provider`, so bumping that dependency is what moves the output to a new folder.
The latest version is the highest `pub/vN` folder in this repo, or the `MINIMETADATA_VERSION` constant of the `@talismn/chaindata-provider` release you depend on.

Old directories are no longer rebuilt, but they are also never deleted.
Wallet releases pinned to an older `@talismn/chaindata-provider` keep working with the last data built for their version.

| Version   | Since   | Notes                                                                           |
| --------- | ------- | ------------------------------------------------------------------------------- |
| `v1`-`v3` | 2024-25 | Legacy layout: one JSON file per chain/token/miniMetadata plus an `index.txt`   |
| `v4`      | 2025-07 | Single `chaindata.json`, refactored network and token objects, YAML input files |
| `v5`      | 2025-08 | Solana networks and SPL tokens                                                  |
| `v6`-`v9` | 2025-26 | Incremental breaking changes to network, token and miniMetadata shapes          |
| `v10`     | 2026-05 |                                                                                 |
| `v11`     | 2026-06 |                                                                                 |
| `v12`     | 2026-06 |                                                                                 |
| `v13`     | 2026-08 | Current at the time of writing                                                  |

## How it works

Only the YAML files in `data/` are edited by hand.
Everything else is produced by three GitHub workflows that commit their output back to `main`:

| Workflow                           | Trigger                | Command                       | Output                                                      |
| ---------------------------------- | ---------------------- | ----------------------------- | ----------------------------------------------------------- |
| `Chaindata Validate`               | every push and PR      | `pnpm validate`               | Fails the PR if YAML formatting or schema validation fails  |
| `Chaindata Fetch External`         | every 6 hours, on main | `pnpm fetch-external`         | `data/cache`, `data/generated`, mirrored logos in `assets/` |
| `Chaindata Build`                  | every push to main     | `pnpm build`                  | `pub/vN/chaindata.json` and `chaindata.min.json`            |
| `Chaindata Fetch TAO Hotkey Logos` | every 6 hours, on main | `pnpm fetch-tao-hotkey-logos` | `assets/bittensor/hotkeys/`                                 |

### Fetch external

Pulls everything that needs network access or third-party data and caches it in the repo so that the build itself stays deterministic:

- Known EVM networks from [chainlist](https://chainlist.org), merged with `data/networks-ethereum.yaml` overrides
- RPC health checks for Polkadot and Ethereum networks (`data/generated/rpc-health-*.json`)
- Polkadot network specs (genesis hash, ss58 prefix, token decimals) and metadata extracts
- Solana network specs
- Token lists for each platform, resolved from on-chain data and the token configs in the YAML files
- Novasama metadata portal URLs, Vana VRC20 tokens, foreign assets fixes
- Coingecko token names and logos (`assets/tokens/coingecko/`), known EVM network logos (`assets/chains/known/`), Bittensor subnet logos (`assets/tokens/dtao/`)

Run a subset of steps with `pnpm fetch-external --steps=checkPolkadotRpcs,fetchDotTokens` (matching is case-insensitive and partial).

### Build

Assembles the published files from the YAML configs and the cached external data, without hitting any RPC:

1. Networks for each platform
1. Tokens for each platform
1. Substrate miniMetadatas
1. Theme colors extracted from logos
1. Consolidated `chaindata.json` and `chaindata.min.json`, validated against the `@talismn/chaindata-provider` schemas

## File structure

| Path                            | Purpose                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `data/networks-polkadot.yaml`   | Relay chains, parachains and other Substrate networks, with their tokens                                       |
| `data/networks-ethereum.yaml`   | EVM networks, matched by id with [chainlist](https://chainlist.org); every field overrides the chainlist value |
| `data/networks-solana.yaml`     | Solana networks and SPL tokens                                                                                 |
| `data/coingecko-overrides.yaml` | Overrides logos of some coingecko tokens                                                                       |
| `data/cache/`                   | Generated by fetch-external, consumed by the build. Do not edit                                                |
| `data/generated/`               | Generated by fetch-external, kept for reference (rpc health, known EVM networks). Do not edit                  |
| `schemas/`                      | JSON schemas for the YAML files, generated from the Zod schemas in `scripts/shared/schemas` on `pnpm install`  |
| `assets/chains/`                | Network logos, named after the network id                                                                      |
| `assets/chains/known/`          | EVM network logos mirrored from chainlist. Do not edit                                                         |
| `assets/tokens/`                | Token logos                                                                                                    |
| `assets/tokens/coingecko/`      | Token logos mirrored from coingecko. Do not edit                                                               |
| `assets/tokens/dtao/`           | Bittensor subnet logos mirrored from chain. Do not edit                                                        |
| `assets/bittensor/hotkeys/`     | Bittensor validator logos mirrored from chain. Do not edit                                                     |
| `assets/promo/`                 | Banner and card images used by Talisman products                                                               |
| `pub/`                          | Published output, one folder per format version                                                                |
| `scripts/`                      | Build, fetch-external and maintenance scripts                                                                  |
| `.papi/`                        | polkadot-api descriptors used by the scripts                                                                   |

## Contributing

Fork this repo, make your changes in your fork, then open a PR.
Only edit the YAML files and the non-generated `assets/` folders: JSON files and mirrored logos are regenerated by the CI and any manual change will be overwritten.

### Add or update a Substrate network

Add an entry to `data/networks-polkadot.yaml`.
Only `id` and `rpcs` are required, everything else (genesis hash, ss58 prefix, decimals, symbol) is fetched from the chain.

```yaml
- id: my-network
  name: My Network
  isDefault: true
  nativeCurrency:
    coingeckoId: my-token
    logo: ./assets/tokens/my-token.svg
  logo: ./assets/chains/my-network.svg
  blockExplorerUrls:
    - https://my-network.subscan.io/
  rpcs:
    - wss://rpc.my-network.io
```

`isDefault` controls whether the network is enabled by default in Talisman Wallet.

### Add or update an EVM network

Networks listed on [chainlist](https://chainlist.org) are imported automatically.
Add an entry to `data/networks-ethereum.yaml` only to enable a network by default, or to override chainlist data (name, RPCs, logo, explorer, fee type).
Use the **base-10** chain id (e.g. `1`, or `137`), **not** the base-16 id (e.g. `0x1`, or `0x89`).

### Add or update a Solana network

Add an entry to `data/networks-solana.yaml`. Only `id` and `rpcs` are required, see the existing entries for the other fields.

### Add tokens

Tokens are declared under the `tokens` key of their network, grouped by balance module:

| Platform | Modules                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Polkadot | `substrate-native`, `substrate-assets`, `substrate-foreignassets`, `substrate-tokens`, `substrate-psp22`, `substrate-hydration`, `substrate-dtao` |
| Ethereum | `evm-erc20`, `evm-uniswapv2`                                                                                                                      |
| Solana   | `sol-spl`                                                                                                                                         |

Symbol, decimals and name are fetched from chain where possible, so most entries only need the on-chain identifier (asset id, contract address, mint address) and optionally a `coingeckoId` and a `logo`.
Check existing entries in the YAML file for the fields expected by each module, or the JSON schemas in `schemas/`.

### Add logos

- Network logos go in `assets/chains/${id}.svg`, where `id` is the network id from the YAML file (base-10 chain id for EVM networks)
- Token logos go in `assets/tokens/${symbol}.svg`, then set the `logo` property of the token entry to the relative path, e.g. `./assets/tokens/dot.svg`
- Bittensor subnet logos are mirrored from the `logo_url` published on chain in each subnet identity (`SubnetInfoRuntimeApi.get_all_dynamic_info`) and take precedence over coingecko logos. To override one, set the `logo` property of the subnet entry in `data/networks-polkadot.yaml`
- Bittensor validator logos are mirrored from the `image` of each coldkey identity (`SubtensorModule.IdentitiesV2`). `assets/bittensor/hotkeys/logos.json` maps each delegate hotkey to its file

SVG is preferred, PNG and WebP are accepted.

## Running locally

1. Enable `pnpm` via [corepack](https://nodejs.org/api/corepack.html) with `corepack enable`
1. Clone the repo: `git clone git@github.com:TalismanSociety/chaindata.git`
1. Install the dependencies: `pnpm install` (this also generates the JSON schemas)
1. Copy `.env.sample` to `.env` and fill in the variables
1. Validate your changes: `pnpm validate`
1. Build the published files: `pnpm build`

The build embeds the current git branch name in logo URLs, so do not commit a `pub/` folder built from a feature branch.
The CI rebuilds `pub/` after your PR is merged.

`pnpm build:dev` skips validation, and `pnpm fetch-external` refreshes the cached external data.
