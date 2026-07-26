-- LOCAL DEVELOPMENT ONLY — never run this file with --remote.
--
-- This creates one clearly fictional order for reviewing the local Admin
-- Orders and Reports screens. It deliberately contains no child photos or
-- payment-proof records, so it never introduces fake or public media links.
--
-- The seed is idempotent. It expects the existing local `test` product with
-- id 77875b9d-de5d-4a1d-8223-dca7aec096cd and Cairo's seeded governorate.

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO promo_codes (
  id,
  code,
  fixed_discount_amount,
  minimum_subtotal_amount,
  max_redemptions,
  redemption_count,
  is_active
)
VALUES (
  'c2a78bf9-5014-4e9f-8ffb-0bdf4a40c001',
  'LOCAL50',
  5000,
  NULL,
  NULL,
  0,
  1
);

INSERT OR IGNORE INTO orders (
  id,
  order_number,
  customer_account_id,
  status,
  customer_name,
  email,
  phone,
  governorate_id,
  governorate_name,
  city,
  address_line_1,
  address_line_2,
  address_note,
  payment_method,
  subtotal_amount,
  promo_code_id,
  promo_code,
  promo_discount_amount,
  shipping_fee_amount,
  free_shipping_threshold_amount,
  total_amount,
  currency
)
SELECT
  'c2a78bf9-5014-4e9f-8ffb-0bdf4a40c002',
  'SB-LOCAL-DEMO-01',
  NULL,
  'payment_confirmed',
  'Demo Customer',
  'demo.customer@example.test',
  '01000000000',
  'gov-cairo',
  'Cairo',
  'Nasr City',
  'Local test address — not a real delivery',
  NULL,
  'Fictional local data for reviewing the admin workspace.',
  'instapay',
  85000,
  'c2a78bf9-5014-4e9f-8ffb-0bdf4a40c001',
  'LOCAL50',
  5000,
  8500,
  NULL,
  88500,
  'EGP'
WHERE EXISTS (
  SELECT 1
  FROM products
  WHERE id = '77875b9d-de5d-4a1d-8223-dca7aec096cd'
)
  AND EXISTS (
    SELECT 1
    FROM governorates
    WHERE id = 'gov-cairo'
  );

INSERT OR IGNORE INTO order_items (
  id,
  order_id,
  product_id,
  product_slug,
  product_title,
  product_image_url,
  base_unit_price_amount,
  sale_unit_price_amount,
  final_unit_price_amount,
  quantity,
  child_name,
  story_language,
  customer_note,
  personalization_snapshot,
  sensitive_personalization,
  sensitive_personalization_purged_at,
  line_total_amount
)
SELECT
  'c2a78bf9-5014-4e9f-8ffb-0bdf4a40c003',
  'c2a78bf9-5014-4e9f-8ffb-0bdf4a40c002',
  product.id,
  product.slug,
  COALESCE(
    (
      SELECT title
      FROM product_translations
      WHERE product_id = product.id AND locale = 'en'
      LIMIT 1
    ),
    product.slug
  ),
  (
    SELECT url
    FROM product_media
    WHERE product_id = product.id
    ORDER BY sort_order ASC, id ASC
    LIMIT 1
  ),
  product.base_price_amount,
  product.sale_price_amount,
  COALESCE(product.sale_price_amount, product.base_price_amount),
  1,
  'Mira',
  'en',
  'Local-only sample order. No production action is needed.',
  '{"version":1,"fields":[{"key":"childName","type":"short_text","required":true,"label":{"en":"Child name","ar":"اسم الطفل"},"help":null,"sensitive":false,"min":1,"max":80},{"key":"childPhotos","type":"photo","required":true,"label":{"en":"Child photos","ar":"صور الطفل"},"help":{"en":"Upload one or two clear photos.","ar":"ارفع صورة أو صورتين واضحتين."},"sensitive":true,"min":1,"max":2},{"key":"storyLanguage","type":"story_language","required":true,"label":{"en":"Story language","ar":"لغة القصة"},"help":null,"sensitive":false},{"key":"age","type":"whole_number","required":true,"label":{"en":"Child age","ar":"عمر الطفل"},"help":null,"sensitive":true,"min":0,"max":18},{"key":"gender","type":"single_select","required":true,"label":{"en":"Child gender","ar":"جنس الطفل"},"help":null,"sensitive":true,"options":[{"value":"boy","label":{"en":"Boy","ar":"ولد"}},{"value":"girl","label":{"en":"Girl","ar":"بنت"}}]},{"key":"note","type":"long_text","required":false,"label":{"en":"Note for the storyteller","ar":"ملاحظة للكاتب"},"help":null,"sensitive":false,"max":500}],"answers":{"childName":"Mira","storyLanguage":"en","note":"Local-only sample order. No production action is needed."}}',
  '{"version":1,"fields":[{"key":"childPhotos","type":"photo","required":true,"label":{"en":"Child photos","ar":"صور الطفل"},"help":{"en":"Upload one or two clear photos.","ar":"ارفع صورة أو صورتين واضحتين."},"sensitive":true,"min":1,"max":2},{"key":"age","type":"whole_number","required":true,"label":{"en":"Child age","ar":"عمر الطفل"},"help":null,"sensitive":true,"min":0,"max":18},{"key":"gender","type":"single_select","required":true,"label":{"en":"Child gender","ar":"جنس الطفل"},"help":null,"sensitive":true,"options":[{"value":"boy","label":{"en":"Boy","ar":"ولد"}},{"value":"girl","label":{"en":"Girl","ar":"بنت"}}]}],"answers":{"age":6,"gender":"girl"}}',
  NULL,
  COALESCE(product.sale_price_amount, product.base_price_amount)
FROM products AS product
WHERE product.id = '77875b9d-de5d-4a1d-8223-dca7aec096cd'
  AND EXISTS (
    SELECT 1
    FROM orders
    WHERE id = 'c2a78bf9-5014-4e9f-8ffb-0bdf4a40c002'
  );

INSERT OR IGNORE INTO order_status_history (
  id,
  order_id,
  from_status,
  to_status,
  changed_by_admin_id,
  customer_visible_note
)
SELECT
  'c2a78bf9-5014-4e9f-8ffb-0bdf4a40c004',
  id,
  NULL,
  'payment_submitted',
  NULL,
  NULL
FROM orders
WHERE id = 'c2a78bf9-5014-4e9f-8ffb-0bdf4a40c002';

INSERT OR IGNORE INTO order_status_history (
  id,
  order_id,
  from_status,
  to_status,
  changed_by_admin_id,
  customer_visible_note
)
SELECT
  'c2a78bf9-5014-4e9f-8ffb-0bdf4a40c005',
  id,
  'payment_submitted',
  'payment_confirmed',
  NULL,
  'Payment confirmed for this fictional local demo order.'
FROM orders
WHERE id = 'c2a78bf9-5014-4e9f-8ffb-0bdf4a40c002';

INSERT OR IGNORE INTO promo_code_redemptions (
  promo_code_id,
  order_id,
  discount_amount
)
SELECT
  'c2a78bf9-5014-4e9f-8ffb-0bdf4a40c001',
  'c2a78bf9-5014-4e9f-8ffb-0bdf4a40c002',
  5000
WHERE EXISTS (
  SELECT 1
  FROM orders
  WHERE id = 'c2a78bf9-5014-4e9f-8ffb-0bdf4a40c002'
);

UPDATE promo_codes
SET redemption_count = (
  SELECT COUNT(*)
  FROM promo_code_redemptions
  WHERE promo_code_id = 'c2a78bf9-5014-4e9f-8ffb-0bdf4a40c001'
)
WHERE id = 'c2a78bf9-5014-4e9f-8ffb-0bdf4a40c001';
