import { readFile, writeFile } from 'node:fs/promises'

const main = async () => {
  // import existing chaindata
  const cache = JSON.parse((await readFile('data/cache/chains-extras-cache.json')).toString('utf8'))

  cache.forEach((item: any) => {
    item.cacheBalancesConfigHash = '0x0000000000000000'
  })

  await writeFile('data/cache/chains-extras-cache.json', JSON.stringify(cache, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
