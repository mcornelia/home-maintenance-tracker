CREATE TABLE `weather_cache` (
	`zip_code` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`payload_json` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
