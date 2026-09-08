CREATE TABLE `abandoned_checkout_recovery_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`source_draft_hash` text NOT NULL,
	`phone_hash` text NOT NULL,
	`encrypted_payload` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`converted_order_id` text,
	`converted_at` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`converted_order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `abandoned_checkout_recovery_source_draft_hash_idx` ON `abandoned_checkout_recovery_leads` (`source_draft_hash`);--> statement-breakpoint
CREATE INDEX `abandoned_checkout_recovery_phone_state_idx` ON `abandoned_checkout_recovery_leads` (`phone_hash`,`state`);--> statement-breakpoint
CREATE INDEX `abandoned_checkout_recovery_state_created_idx` ON `abandoned_checkout_recovery_leads` (`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `abandoned_checkout_recovery_expiry_idx` ON `abandoned_checkout_recovery_leads` (`expires_at`);--> statement-breakpoint
ALTER TABLE `checkout_drafts` ADD `consumed_at` integer;--> statement-breakpoint
CREATE INDEX `checkout_drafts_consumed_expiry_idx` ON `checkout_drafts` (`consumed_at`,`expires_at`);