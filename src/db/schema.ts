import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export const guildSettings = sqliteTable("guild_settings", {
  guildId: text("guild_id").primaryKey(),

  // Logging
  modLogChannelId: text("mod_log_channel_id"),
  messageLogChannelId: text("message_log_channel_id"),
  memberLogChannelId: text("member_log_channel_id"),

  // Moderation
  modRoleIds: text("mod_role_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
  dmOnPunish: integer("dm_on_punish", { mode: "boolean" }).notNull().default(true),

  // Welcome / leave
  welcomeEnabled: integer("welcome_enabled", { mode: "boolean" }).notNull().default(false),
  welcomeChannelId: text("welcome_channel_id"),
  welcomeMessage: text("welcome_message")
    .notNull()
    .default("Welcome {user} to **{server}**! You are member #{memberCount}."),
  leaveEnabled: integer("leave_enabled", { mode: "boolean" }).notNull().default(false),
  leaveChannelId: text("leave_channel_id"),
  leaveMessage: text("leave_message").notNull().default("**{username}** left the server."),
  autoroleIds: text("autorole_ids", { mode: "json" }).$type<string[]>().notNull().default([]),

  // Leveling
  levelingEnabled: integer("leveling_enabled", { mode: "boolean" }).notNull().default(false),
  xpMin: integer("xp_min").notNull().default(15),
  xpMax: integer("xp_max").notNull().default(25),
  xpCooldownSeconds: integer("xp_cooldown_seconds").notNull().default(60),
  levelUpChannelId: text("level_up_channel_id"),
  levelUpMessage: text("level_up_message")
    .notNull()
    .default("GG {user}, you reached level **{level}**!"),
  noXpChannelIds: text("no_xp_channel_ids", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),

  // Tickets
  ticketChannelId: text("ticket_channel_id"),
  ticketStaffRoleIds: text("ticket_staff_role_ids", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  ticketLogChannelId: text("ticket_log_channel_id"),
  ticketMaxOpenPerUser: integer("ticket_max_open_per_user").notNull().default(1),

  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const caseTypes = [
  "ban",
  "unban",
  "kick",
  "timeout",
  "untimeout",
  "warn",
  "note",
] as const;
export type CaseType = (typeof caseTypes)[number];

export const modCases = sqliteTable(
  "mod_cases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    caseNumber: integer("case_number").notNull(),
    type: text("type", { enum: caseTypes }).notNull(),
    targetId: text("target_id").notNull(),
    targetTag: text("target_tag").notNull(),
    moderatorId: text("moderator_id").notNull(),
    reason: text("reason"),
    durationMs: integer("duration_ms"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    logMessageId: text("log_message_id"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("mod_cases_guild_number").on(table.guildId, table.caseNumber),
    index("mod_cases_guild_target").on(table.guildId, table.targetId),
  ],
);

export const scheduledActions = sqliteTable(
  "scheduled_actions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    type: text("type", { enum: ["unban"] }).notNull(),
    targetId: text("target_id").notNull(),
    runAt: integer("run_at", { mode: "timestamp_ms" }).notNull(),
    caseId: integer("case_id"),
  },
  (table) => [index("scheduled_actions_run_at").on(table.runAt)],
);

export const rolePanels = sqliteTable("role_panels", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  mode: text("mode", { enum: ["buttons", "select"] }).notNull().default("buttons"),
  /** 0 = unlimited (select mode only). */
  maxChoices: integer("max_choices").notNull().default(0),
  channelId: text("channel_id"),
  messageId: text("message_id"),
  createdAt: createdAt(),
});

export const rolePanelOptions = sqliteTable("role_panel_options", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  panelId: integer("panel_id")
    .notNull()
    .references(() => rolePanels.id, { onDelete: "cascade" }),
  roleId: text("role_id").notNull(),
  label: text("label").notNull(),
  emoji: text("emoji"),
  description: text("description"),
});

export const tickets = sqliteTable(
  "tickets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    openerId: text("opener_id").notNull(),
    topic: text("topic"),
    status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
    closedById: text("closed_by_id"),
    createdAt: createdAt(),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("tickets_guild_status").on(table.guildId, table.status),
    uniqueIndex("tickets_channel").on(table.channelId),
  ],
);

export const memberLevels = sqliteTable(
  "member_levels",
  {
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(0),
    messageCount: integer("message_count").notNull().default(0),
    lastXpAt: integer("last_xp_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.userId] }),
    index("member_levels_guild_xp").on(table.guildId, table.xp),
  ],
);

export const levelRewards = sqliteTable(
  "level_rewards",
  {
    guildId: text("guild_id").notNull(),
    level: integer("level").notNull(),
    roleId: text("role_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.level, table.roleId] })],
);

export const dashboardAudit = sqliteTable(
  "dashboard_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    userTag: text("user_tag").notNull(),
    action: text("action").notNull(),
    details: text("details", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [index("dashboard_audit_guild").on(table.guildId, table.createdAt)],
);

export type GuildSettings = typeof guildSettings.$inferSelect;
export type ModCase = typeof modCases.$inferSelect;
export type RolePanel = typeof rolePanels.$inferSelect;
export type RolePanelOption = typeof rolePanelOptions.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
