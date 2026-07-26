CREATE TABLE `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_sessions_token_hash_idx` ON `admin_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `admin_sessions_admin_idx` ON `admin_sessions` (`admin_id`);--> statement-breakpoint
CREATE TABLE `customer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_account_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`customer_account_id`) REFERENCES `customer_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_sessions_token_hash_idx` ON `customer_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `customer_sessions_customer_idx` ON `customer_sessions` (`customer_account_id`);--> statement-breakpoint
CREATE TABLE `checkout_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`cloudinary_public_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`claimed_at` integer,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_uploads_token_hash_idx` ON `checkout_uploads` (`token_hash`);--> statement-breakpoint
CREATE INDEX `checkout_uploads_expiry_idx` ON `checkout_uploads` (`claimed_at`,`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_order_sensitive_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`order_item_id` text,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`cloudinary_public_id` text NOT NULL,
	`delete_after` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_order_sensitive_assets`("id", "order_id", "order_item_id", "kind", "url", "cloudinary_public_id", "delete_after", "deleted_at", "created_at") SELECT "id", "order_id", "order_item_id", "kind", "url", "cloudinary_public_id", "delete_after", "deleted_at", "created_at" FROM `order_sensitive_assets`;--> statement-breakpoint
DROP TABLE `order_sensitive_assets`;--> statement-breakpoint
ALTER TABLE `__new_order_sensitive_assets` RENAME TO `order_sensitive_assets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `order_sensitive_assets_order_idx` ON `order_sensitive_assets` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_sensitive_assets_due_for_deletion_idx` ON `order_sensitive_assets` (`deleted_at`,`delete_after`);