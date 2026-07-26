ALTER TABLE `products` ADD `personalization_definition` text;--> statement-breakpoint
ALTER TABLE `products` ADD `personalization_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_order_items` (
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
	`child_name` text,
	`story_language` text,
	`customer_note` text,
	`personalization_snapshot` text,
	`sensitive_personalization` text,
	`sensitive_personalization_purged_at` integer,
	`line_total_amount` integer NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s', 'now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_order_items`(
	`id`, `order_id`, `product_id`, `product_slug`, `product_title`, `product_image_url`,
	`base_unit_price_amount`, `sale_unit_price_amount`, `final_unit_price_amount`, `quantity`,
	`child_name`, `story_language`, `customer_note`, `line_total_amount`, `created_at`
)
SELECT
	`id`, `order_id`, `product_id`, `product_slug`, `product_title`, `product_image_url`,
	`base_unit_price_amount`, `sale_unit_price_amount`, `final_unit_price_amount`, `quantity`,
	`child_name`, `story_language`, `customer_note`, `line_total_amount`, `created_at`
FROM `order_items`;--> statement-breakpoint
DROP TABLE `order_items`;--> statement-breakpoint
ALTER TABLE `__new_order_items` RENAME TO `order_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `orders_created_status_idx` ON `orders` (`created_at`,`status`);--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_product_order_idx` ON `order_items` (`product_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_sensitive_personalization_idx` ON `order_items` (`sensitive_personalization_purged_at`);
