# Mint Meow Kids Store

An Egypt-first ecommerce application for personalized storybooks, coloring
books, stickers, educational games, and ready-to-ship kids' products.
It uses React + Vite + Tailwind on the client and a Cloudflare Worker with Hono,
Drizzle, and D1 on the server.

## What is included

- Arabic and English customer storefront with a guest-first, two-step checkout:
  product customization when needed, then delivery and manual payment.
- Products can be normal ready products or personalized products. Admin turns
  personalization on per product, then simply enables the fixed child name,
  age (0–18), gender (Boy/Girl), one-or-two private photos, and optional note
  fields. There is no arbitrary customer HTML or price-changing form logic.
- Manual InstaPay and generic Mobile Wallet proof submission, with an
  exact server-calculated total shown before the customer transfers. Only
  methods with real configured instructions are displayed; the bootstrap
  configuration enables InstaPay, its mobile payment link, and a Mobile
  Wallet that accepts Vodafone Cash, Orange Money, WE Pay, or Etisalat Cash.
- An encrypted, browser-bound server checkout draft retains the saved story
  and delivery form for up to 60 minutes after the customer continues. Payment
  screenshots are deliberately not retained or resumed.
- Governorate-based shipping (seeded at 85 EGP across all 27 governorates),
  sale prices, fixed-value promo codes, and configurable free-shipping
  threshold.
- Optional customer accounts for previous-order history and email reset links.
- Status-only order tracking and a private admin workspace for catalog search,
  galleries, product-specific personalization, payment review, lifecycle
  updates, reports, and editable store content.
- Private Cloudinary uploads for child images and payment proofs, with
  pre-order child photos expiring with the 60-minute checkout draft, and
  submitted-order photos, proofs, and sensitive personalization scheduled for
  deletion 30 days after delivery or cancellation.
- Six initial bilingual story collections and editable Arabic/English draft
  terms, returns, and privacy pages.
- Mint Meow’s approved visual reference is stored at
  `docs/brand/mint-meow-visual-reference.pdf`. Reusable logo and mascot assets
  are in `public/brand/`; use these rather than the previous brown/pink
  storefront styling. Mint acts as a contextual brand guide across discovery,
  product choice, loading, checkout, and success states; use approved poses
  only and obtain the character sheet before generating a new one. Sunshine
  CTAs always use deep mint ink, never white text.

All stored money values are integer piastres; displayed prices already include
VAT, and the application does not calculate VAT separately.

## Local setup

1. Install Node 22+ and pnpm 11+.
2. Copy `.dev.vars.example` to `.dev.vars` and populate the secrets.
3. Run `pnpm install`.
4. Run `pnpm db:migrate:local` followed by `pnpm db:seed:local`.
5. Run `pnpm dev` and open the shown local URL.

Localhost uses its own isolated local D1 database. It is never a view of the
canonical remote staging database or of a future production database.

To add one clearly fictional order for local Admin/Reports review, run
`pnpm db:seed:demo:local`. It is idempotent, adds no child photos or payment
proofs, and must never be run against the remote database.

### Cloudinary

Cloudinary credentials are required for catalog artwork, child photos, and
payment proofs. Use a dedicated staging product environment where possible,
copy `.dev.vars.example` to the ignored `.dev.vars`, and populate
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and
`CLOUDINARY_API_SECRET`. Never put the API secret in a `VITE_*` variable.

With the local Worker running, verify the authenticated-media path using only a
synthetic one-pixel image:

```sh
pnpm smoke:cloudinary
```

See `docs/cloudinary.md` for credential handling, smoke-test coverage, and
Cloudflare environment setup.

The storefront runs without story records until the first administrator adds
them; the initial collections, editable policy drafts, and confirmed InstaPay
details are seeded. Child-photo and payment-proof uploads require Cloudinary
credentials.

Product descriptions use safe Markdown. The editor supports common writing
formatting and tables, while raw HTML, scripts, embeds, and unsafe links are
not accepted or rendered.

`seed.sql` is bootstrap data only. Its conflict rules preserve admin edits, so
do not use it to update a live store; make ongoing setting, policy, collection,
and governorate changes through Admin or an explicit, reviewed migration.
Password-reset emails require Resend credentials in production; local
development logs a reset URL when mail settings are absent.

## First administrator on a brand-new database

For a new, empty database only, set a strong, random
`ADMIN_BOOTSTRAP_TOKEN` as a Worker secret and use the admin bootstrap
screen/API to create the first admin account. The bootstrap path becomes
unavailable once an admin exists. Do not place this token in frontend
environment variables. The canonical `m.baseeto` staging Worker already has a
migrated administrator, so it must not receive this secret.

## Quality checks

```sh
pnpm typecheck
pnpm test
pnpm build
```

## Cloudflare staging

The sole active remote test environment is the canonical `m.baseeto` staging
target:

- Worker: `personalized-storybooks-eg-staging`
- D1: `personalized-storybooks-eg-staging-db`
- URL: <https://personalized-storybooks-eg-staging.m-baseeto.workers.dev>

It contains only the curated storefront setup and administrator migration. Do
not copy or test with customer accounts, orders, sessions, drafts, rate limits,
uploads, or private media there. Run `pnpm db:migrate:staging` only as a
reviewed schema operation; do not run a bootstrap or demo seed remotely.

Deploy only with `pnpm deploy:staging`. Its preflight checks the canonical
Cloudflare account, Worker, D1 binding, and URL before it publishes the
generated staging configuration. Never run the local demo seed remotely.

Keep `SESSION_SECRET` and all three Cloudinary values as staging Worker
secrets. `ADMIN_BOOTSTRAP_TOKEN` is deliberately not configured because the
migrated administrator account already exists. After deployment, run:

```sh
SMOKE_BASE_URL=https://personalized-storybooks-eg-staging.m-baseeto.workers.dev pnpm smoke:cloudinary
```

The old `personalized-storybooks-eg.m-baseeto.workers.dev` Worker and the
previous `personalized-storybooks-eg-staging.mint-meow.workers.dev` Worker are
recovery references only. Do not deploy to, seed, or use either as an active
test URL.

The canonical Free-plan staging Worker temporarily sets
`PASSWORD_HASH_ITERATIONS=5000` so PBKDF2 can complete inside Cloudflare's
10 ms Free CPU limit. This exception applies only to this staging Worker and
must be removed after upgrading to Workers Paid. Production defaults to
150,000 iterations; a successful sign-in automatically rehashes a temporary
staging credential at the stronger work factor.

## Deferred Cloudflare production rollout

This application deploys as one full-stack **Cloudflare Worker with Static
Assets**. It is not a separate Pages project: the Worker serves the Hono API
and the built React application together.

Production Cloudflare resources are intentionally unprovisioned. Do not create
them or run `pnpm deploy` until the Workers upgrade and a separate production
rollout are approved. The current production deploy command is deliberately
guarded to fail before it can publish.

After those approvals, the rollout checklist is:

1. Create a production D1 database, then replace the placeholder
   `database_id` in `wrangler.jsonc`.
2. Apply the reviewed schema migrations with `pnpm db:migrate:remote`, then,
   only for a brand-new database, run `pnpm db:seed:remote:bootstrap` once.
   Never run the demo-order seed remotely.
3. Set Worker secrets for `SESSION_SECRET`, `ADMIN_BOOTSTRAP_TOKEN`,
   Cloudinary, and Resend. Put only non-sensitive runtime configuration such
   as `APP_BASE_URL` and `ENVIRONMENT=production` in Worker variables.
4. Deploy the Worker with the separately approved production deployment
   procedure, using its initial `workers.dev` URL as `APP_BASE_URL` until the
   production domain is connected.
5. In Cloudflare Dashboard, open the Worker’s **Settings → Builds** and connect
   the GitHub repository. Use Node 22, `pnpm build` as the build command, and
   only the separately approved production deploy command. Keep migrations and
   the bootstrap seed as explicit, reviewed operations rather than build steps.

The 15-minute Worker cron in `wrangler.jsonc` removes expired checkout drafts,
temporary uploads, and private assets that have reached their retention
deadline.

## Structure

- `src/client` — React pages, UI, localization behavior, and cart state.
- `src/server` — Worker, Hono routes, server-side services, and security.
- `src/shared` — Zod API contracts and shared constants.
- `drizzle` — D1 migration history.
- `PROJECT_CONTEXT.md` — final business decisions, phase-1 exclusions, and
  launch open items; read this first when continuing the project.
- `docs/architecture.md` — architecture and security rationale.
- `docs/brand/mint-meow-visual-reference.pdf` — canonical visual reference for
  the current Mint Meow brand implementation.

force update
