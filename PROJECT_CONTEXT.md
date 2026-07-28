# Project Context — Mint Meow Kids Store

This is the durable project handoff for future developers and AI assistants.
Read this file before changing checkout, payments, retention, or scope.

## Confirmed business decisions

### Store and audience

- Mint Meow is an Egyptian kids' store for personalized storybooks, coloring
  books, stickers, and educational games. It supports both personalized and
  ready-to-ship products.
- The initial site is bilingual Arabic and English. Catalog products may be
  normal ready products or personalized products; personalization never
  changes the listed price, availability, or preview.
- The confirmed brand name is Mint Meow. The visual reference source is
  `docs/brand/mint-meow-visual-reference.pdf`; it includes the logo,
  packaging, mascot, and supporting imagery. Treat it as the canonical source
  when making visual decisions.
- Reusable approved brand assets live under `public/brand/`. The active web
  palette is Dark Mint `#0D7D78`, Light Mint `#9FD9C2`, Sunshine `#FFD14D`,
  and Cream `#FAF8F3`. Do not reintroduce the old brown/pink brand styling.
- Sunshine is a call-to-action surface, not a white-text surface: use deep
  mint ink `#075F5B` for readable CTA labels. Display headings use Chewy with
  a friendly Arabic fallback; body copy remains deliberately legible.
- The web UI uses the approved monochrome Mint Meow wordmark direction rather
  than the earlier colorful wordmark. Mint mascot assets may guide discovery,
  learning, gifting, product choice, loading, checkout, empty states, and
  success moments. Mint is the brand guide, not a decorative afterthought;
  use an approved pose with a short, helpful message where it helps the next
  decision. Do not use Mint as a persistent fixed overlay that can obstruct
  mobile forms, and do not substitute her for product photography.
- Reuse only the supplied approved Mint poses for now. Before generating a
  new pose (for example pointing, walking, or a new celebration), request the
  character sheet so her facial and body features stay consistent.
- Displayed prices are EGP and already include VAT. The application must not
  calculate VAT separately.

### Catalog and delivery

- Initial collections are seeded in Arabic and English:
  - عوالم الأبطال / Hero Worlds
  - اكتشف العالم / Discover the World
  - تنمية الشخصية / Character Building
  - مشاعري وحياتي / Feelings & Life
  - قصص إسلامية / Islamic Stories
  - لحظات لا تنسى / Special Moments
- Delivery fees vary by governorate and are entered manually in the admin
  area. The initial seed is 85 EGP for every governorate.
- Free shipping is supported only when an admin configures a minimum order
  amount. It is calculated after any eligible promo discount.
- Promotions are fixed-amount codes. Only one code is allowed per order, and
  it can combine with a product sale price.

### Customization and checkout

- A normal ready product has no personalization definition and continues to
  delivery/payment without collecting child data. A personalized product owns
  a controlled, versioned definition. In phase 1, Admin can only toggle these
  fixed fields on or off: child name, age in whole years from 0–18, gender
  (Boy or Girl), one or two child photos, and an optional extra note.
- The fields, their validation, and the Boy/Girl choices are intentionally not
  editable in Admin. There is no arbitrary HTML, conditional logic, custom
  fields, or field-based pricing.
- There are exactly two customer-facing checkout steps:
  1. Customize the story.
  2. Enter delivery details, see the final total, make a manual transfer, and
     upload payment proof.
- The legacy /cart URL redirects to checkout; it must not become a third
  conversion step.
- Guest checkout comes first. Customers may optionally create a standard
  email/password account afterwards to view previous orders. There is no
  social login.
- A product becomes resumable only after the customer presses Continue to
  delivery & payment. Selected local files are deliberately not uploaded
  before that action, to avoid unnecessary child-photo transfer and storage.
- After continuing, the story, associated child photos, and delivery form are
  stored in an encrypted, browser-bound server draft for up to 60 minutes.
  Refreshing the page resumes the draft. Payment screenshots are never
  automatically saved or resumed.
- The final order stores an immutable personalization snapshot. Later product
  or form edits never change production instructions for an already submitted
  order.
- The browser does not persist child-photo claim tokens, child data, or
  delivery data in local or session storage. It only holds short-lived UI
  state; the actual draft is server-side and identified by an HTTP-only cookie.

### Manual payment

- Phase 1 has no payment gateway and no automatic payment verification.
- The checkout must show only payment methods that have real configured
  instructions. The server also enforces this, so a forged request cannot use
  an unconfigured method.
- Confirmed launch method:

  InstaPay  
  Phone: 01010851818  
  Payment link: https://ipn.eg/S/m201010851818/instapay/7Mw0Pk  
  Username: m201010851818@instapay

- The InstaPay link is deliberately tappable on mobile.
- Generic Mobile Wallet
  Phone: 01010851818
  Accepted from Vodafone Cash, Orange Money, WE Pay, and Etisalat Cash.
- A payment screenshot is reviewed manually before production begins.

### Orders, operations, and accounts

- The site exposes order status only. It does not expose courier tracking.
- Production, payment review, delivery, and other fulfilment operations happen
  outside the system.
- Basic email/password reset is used. Customers can view previous orders but
  do not manage fulfilment through their account.
- Policies are editable from the admin area. Initial Terms, Returns, and
  Privacy text is launch-draft copy and must receive local legal/business
  review before production launch.

### Privacy and retention

- Child photos and payment proofs are private authenticated assets, never
  public storefront URLs.
- Before order submission, child photos, personalization, and delivery details
  can remain in the encrypted checkout draft for at most 60 minutes.
- For submitted orders, child photos, payment proofs, and sensitive answers
  (currently age and gender) are scheduled for deletion 30 days after
  delivered or cancelled. The retained order snapshot marks sensitive content
  as removed after the purge.
- The Worker cleanup job runs every 15 minutes and safely retries failed
  private-media deletions.
- Rotating SESSION_SECRET intentionally invalidates active encrypted checkout
  drafts.

## Intentionally out of scope for phase 1

- Payment-gateway integrations, automatic payment verification, instalments,
  and stored payment methods.
- Social login.
- Courier integration, shipment labels, parcel tracking, and delivery-driver
  workflows.
- Production scheduling, printing workflow, inventory, and operations tooling
  outside basic order-status administration.
- VAT calculation, tax invoices, and multi-currency pricing.
- Product recommendations that change product content or price based on
  customer personalization.
- No extra mobile-wallet provider-specific checkout methods beyond the
  confirmed generic Mobile Wallet option.
- Customer self-service order changes, cancellation automation, or returns
  automation.
- Raw HTML in product descriptions, scripts, embeds, unsafe links, and a page
  builder. Product copy is safe Markdown only.
- Drag-and-drop/custom-code form builders, conditional personalization logic,
  and personalization-based pricing.
- Marketing or bounce analytics, payment integrations, multi-admin roles, and
  audit logs.

## Open items before production launch

Staging status as of 2026-07-29: the canonical remote test environment is the
`m.baseeto` Cloudflare staging Worker and D1 database at
<https://personalized-storybooks-eg-staging.m-baseeto.workers.dev>. It receives
only the approved storefront setup and administrator migration; customer
accounts, orders, sessions, rate limits, drafts, uploads, private media, and
other order-related data remain outside it. Localhost uses an isolated local
D1 database and is not a view of this staging target.

The older `personalized-storybooks-eg.m-baseeto.workers.dev` Worker and the
former `personalized-storybooks-eg-staging.mint-meow.workers.dev` Worker remain
untouched as recovery references only; neither is an active test or deployment
target. The canonical staging Worker temporarily uses a 5,000-iteration PBKDF2
work factor solely because it is on Workers Free. Remove that exception after
upgrading to Workers Paid. Production Cloudflare resources remain
unprovisioned, and no production rollout may begin until that upgrade and a
separate approval are complete.

1. Confirm the internal process for reviewing InstaPay and mobile-wallet
   payment proofs before production begins.
2. Provide the final production domain, favicon/app icon, final English font
   choice, and replacement product photography. Temporary generated/catalog
   imagery must remain easy to replace.
3. Add products, cover/gallery media, Arabic/English copy, safe Markdown
   descriptions, ready/personalized product settings, prices, add-ons, and
   category assignments through admin.
4. Choose the free-shipping threshold, if any.
5. Provide support email, privacy email, WhatsApp URL, business identity, and
   effective dates; replace the placeholders in the policy drafts.
6. Obtain Egyptian legal review of Terms, Returns, and Privacy Policy before
   publishing the production storefront.
7. For a separately approved production rollout, configure production
   Cloudflare/D1 resources, Cloudinary, SESSION_SECRET,
   ADMIN_BOOTSTRAP_TOKEN, production APP_BASE_URL, and Resend if
   password-reset emails should be sent in production.
8. After a future new production database is provisioned, create its first
   admin account through the bootstrap flow, then configure governorate fees
   and manual payment details from Admin.
9. Perform staging tests of real upload, manual-transfer, scheduled-cleanup,
   mobile payment-link, report totals, and order-review flows using
   non-sensitive test data.
10. Configure customer support phone, email, WhatsApp, business hours,
    delivery/payment guidance, announcement-bar copy, and SEO/social defaults
    in Admin before launch.

## Change-management notes

- seed.sql is first-install bootstrap data. Its conflicts intentionally use
  DO NOTHING, so re-running it does not overwrite admin-edited governorate
  fees, collections, policies, or payment settings.
- Use an explicit, reviewed migration or an admin update for later baseline
  data changes; do not turn the seed back into an overwrite mechanism.
- Keep server-side pricing authoritative. The browser quote is for customer
  clarity only; final order creation recalculates the price and promotion.
- Admin reports are operational aggregates only. They intentionally exclude
  customer PII and private media. Confirmed revenue includes orders currently
  in `payment_confirmed`, `in_production`, `shipped`, or `delivered`; pending
  and rejected/cancelled values are shown separately.
- For a fuller technical map, read docs/architecture.md after this file.
