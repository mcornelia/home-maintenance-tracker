CREATE TABLE `household_auth` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`passphrase_salt` text NOT NULL,
	`passphrase_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
