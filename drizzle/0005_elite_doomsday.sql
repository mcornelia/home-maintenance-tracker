ALTER TABLE `cards` ADD `area` text DEFAULT 'grounds' NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `category` text DEFAULT 'plants_landscaping' NOT NULL;--> statement-breakpoint
UPDATE `household_settings` SET `display_name` = 'Ravenwood' WHERE `display_name` = 'My Yard';
