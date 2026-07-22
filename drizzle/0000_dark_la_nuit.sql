CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`maintenance_record_id` text,
	`original_filename` text NOT NULL,
	`stored_path` text NOT NULL,
	`thumbnail_path` text,
	`mime_type` text NOT NULL,
	`byte_length` integer NOT NULL,
	`width` integer,
	`height` integer,
	`sha256` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`maintenance_record_id`) REFERENCES `maintenance_records`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_card_idx` ON `attachments` (`card_id`);--> statement-breakpoint
CREATE INDEX `attachments_record_idx` ON `attachments` (`maintenance_record_id`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_hash_unique` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expiry_idx` ON `auth_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `card_locations` (
	`card_id` text NOT NULL,
	`location_id` text NOT NULL,
	PRIMARY KEY(`card_id`, `location_id`),
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`care_notes` text,
	`cover_attachment_id` text,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_slug_unique` ON `cards` (`slug`);--> statement-breakpoint
CREATE INDEX `cards_active_sort_idx` ON `cards` (`archived_at`,`sort_order`);--> statement-breakpoint
CREATE TABLE `household_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`display_name` text DEFAULT 'My Yard' NOT NULL,
	`zip_code` text,
	`growing_zone` text,
	`timezone` text DEFAULT 'America/New_York' NOT NULL,
	`due_soon_days` integer DEFAULT 14 NOT NULL,
	`digest_cadence` text DEFAULT 'weekly' NOT NULL,
	`digest_day` integer DEFAULT 0 NOT NULL,
	`digest_local_time` text DEFAULT '09:00' NOT NULL,
	`backup_destination` text,
	`backup_retention_days` integer DEFAULT 30 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_name_unique` ON `locations` (`name`);--> statement-breakpoint
CREATE TABLE `maintenance_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`name` text NOT NULL,
	`action_type` text NOT NULL,
	`instructions` text,
	`enabled` integer DEFAULT true NOT NULL,
	`include_in_digest` integer DEFAULT true NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `maintenance_plans_card_idx` ON `maintenance_plans` (`card_id`,`archived_at`);--> statement-breakpoint
CREATE TABLE `maintenance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text,
	`card_id` text NOT NULL,
	`completed_on` text NOT NULL,
	`notes` text,
	`source` text DEFAULT 'yard-tracker' NOT NULL,
	`legacy_table` text,
	`legacy_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `maintenance_plans`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `maintenance_records_card_date_idx` ON `maintenance_records` (`card_id`,`completed_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `maintenance_records_legacy_unique` ON `maintenance_records` (`legacy_table`,`legacy_id`);--> statement-breakpoint
CREATE TABLE `notification_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_recipients_email_unique` ON `notification_recipients` (`email`);--> statement-breakpoint
CREATE TABLE `plan_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`schedule_type` text NOT NULL,
	`interval_quantity` integer,
	`interval_unit` text,
	`fixed_dates_json` text,
	`one_time_due_on` text,
	`first_due_on` text,
	`timezone` text DEFAULT 'America/New_York' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `maintenance_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_schedules_plan_unique` ON `plan_schedules` (`plan_id`);--> statement-breakpoint
CREATE TABLE `scheduler_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_name` text NOT NULL,
	`period_key` text NOT NULL,
	`status` text NOT NULL,
	`error_summary` text,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scheduler_runs_job_period_unique` ON `scheduler_runs` (`job_name`,`period_key`);