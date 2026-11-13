CREATE TABLE `dashboard_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_tag` text NOT NULL,
	`action` text NOT NULL,
	`details` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `dashboard_audit_guild` ON `dashboard_audit` (`guild_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `guild_settings` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`mod_log_channel_id` text,
	`message_log_channel_id` text,
	`member_log_channel_id` text,
	`mod_role_ids` text DEFAULT '[]' NOT NULL,
	`dm_on_punish` integer DEFAULT true NOT NULL,
	`welcome_enabled` integer DEFAULT false NOT NULL,
	`welcome_channel_id` text,
	`welcome_message` text DEFAULT 'Welcome {user} to **{server}**! You are member #{memberCount}.' NOT NULL,
	`leave_enabled` integer DEFAULT false NOT NULL,
	`leave_channel_id` text,
	`leave_message` text DEFAULT '**{username}** left the server.' NOT NULL,
	`autorole_ids` text DEFAULT '[]' NOT NULL,
	`leveling_enabled` integer DEFAULT false NOT NULL,
	`xp_min` integer DEFAULT 15 NOT NULL,
	`xp_max` integer DEFAULT 25 NOT NULL,
	`xp_cooldown_seconds` integer DEFAULT 60 NOT NULL,
	`level_up_channel_id` text,
	`level_up_message` text DEFAULT 'GG {user}, you reached level **{level}**!' NOT NULL,
	`no_xp_channel_ids` text DEFAULT '[]' NOT NULL,
	`ticket_channel_id` text,
	`ticket_staff_role_ids` text DEFAULT '[]' NOT NULL,
	`ticket_log_channel_id` text,
	`ticket_max_open_per_user` integer DEFAULT 1 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `level_rewards` (
	`guild_id` text NOT NULL,
	`level` integer NOT NULL,
	`role_id` text NOT NULL,
	PRIMARY KEY(`guild_id`, `level`, `role_id`)
);
--> statement-breakpoint
CREATE TABLE `member_levels` (
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`level` integer DEFAULT 0 NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`last_xp_at` integer,
	PRIMARY KEY(`guild_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `member_levels_guild_xp` ON `member_levels` (`guild_id`,`xp`);--> statement-breakpoint
CREATE TABLE `mod_cases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`case_number` integer NOT NULL,
	`type` text NOT NULL,
	`target_id` text NOT NULL,
	`target_tag` text NOT NULL,
	`moderator_id` text NOT NULL,
	`reason` text,
	`duration_ms` integer,
	`expires_at` integer,
	`active` integer DEFAULT true NOT NULL,
	`log_message_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mod_cases_guild_number` ON `mod_cases` (`guild_id`,`case_number`);--> statement-breakpoint
CREATE INDEX `mod_cases_guild_target` ON `mod_cases` (`guild_id`,`target_id`);--> statement-breakpoint
CREATE TABLE `role_panel_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`panel_id` integer NOT NULL,
	`role_id` text NOT NULL,
	`label` text NOT NULL,
	`emoji` text,
	`description` text,
	FOREIGN KEY (`panel_id`) REFERENCES `role_panels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `role_panels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`mode` text DEFAULT 'buttons' NOT NULL,
	`max_choices` integer DEFAULT 0 NOT NULL,
	`channel_id` text,
	`message_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scheduled_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`type` text NOT NULL,
	`target_id` text NOT NULL,
	`run_at` integer NOT NULL,
	`case_id` integer
);
--> statement-breakpoint
CREATE INDEX `scheduled_actions_run_at` ON `scheduled_actions` (`run_at`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`opener_id` text NOT NULL,
	`topic` text,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_by_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`closed_at` integer
);
--> statement-breakpoint
CREATE INDEX `tickets_guild_status` ON `tickets` (`guild_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_channel` ON `tickets` (`channel_id`);