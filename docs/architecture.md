# Architecture decisions

## Foundation inherited from the reference

The application is a single Cloudflare deployment: a React 18/Vite storefront
is served as Worker assets, while Hono handles the JSON API under `/api`.
React, server, and shared contract code are kept separate:

- `src/client/` — React routes, TanStack Query data access, React Hook Form UI,
  Tailwind styles, and short-lived display state; the real checkout draft is
  encrypted and stored server-side.
- `src/server/` — the Worker entry point, feature route modules, services,
  security utilities, and Drizzle data access.
- `src/shared/` — Zod request contracts and small cross-runtime constants.
- `drizzle/` — versioned D1 migrations; it is the source of truth for schema
  changes.

This retains the reference project's React + Vite + Tailwind, Hono + Workers,
Drizzle + D1, and Cloudinary approach without carrying across its business
logic.

## Deployment environments

- Local development uses an isolated local D1 database. Localhost never reads
  from or writes to a remote Worker database.
- The sole active remote test target is the canonical `m.baseeto` staging
  Worker at
  <https://personalized-storybooks-eg-staging.m-baseeto.workers.dev>, backed by
  `personalized-storybooks-eg-staging-db`.
- The old `personalized-storybooks-eg.m-baseeto.workers.dev` Worker and former
  `personalized-storybooks-eg-staging.mint-meow.workers.dev` staging Worker are
  recovery references only and must not receive deployments or test data.
- Production resources are intentionally unprovisioned. A Workers upgrade and
  separate production rollout approval are required before creating them.

## Store-specific boundaries

- Customer checkout is guest-first. Email/password accounts are optional and
  only expose the customer's previous orders.
- Checkout has exactly two customer-facing steps: (1) a product page collects
  only the enabled personalization fields, if any, then (2) `/checkout`
  collects delivery and payment. Ready products have no form or child upload
  requirement. The historical `/cart` URL redirects to step two, so it cannot
  become a third conversion step.
- The checkout delivery contract is deliberately short: recipient full name,
  required phone, governorate, city/area, and one address-details field.
  Email is optional. Historic address-line data remains readable internally
  without making the conversion form longer.
- Once a customer continues from customization, the server attaches the child
  photos to a 60-minute encrypted checkout draft tied to an HTTP-only cookie.
  The customer can refresh and resume without browser storage; the payment
  screenshot is not uploaded or persisted until final submission.
- Each product may carry a controlled, versioned personalization definition.
  A null definition is a normal ready product. For personalized products, the
  admin only toggles the fixed child-name, age, gender, child-photo, and note
  fields; React renders that enabled subset and the API validates it again.
  The order item records an immutable snapshot so catalog changes cannot alter
  production instructions after purchase.
- Before payment, checkout calls a server-side quote route using the same
  pricing service as final order creation. It calculates the selected
  governorate, fixed promo, free-shipping rule, payment plan, current payment
  due, and delivery balance. Final checkout recalculates and reserves a promo
  atomically, so the browser quote cannot be trusted on its own.
- Full-upfront manual payment uses InstaPay or generic Mobile Wallet. The
  server applies an InstaPay incentive only to a full-upfront choice: 5% of
  post-promo merchandise, capped at 3,000 piastres (30 EGP), never shipping.
  Personalized carts may alternatively pay a 50% deposit on their post-promo
  personalized merchandise (rounded up); their ready-item value, remaining
  personalized balance, and shipping are due on delivery. Deposits receive no
  InstaPay incentive. Ready-only carts may use no-deposit COD; personalized
  carts cannot.
- Child photos and transfer/deposit payment proofs are Cloudinary
  `authenticated` assets. The browser receives a short-lived upload signature
  but never a delivery URL; authenticated bytes are only proxied to an
  authenticated admin session. COD does not collect a payment proof.
- Sensitive assets and sensitive personalization values are scheduled for
  deletion 30 days after an order reaches `delivered` or `cancelled`. A
  15-minute Worker cron retries deletion safely and marks the retained order
  snapshot as purged without removing the operational order record.
- All checkout prices are recomputed server-side from product snapshots,
  selected addons, a fixed-amount promotion, and the selected governorate.
  Stored price amounts are integer piastres and already include VAT.
- Shipping is a governorate table. The initial Egypt seed is 85 EGP for every
  governorate, editable from the admin side.
- The initial seed provides six bilingual collections plus editable bilingual
  terms, returns, and privacy drafts. The policy drafts include placeholders and
  require business completion and Egyptian legal review before launch.
- The seed is bootstrap-only and deliberately preserves later admin edits to
  payment details, governorate fees, collections, and policy content.
- The fulfillment workflow is intentionally status-only. It does not model a
  courier or parcel-tracking number. A no-deposit COD order begins in
  `cod_pending_confirmation`; only an admin can move it to production or
  shipping, or cancel it. Orders persist payment plan, payment state,
  incentive, amount due now, actual amount paid, and amount due on delivery so
  manual review and cash collection are not inferred from gross order value.
- Admin catalog endpoints are server-backed and paginated, with status and
  collection filters, safe archive/restore behavior, and permanent deletion
  only for unused drafts. Galleries are private catalog records with an
  explicit cover image and ordering.
- Product descriptions are safe Markdown. The contract rejects raw HTML and
  unsafe protocols, and the client renders a restricted Markdown subset rather
  than injecting page HTML.
- Reporting is derived server-side from order snapshots and status history.
  It returns aggregates only: submitted/accepted order value, actual collected
  revenue, pending transfer value, pending COD confirmation, active COD
  outstanding, status mix, trends, top stories, promotion results,
  shipping/discount totals, and governorate breakdowns. Accepted order value
  is separate from cash collected, so a confirmed deposit is not misreported
  as the entire order total.
- Arbitrary header code, arbitrary third-party scripts, and automatic
  marketing outreach remain unsupported. Phase 2 adds only a constrained,
  minimum-data recovery queue and known analytics/pixel provider IDs.

## Phase 2 recovery and tracking boundaries

- Saved-cart recovery is not a second checkout store. The existing encrypted,
  browser-bound 60-minute draft remains the only place that can hold child
  details, full address, notes, upload claims, or payment proof before order
  submission.
- Eligible delivery contact details are saved with the revision-protected
  checkout draft. At draft expiry, the Worker whitelists and AES-GCM encrypts
  only phone, optional email, governorate/city, selected payment plan/method,
  and public product/add-on summary. It excludes the recipient/child name, all
  personalization, media, full address, notes, promo text, payment proof, and
  the draft token.
- Recovery leads have a 30-day lifetime, a keyed normalized-phone HMAC for
  post-order suppression, and admin-only `private, no-store` responses. They
  support staff workflow status only; no automatic messages are sent. The
  source draft is marked consumed in the same D1 batch as order creation so a
  failed cleanup cannot turn a completed order into an abandoned lead.
- `ABANDONED_CART_ENCRYPTION_SECRET` is separate from `SESSION_SECRET` and
  must be a fresh 32+ character Worker secret. Do not rotate it while any
  recovery lead remains, unless a versioned-key migration is introduced.
- Admin can configure only syntactically validated public GTM, GA4, Meta, and
  TikTok IDs. There is no raw header/script/HTML field. Tracking requires
  affirmative client consent scoped to the exact configured provider IDs;
  changing the provider configuration triggers a fresh decision.
- Events use route templates and anonymous public catalog IDs, quantities,
  values, and a fixed payment-method enum. Contact data, addresses, child and
  personalization data, payment proof, order numbers, raw URLs, and query
  values are excluded at both type and runtime validation boundaries.
- Vendor SDKs cannot reliably be unloaded from an SPA document. If a document
  that loaded them enters admin, account, reset-password, order-tracking, or
  order-confirmation routes, the client performs one hard reload into a clean
  document before that sensitive view is painted. Visitors can revoke or
  revisit their preference from the persistent Privacy choices link.

## Security choices

- Database-backed, revocable HTTP-only sessions rather than unsigned browser
  tokens.
- CSRF-origin checks on state-changing browser requests and D1-backed rate
  limits for sign-in, reset, upload signing, and checkout-sensitive actions.
- No seeded administrator password. Bootstrap requires a deployment secret and
  is disabled after the first administrator exists.
- Customer tracking requires both the order number and normalized phone number,
  and returns only the order status.
- Privacy-sensitive upload claims and child names are never written to browser
  local storage.
- Checkout drafts use AES-GCM encryption with a key derived from the Worker
  session secret. The opaque draft token is held only in a SameSite HTTP-only
  cookie, and all responses carrying a draft use Cache-Control: no-store.
- A revision compare-and-swap guards draft writes, so overlapping tabs or
  autosave requests cannot silently replace a newer encrypted payload.
- Decrypted recovery leads are admin-authenticated, `Cache-Control: private,
  no-store`, and their React Query cache is explicitly cleared on admin
  logout.
- Final checkout validates that a selected manual transfer method still has
  configured customer-facing instructions, validates the plan/product
  eligibility, and requires proof only for transfers or deposits. The browser
  alone cannot enable a disabled transfer method or turn a personalized cart
  into no-deposit COD.
- API validation responses may include safe field paths and rule codes. The
  browser maps those codes to localized recovery copy, focuses the first
  invalid control, and keeps authentication failures intentionally generic.

## Improvements over the reference pattern

The reference's broad shape is useful, but this project intentionally avoids
public draft content, default credentials, raw `any` request paths, public
private-media links, and settings that could accidentally expose secrets. It
also adds explicit sensitive-data retention, server-side checkout pricing,
revocable sessions, validation at API boundaries, and status-transition rules.
