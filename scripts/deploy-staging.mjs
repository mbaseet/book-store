import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const wrangler = resolve(root, 'node_modules/.bin/wrangler')
const vite = resolve(root, 'node_modules/.bin/vite')
const generatedConfig = resolve(root, 'dist/personalized_storybooks_eg/wrangler.json')
const deployRedirect = resolve(root, '.wrangler/deploy/config.json')
const target = {
  accountId: 'c8aea16544af3ad32a67f6c3e0217755',
  accountEmail: 'm.baseeto@gmail.com',
  workerName: 'personalized-storybooks-eg-staging',
  databaseName: 'personalized-storybooks-eg-staging-db',
  databaseId: '7eab0c22-b9de-4f0f-842e-8f9c1d8f5cb8',
  appBaseUrl: 'https://personalized-storybooks-eg-staging.m-baseeto.workers.dev',
}

function fail(message) {
  throw new Error(`Staging deployment blocked: ${message}`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function matches(value, expected, label) {
  if (value !== expected) fail(`${label} does not match the canonical staging target.`)
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
const staging = config.env?.staging
const configuredDatabase = staging?.d1_databases?.find((database) => database.binding === 'DB')

console.log('Staging deployment preflight: validating configuration.')
if (!staging || !configuredDatabase) fail('wrangler.jsonc has no staging DB binding.')
matches(staging.account_id, target.accountId, 'Configured account ID')
matches(configuredDatabase.database_name, target.databaseName, 'Configured database name')
matches(configuredDatabase.database_id, target.databaseId, 'Configured database ID')
matches(staging.vars?.APP_BASE_URL, target.appBaseUrl, 'Configured app base URL')

console.log('Staging deployment preflight: validating Cloudflare login.')
const whoami = JSON.parse(execFileSync(wrangler, ['whoami', '--json'], { cwd: root, encoding: 'utf8' }))
if (!whoami.accounts?.some((account) => account.id === target.accountId)) {
  fail('The active Wrangler login cannot access the canonical Cloudflare account.')
}
if (whoami.email?.toLowerCase() !== target.accountEmail) {
  fail('The active Wrangler login is not the canonical account email.')
}

console.log('Staging deployment: building the verified staging bundle.')
if (existsSync(deployRedirect)) unlinkSync(deployRedirect)
const build = spawnSync(vite, ['build'], {
  cwd: root,
  env: { ...process.env, CLOUDFLARE_ENV: 'staging' },
  encoding: 'utf8',
})
ensureChildCompleted(build, 'Staging build')
if (!existsSync(generatedConfig)) fail('Vite did not generate the staging Wrangler configuration.')
if (!existsSync(deployRedirect)) fail('Vite did not generate a fresh Wrangler deployment redirect.')

const redirect = readJson(deployRedirect)
if (resolve(dirname(deployRedirect), redirect.configPath ?? '') !== generatedConfig) {
  fail('Fresh Wrangler deployment redirect does not point to the generated staging configuration.')
}

console.log('Staging deployment preflight: validating the generated Worker configuration.')
const generated = readJson(generatedConfig)
const generatedDatabase = generated.d1_databases?.find((database) => database.binding === 'DB')
if (!generatedDatabase) fail('Generated configuration has no DB binding.')
matches(generated.name, target.workerName, 'Generated Worker name')
matches(generated.account_id, target.accountId, 'Generated account ID')
matches(generatedDatabase.database_name, target.databaseName, 'Generated database name')
matches(generatedDatabase.database_id, target.databaseId, 'Generated database ID')
matches(generated.vars?.APP_BASE_URL, target.appBaseUrl, 'Generated app base URL')
matches(generated.targetEnvironment, 'staging', 'Generated target environment')

console.log('Staging deployment: publishing to the canonical target.')
const deploy = spawnSync(wrangler, ['deploy'], {
  cwd: root,
  env: { ...process.env, CLOUDFLARE_ENV: 'staging' },
  stdio: 'inherit',
})
console.log(
  `Staging deployment command completed (status: ${deploy.status ?? 'none'}, signal: ${deploy.signal ?? 'none'}).`,
)
ensureChildCompleted(deploy, 'Staging deployment')
