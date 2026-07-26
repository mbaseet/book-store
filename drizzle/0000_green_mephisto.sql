CREATE TABLE `admins` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admins_email_unique` ON `admins` (`email`);--> statement-breakpoint
CREATE TABLE `customer_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`phone` text,
	`display_name` text,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_accounts_email_unique` ON `customer_accounts` (`email`);--> statement-breakpoint
CREATE INDEX `customer_accounts_phone_idx` ON `customer_accounts` (`phone`);--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_account_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`customer_account_id`) REFERENCES `customer_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_reset_tokens_hash_idx` ON `password_reset_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `password_reset_tokens_account_idx` ON `password_reset_tokens` (`customer_account_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`action` text NOT NULL,
	`attempted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_subject_action_time_idx` ON `rate_limits` (`subject`,`action`,`attempted_at`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`image_url` text,
	`cloudinary_public_id` text,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE INDEX `categories_featured_sort_idx` ON `categories` (`is_featured`,`sort_order`);--> statement-breakpoint
CREATE TABLE `category_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_translations_category_locale_idx` ON `category_translations` (`category_id`,`locale`);--> statement-breakpoint
CREATE TABLE `product_addon_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`product_addon_id` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`product_addon_id`) REFERENCES `product_addons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_addon_translations_addon_locale_idx` ON `product_addon_translations` (`product_addon_id`,`locale`);--> statement-breakpoint
CREATE TABLE `product_addons` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`price_amount` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_addons_product_active_sort_idx` ON `product_addons` (`product_id`,`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `product_categories` (
	`product_id` text NOT NULL,
	`category_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	PRIMARY KEY(`product_id`, `category_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_categories_category_idx` ON `product_categories` (`category_id`);--> statement-breakpoint
CREATE TABLE `product_media` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`kind` text DEFAULT 'gallery' NOT NULL,
	`url` text NOT NULL,
	`cloudinary_public_id` text,
	`alt_text` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_media_product_sort_idx` ON `product_media` (`product_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `product_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	`short_description` text,
	`description` text,
	`meta_title` text,
	`meta_description` text,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_translations_product_locale_idx` ON `product_translations` (`product_id`,`locale`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`base_price_amount` integer NOT NULL,
	`sale_price_amount` integer,
	`is_featured` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `products_status_featured_sort_idx` ON `products` (`status`,`is_featured`,`sort_order`);--> statement-breakpoint
CREATE TABLE `content_page_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`content_page_id` text NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`content_page_id`) REFERENCES `content_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_page_translations_page_locale_idx` ON `content_page_translations` (`content_page_id`,`locale`);--> statement-breakpoint
CREATE TABLE `content_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`is_published` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_pages_key_unique` ON `content_pages` (`key`);--> statement-breakpoint
CREATE INDEX `content_pages_published_idx` ON `content_pages` (`is_published`);--> statement-breakpoint
CREATE TABLE `faq_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`faq_id` text NOT NULL,
	`locale` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`faq_id`) REFERENCES `faqs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `faq_translations_faq_locale_idx` ON `faq_translations` (`faq_id`,`locale`);--> statement-breakpoint
CREATE TABLE `faqs` (
	`id` text PRIMARY KEY NOT NULL,
	`is_published` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `faqs_published_sort_idx` ON `faqs` (`is_published`,`sort_order`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`is_public` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_settings_key_unique` ON `site_settings` (`key`);--> statement-breakpoint
CREATE TABLE `testimonial_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`testimonial_id` text NOT NULL,
	`locale` text NOT NULL,
	`quote` text NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`testimonial_id`) REFERENCES `testimonials`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `testimonial_translations_testimonial_locale_idx` ON `testimonial_translations` (`testimonial_id`,`locale`);--> statement-breakpoint
CREATE TABLE `testimonials` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`is_published` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `testimonials_published_sort_idx` ON `testimonials` (`is_published`,`sort_order`);--> statement-breakpoint
CREATE TABLE `governorates` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name_en` text NOT NULL,
	`name_ar` text NOT NULL,
	`shipping_fee_amount` integer DEFAULT 8500 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `governorates_code_unique` ON `governorates` (`code`);--> statement-breakpoint
CREATE INDEX `governorates_active_sort_idx` ON `governorates` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `order_internal_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`author_admin_id` text,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_admin_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `order_internal_notes_order_created_idx` ON `order_internal_notes` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_item_addons` (
	`id` text PRIMARY KEY NOT NULL,
	`order_item_id` text NOT NULL,
	`product_addon_id` text,
	`addon_name` text NOT NULL,
	`unit_price_amount` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`line_total_amount` integer NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_addon_id`) REFERENCES `product_addons`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `order_item_addons_item_idx` ON `order_item_addons` (`order_item_id`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text,
	`product_slug` text NOT NULL,
	`product_title` text NOT NULL,
	`product_image_url` text,
	`base_unit_price_amount` integer NOT NULL,
	`sale_unit_price_amount` integer,
	`final_unit_price_amount` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`child_name` text NOT NULL,
	`story_language` text NOT NULL,
	`customer_note` text,
	`line_total_amount` integer NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_sensitive_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`order_item_id` text,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`cloudinary_public_id` text NOT NULL,
	`delete_after` integer NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `order_sensitive_assets_order_idx` ON `order_sensitive_assets` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_sensitive_assets_due_for_deletion_idx` ON `order_sensitive_assets` (`deleted_at`,`delete_after`);--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`changed_by_admin_id` text,
	`customer_visible_note` text,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by_admin_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `order_status_history_order_created_idx` ON `order_status_history` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`customer_account_id` text,
	`status` text DEFAULT 'payment_submitted' NOT NULL,
	`customer_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`governorate_id` text,
	`governorate_name` text NOT NULL,
	`city` text NOT NULL,
	`address_line_1` text NOT NULL,
	`address_line_2` text,
	`address_note` text,
	`payment_method` text NOT NULL,
	`subtotal_amount` integer NOT NULL,
	`promo_code_id` text,
	`promo_code` text,
	`promo_discount_amount` integer DEFAULT 0 NOT NULL,
	`shipping_fee_amount` integer NOT NULL,
	`free_shipping_threshold_amount` integer,
	`total_amount` integer NOT NULL,
	`currency` text DEFAULT 'EGP' NOT NULL,
	`sensitive_data_purge_at` integer,
	`sensitive_data_purged_at` integer,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`customer_account_id`) REFERENCES `customer_accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`governorate_id`) REFERENCES `governorates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`promo_code_id`) REFERENCES `promo_codes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `orders_status_created_idx` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_phone_created_idx` ON `orders` (`phone`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_customer_created_idx` ON `orders` (`customer_account_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `promo_code_redemptions` (
	`promo_code_id` text NOT NULL,
	`order_id` text NOT NULL,
	`discount_amount` integer NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	PRIMARY KEY(`promo_code_id`, `order_id`),
	FOREIGN KEY (`promo_code_id`) REFERENCES `promo_codes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promo_code_redemptions_order_idx` ON `promo_code_redemptions` (`order_id`);--> statement-breakpoint
CREATE TABLE `promo_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`fixed_discount_amount` integer NOT NULL,
	`minimum_subtotal_amount` integer,
	`starts_at` integer,
	`ends_at` integer,
	`max_redemptions` integer,
	`redemption_count` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promo_codes_code_unique` ON `promo_codes` (`code`);--> statement-breakpoint
CREATE INDEX `promo_codes_active_dates_idx` ON `promo_codes` (`is_active`,`starts_at`,`ends_at`);