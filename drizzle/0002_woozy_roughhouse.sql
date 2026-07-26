CREATE TABLE `checkout_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`payload` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_drafts_token_hash_unique` ON `checkout_drafts` (`token_hash`);--> statement-breakpoint
CREATE INDEX `checkout_drafts_expiry_idx` ON `checkout_drafts` (`expires_at`);--> statement-breakpoint
ALTER TABLE `checkout_uploads` ADD `draft_id` text REFERENCES checkout_drafts(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `checkout_uploads_draft_idx` ON `checkout_uploads` (`draft_id`);
