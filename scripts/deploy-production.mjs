import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const config = JSON.parse(readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8'))
const productionDatabase = config.d1_databases?.find((database) => database.binding === 'DB')

if (productionDatabase?.database_id === '00000000-0000-0000-0000-000000000000') {
  throw new Error(
    'Production is intentionally unprovisioned. Use "pnpm deploy:staging" for the verified staging target.',
  )
}

throw new Error('Production deployment requires a separate reviewed rollout.')
