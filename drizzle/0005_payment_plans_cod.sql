PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`customer_account_id` text,
	`status` text DEFAULT 'payment_submitted' NOT NULL,
	`customer_name` text NOT NULL,
	`email` text,
	`phone` text NOT NULL,
	`governorate_id` text,
	`governorate_name` text NOT NULL,
	`city` text NOT NULL,
	`address_line_1` text NOT NULL,
	`address_line_2` text,
	`address_note` text,
	`payment_plan` text DEFAULT 'full_upfront' NOT NULL,
	`payment_method` text NOT NULL,
	`payment_status` text DEFAULT 'payment_submitted' NOT NULL,
	`subtotal_amount` integer NOT NULL,
	`promo_code_id` text,
	`promo_code` text,
	`promo_discount_amount` integer DEFAULT 0 NOT NULL,
	`instapay_discount_amount` integer DEFAULT 0 NOT NULL,
	`shipping_fee_amount` integer NOT NULL,
	`free_shipping_threshold_amount` integer,
	`total_amount` integer NOT NULL,
	`amount_due_now` integer DEFAULT 0 NOT NULL,
	`amount_paid` integer DEFAULT 0 NOT NULL,
	`amount_due_on_delivery` integer DEFAULT 0 NOT NULL,
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
INSERT INTO `__new_orders`(
	`id`, `order_number`, `customer_account_id`, `status`, `customer_name`, `email`, `phone`,
	`governorate_id`, `governorate_name`, `city`, `address_line_1`, `address_line_2`, `address_note`,
	`payment_plan`, `payment_method`, `payment_status`, `subtotal_amount`, `promo_code_id`, `promo_code`,
	`promo_discount_amount`, `instapay_discount_amount`, `shipping_fee_amount`, `free_shipping_threshold_amount`,
	`total_amount`, `amount_due_now`, `amount_paid`, `amount_due_on_delivery`, `currency`,
	`sensitive_data_purge_at`, `sensitive_data_purged_at`, `created_at`, `updated_at`
)
SELECT
	`id`, `order_number`, `customer_account_id`, `status`, `customer_name`, `email`, `phone`,
	`governorate_id`, `governorate_name`, `city`, `address_line_1`, `address_line_2`, `address_note`,
	'full_upfront', `payment_method`,
	CASE
		WHEN `status` IN ('payment_confirmed', 'in_production', 'shipped', 'delivered') THEN 'paid'
		WHEN `status` = 'payment_rejected' THEN 'payment_rejected'
		ELSE 'payment_submitted'
	END,
	`subtotal_amount`, `promo_code_id`, `promo_code`, `promo_discount_amount`, 0,
	`shipping_fee_amount`, `free_shipping_threshold_amount`, `total_amount`, `total_amount`,
	CASE WHEN `status` IN ('payment_confirmed', 'in_production', 'shipped', 'delivered') THEN `total_amount` ELSE 0 END,
	0, `currency`, `sensitive_data_purge_at`, `sensitive_data_purged_at`, `created_at`, `updated_at`
FROM `orders`;--> statement-breakpoint
DROP TABLE `orders`;--> statement-breakpoint
ALTER TABLE `__new_orders` RENAME TO `orders`;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `orders_status_created_idx` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_created_status_idx` ON `orders` (`created_at`,`status`);--> statement-breakpoint
CREATE INDEX `orders_phone_created_idx` ON `orders` (`phone`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_customer_created_idx` ON `orders` (`customer_account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_payment_status_created_idx` ON `orders` (`payment_status`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
