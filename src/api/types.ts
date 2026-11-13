/**
 * API contract shared by the server (src/api) and the dashboard (web/).
 * Keep this file dependency-free so the web app can import it directly.
 */

export interface ApiUser {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string;
}

export interface ApiGuildSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  botPresent: boolean;
  inviteUrl: string | null;
}

export interface ApiChannel {
  id: string;
  name: string;
  type: "text" | "announcement" | "voice" | "category" | "forum" | "other";
  parentId: string | null;
  position: number;
}

export interface ApiRole {
  id: string;
  name: string;
  color: string;
  position: number;
  managed: boolean;
  /** The bot can give/take this role. */
  assignable: boolean;
}

export interface ApiGuildOverview {
  id: string;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  channelCount: number;
  roleCount: number;
  openTickets: number;
  rankedMembers: number;
  casesLast7Days: Record<string, number>;
  botPermissions: { administrator: boolean; missing: string[] };
}

export interface ApiSettings {
  modLogChannelId: string | null;
  messageLogChannelId: string | null;
  memberLogChannelId: string | null;
  modRoleIds: string[];
  dmOnPunish: boolean;
  welcomeEnabled: boolean;
  welcomeChannelId: string | null;
  welcomeMessage: string;
  leaveEnabled: boolean;
  leaveChannelId: string | null;
  leaveMessage: string;
  autoroleIds: string[];
  levelingEnabled: boolean;
  xpMin: number;
  xpMax: number;
  xpCooldownSeconds: number;
  levelUpChannelId: string | null;
  levelUpMessage: string;
  noXpChannelIds: string[];
  ticketChannelId: string | null;
  ticketStaffRoleIds: string[];
  ticketLogChannelId: string | null;
  ticketMaxOpenPerUser: number;
}

export type ApiCaseType = "ban" | "unban" | "kick" | "timeout" | "untimeout" | "warn" | "note";

export interface ApiCase {
  caseNumber: number;
  type: ApiCaseType;
  targetId: string;
  targetTag: string;
  moderatorId: string;
  moderatorTag: string | null;
  reason: string | null;
  durationMs: number | null;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiRolePanelOption {
  roleId: string;
  label: string;
  emoji: string | null;
  description: string | null;
}

export interface ApiRolePanel {
  id: number;
  title: string;
  description: string;
  mode: "buttons" | "select";
  maxChoices: number;
  channelId: string | null;
  messageId: string | null;
  options: ApiRolePanelOption[];
}

export type ApiRolePanelInput = Omit<ApiRolePanel, "id" | "channelId" | "messageId">;

export interface ApiLevelReward {
  level: number;
  roleId: string;
}

export interface ApiLeaderboardEntry {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  xp: number;
  level: number;
  messageCount: number;
}

export interface ApiTicket {
  id: number;
  channelId: string;
  openerId: string;
  openerTag: string | null;
  topic: string | null;
  status: "open" | "closed";
  createdAt: string;
  closedAt: string | null;
}

export interface ApiAuditEntry {
  id: number;
  userId: string;
  userTag: string;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
