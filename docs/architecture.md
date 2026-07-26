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

## Store-specific boundaries

- Customer checkout is guest-first. Email/password accounts are optional and
  only expose the customer's previous orders.
- Checkout has exactly two customer-facing steps: (1) a product page collects
  only the enabled personalization fields, if any, then (2) `/checkout`
  collects delivery and payment. Ready products have no form or child upload
  requirement. The historical `/cart` URL redirects to step two, so it cannot
  become a third conversion step.
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
- Before a manual transfer, the checkout calls a server-side quote route using
  the same pricing service as final order creation. This shows the exact total
  after the selected governorate, fixed promo, and free-shipping rule. Final
  checkout still recalculates and reserves a promo atomically, so a changing
  promotion cannot be trusted from the browser quote alone.
- Child photos and payment proofs are Cloudinary `authenticated` assets. The
  browser receives a short-lived upload signature but never a delivery URL;
  authenticated bytes are only proxied to an authenticated admin session.
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
  courier or parcel-tracking number.
- Admin catalog endpoints are server-backed and paginated, with status and
  collection filters, safe archive/restore behavior, and permanent deletion
  only for unused drafts. Galleries are private catalog records with an
  explicit cover image and ordering.
- Product descriptions are safe Markdown. The contract rejects raw HTML and
  unsafe protocols, and the client renders a restricted Markdown subset rather
  than injecting page HTML.
- Reporting is derived server-side from order snapshots and status history.
  It returns aggregates only: revenue, status mix, trends, top stories,
  promotion results, shipping/discount totals, and governorate breakdowns.

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
- Final checkout validates that the chosen manual payment method still has
  configured customer-facing instructions; the browser alone cannot enable a
  disabled transfer method.
- API validation responses may include safe field paths and rule codes. The
  browser maps those codes to localized recovery copy, focuses the first
  invalid control, and keeps authentication failures intentionally generic.

## Improvements over the reference pattern

The reference's broad shape is useful, but this project intentionally avoids
public draft content, default credentials, raw `any` request paths, public
private-media links, and settings that could accidentally expose secrets. It
also adds explicit sensitive-data retention, server-side checkout pricing,
revocable sessions, validation at API boundaries, and status-transition rules.
