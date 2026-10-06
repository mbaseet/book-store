CREATE TABLE `email_verification_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_account_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`customer_account_id`) REFERENCES `customer_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_verification_hash_idx` ON `email_verification_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `email_verification_account_idx` ON `email_verification_tokens` (`customer_account_id`);--> statement-breakpoint
CREATE TABLE `notification_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe_key` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`sent_at` integer,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_jobs_dedupe_idx` ON `notification_jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notification_jobs_due_idx` ON `notification_jobs` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `customer_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`display_name` text NOT NULL,
	`locale` text NOT NULL,
	`rating` integer NOT NULL,
	`comment` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`publication_consent_at` integer NOT NULL,
	`moderated_at` integer,
	`moderation_reason` text,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_reviews_order_idx` ON `customer_reviews` (`order_id`);--> statement-breakpoint
CREATE INDEX `customer_reviews_status_created_idx` ON `customer_reviews` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `orders` ADD `locale` text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_accounts` ADD `email_verified_at` integer;--> statement-breakpoint
ALTER TABLE `categories` ADD `banner_media` text;
--> statement-breakpoint
-- Map only the current state. Historical events, payments and purge deadlines stay intact.
UPDATE orders SET payment_status = status WHERE status IN ('action_required', 'payment_rejected');
--> statement-breakpoint
UPDATE orders SET status = 'in_review' WHERE status IN ('payment_submitted', 'action_required', 'payment_rejected');
--> statement-breakpoint
UPDATE orders SET status = 'confirmed' WHERE status = 'payment_confirmed';
--> statement-breakpoint
UPDATE orders SET status = 'preparing_order' WHERE status = 'in_production'
AND EXISTS (SELECT 1 FROM order_items WHERE order_id = orders.id)
AND NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = orders.id AND (personalization_snapshot IS NOT NULL OR child_name IS NOT NULL OR story_language IS NOT NULL));
--> statement-breakpoint
UPDATE categories SET image_url = '/brand/ux-refresh/hero-worlds-card.webp', banner_media = '{"en":{"desktop":"/brand/ux-refresh/hero-worlds-banner.webp"}}' WHERE slug = 'hero-worlds';
--> statement-breakpoint
UPDATE categories SET image_url = '/brand/ux-refresh/discover-the-world-card.webp', banner_media = '{"en":{"desktop":"/brand/ux-refresh/discover-the-world-banner.webp"}}' WHERE slug = 'discover-the-world';
--> statement-breakpoint
UPDATE categories SET image_url = '/brand/ux-refresh/character-building-card.webp', banner_media = '{"en":{"desktop":"/brand/ux-refresh/character-building-banner.webp"}}' WHERE slug = 'character-building';
--> statement-breakpoint
UPDATE categories SET image_url = '/brand/ux-refresh/feelings-and-life-card.webp', banner_media = '{"en":{"desktop":"/brand/ux-refresh/feelings-and-life-banner.webp"}}' WHERE slug = 'feelings-and-life';
--> statement-breakpoint
UPDATE categories SET image_url = '/brand/ux-refresh/islamic-stories-card.webp', banner_media = '{"en":{"desktop":"/brand/ux-refresh/islamic-stories-banner.webp"}}' WHERE slug = 'islamic-stories';
--> statement-breakpoint
UPDATE categories SET image_url = '/brand/ux-refresh/special-moments-card.webp', banner_media = '{"en":{"desktop":"/brand/ux-refresh/special-moments-banner.webp"}}' WHERE slug = 'special-moments';
