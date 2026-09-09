import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'

const root = resolve(import.meta.dirname, '..')
const wrangler = resolve(root, 'node_modules/.bin/wrangler')
const vite = resolve(root, 'node_modules/.bin/vite')
const generatedConfig = resolve(root, 'dist/personalized_storybooks_eg/wrangler.json')
const deployRedirect = resolve(root, '.wrangler/deploy/config.json')
const target = {
  accountId: 'c8aea16544af3ad32a67f6c3e0217755',
  accountEmail: 'm.baseeto@gmail.com',
  workerName: 'personalized-storybooks-eg-production',
  databaseName: 'personalized-storybooks-eg-production-db',
  databaseId: 'd71121a2-d077-4b5b-b432-8008974501b0',
  appBaseUrl: 'https://mintmeow.com',
  customDomain: 'mintmeow.com',
}
const requiredSecrets = [
  'SESSION_SECRET',
  'ADMIN_BOOTSTRAP_TOKEN',
  'ABANDONED_CART_ENCRYPTION_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
]

function fail(message) {
  throw new Error(`Production deployment blocked: ${message}`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function matches(value, expected, label) {
  if (value !== expected) fail(`${label} does not match the reviewed production target.`)
}

function ensureChildCompleted(result, label) {
  if (result.error) fail(`${label} could not start: ${result.error.message}`)
  if (result.signal) fail(`${label} was terminated by ${result.signal}.`)
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? '')
    process.stderr.write(result.stderr ?? '')
    process.exit(result.status ?? 1)
  }
}

const config = readJson(resolve(root, 'wrangler.jsonc'))
const production = config.env?.production
const configuredDatabase = production?.d1_databases?.find((database) => database.binding === 'DB')
const configuredDomain = production?.routes?.find((route) => route.custom_domain)?.pattern

console.log('Production deployment preflight: validating configuration.')
if (!production || !configuredDatabase) fail('wrangler.jsonc has no production DB binding.')
matches(production.account_id, target.accountId, 'Configured account ID')
matches(configuredDatabase.database_name, target.databaseName, 'Configured database name')
matches(configuredDatabase.database_id, target.databaseId, 'Configured database ID')
matches(production.vars?.APP_BASE_URL, target.appBaseUrl, 'Configured app base URL')
matches(configuredDomain, target.customDomain, 'Configured custom domain')
matches(production.workers_dev, false, 'workers.dev setting')

console.log('Production deployment preflight: validating Cloudflare login.')
const whoami = JSON.parse(execFileSync(wrangler, ['whoami', '--json'], { cwd: root, encoding: 'utf8' }))
if (!whoami.accounts?.some((account) => account.id === target.accountId)) {
  fail('The active Wrangler login cannot access the reviewed Cloudflare account.')
}
if (whoami.email?.toLowerCase() !== target.accountEmail) {
  fail('The active Wrangler login is not the reviewed account email.')
}

console.log('Production deployment preflight: validating required secrets.')
const configuredSecrets = JSON.parse(
  execFileSync(wrangler, ['secret', 'list', '--env', 'production', '--config', 'wrangler.jsonc'], {
    cwd: root,
    encoding: 'utf8',
  }),
)
const configuredSecretNames = new Set(configuredSecrets.map((secret) => secret.name))
const missingSecrets = requiredSecrets.filter((secret) => !configuredSecretNames.has(secret))
if (missingSecrets.length > 0) fail(`Missing required Worker secrets: ${missingSecrets.join(', ')}.`)

console.log('Production deployment: building the reviewed production bundle.')
if (existsSync(deployRedirect)) unlinkSync(deployRedirect)
const build = spawnSync(vite, ['build'], {
  cwd: root,
  env: { ...process.env, CLOUDFLARE_ENV: 'production' },
  encoding: 'utf8',
})
ensureChildCompleted(build, 'Production build')
if (!existsSync(generatedConfig)) fail('Vite did not generate the production Wrangler configuration.')
if (!existsSync(deployRedirect)) fail('Vite did not generate a fresh Wrangler deployment redirect.')

const redirect = readJson(deployRedirect)
if (resolve(dirname(deployRedirect), redirect.configPath ?? '') !== generatedConfig) {
  fail('Fresh Wrangler deployment redirect does not point to the generated production configuration.')
}

console.log('Production deployment preflight: validating the generated Worker configuration.')
const generated = readJson(generatedConfig)
const generatedDatabase = generated.d1_databases?.find((database) => database.binding === 'DB')
const generatedDomain = generated.routes?.find((route) => route.custom_domain)?.pattern
if (!generatedDatabase) fail('Generated configuration has no DB binding.')
matches(generated.name, target.workerName, 'Generated Worker name')
matches(generated.account_id, target.accountId, 'Generated account ID')
matches(generatedDatabase.database_name, target.databaseName, 'Generated database name')
matches(generatedDatabase.database_id, target.databaseId, 'Generated database ID')
matches(generated.vars?.APP_BASE_URL, target.appBaseUrl, 'Generated app base URL')
matches(generatedDomain, target.customDomain, 'Generated custom domain')
matches(generated.workers_dev, false, 'Generated workers.dev setting')
matches(generated.targetEnvironment, 'production', 'Generated target environment')

console.log('Production deployment: publishing to the reviewed target.')
const deploy = spawnSync(wrangler, ['deploy'], {
  cwd: root,
  env: { ...process.env, CLOUDFLARE_ENV: 'production' },
  stdio: 'inherit',
})
console.log(
  `Production deployment command completed (status: ${deploy.status ?? 'none'}, signal: ${deploy.signal ?? 'none'}).`,
)
ensureChildCompleted(deploy, 'Production deployment')
