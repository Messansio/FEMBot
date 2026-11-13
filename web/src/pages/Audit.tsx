import { Award, FileText, Gavel, History, Settings, Tags, type LucideIcon } from "lucide-react";
import { Card, EmptyState, ErrorBox, PageHeader, Spinner } from "../components/ui";
import { useAudit } from "../lib/api";
import { useGuildId } from "./GuildLayout";

const actions: Record<string, { label: string; icon: LucideIcon }> = {
  "settings.update": { label: "updated settings", icon: Settings },
  "case.update": { label: "edited a case", icon: Gavel },
  "case.delete": { label: "deleted a case", icon: Gavel },
  "rolePanel.create": { label: "created a role panel", icon: Tags },
  "rolePanel.update": { label: "edited a role panel", icon: Tags },
  "rolePanel.publish": { label: "published a role panel", icon: Tags },
  "rolePanel.delete": { label: "deleted a role panel", icon: Tags },
  "levelRewards.update": { label: "updated level rewards", icon: Award },
};

const settingNames: Record<string, string> = {
  modLogChannelId: "moderation log",
  messageLogChannelId: "message log",
  memberLogChannelId: "member log",
  ticketLogChannelId: "ticket log",
  modRoleIds: "moderator roles",
  dmOnPunish: "punishment DMs",
  welcomeEnabled: "welcome toggle",
  welcomeChannelId: "welcome channel",
  welcomeMessage: "welcome message",
  leaveEnabled: "leave toggle",
  leaveChannelId: "leave channel",
  leaveMessage: "leave message",
  autoroleIds: "autoroles",
  levelingEnabled: "leveling toggle",
  xpMin: "minimum XP",
  xpMax: "maximum XP",
  xpCooldownSeconds: "XP cooldown",
  levelUpChannelId: "level-up channel",
  levelUpMessage: "level-up message",
  noXpChannelIds: "no-XP channels",
  ticketChannelId: "ticket channel",
  ticketStaffRoleIds: "ticket staff roles",
  ticketMaxOpenPerUser: "ticket limit",
};

function describe(details: Record<string, unknown> | null): string {
  if (!details) return "";
  const changes = details["changes"];
  if (changes && typeof changes === "object") {
    return `Changed ${Object.keys(changes).map((k) => settingNames[k] ?? k).join(", ")}`;
  }
  if (typeof details["caseNumber"] === "number") return `Case #${details["caseNumber"]}`;
  if (typeof details["title"] === "string") return String(details["title"]);
  if (typeof details["count"] === "number") return `${details["count"]} rewards`;
  return "";
}

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function AuditPage() {
  const guildId = useGuildId();
  const audit = useAudit(guildId);

  return (
    <>
      <PageHeader title="Audit log" description="Changes made from this dashboard, and by whom." />
      <Card padded={false}>
        {audit.isLoading ? (
          <Spinner />
        ) : audit.error ? (
          <div className="p-5"><ErrorBox error={audit.error} /></div>
        ) : audit.data?.length === 0 ? (
          <EmptyState icon={History} title="No changes yet" description="Every change saved from the dashboard is recorded here." />
        ) : (
          <ul className="divide-y divide-border">
            {audit.data?.map((entry) => {
              const action = actions[entry.action] ?? { label: entry.action, icon: FileText };
              const Icon = action.icon;
              const detail = describe(entry.details);
              return (
                <li key={entry.id} className="flex items-start gap-3.5 px-5 py-3.5">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-strong bg-surface-2">
                    <Icon className="h-4 w-4 text-muted" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px]">
                      <span className="font-medium">{entry.userTag}</span> <span className="text-muted">{action.label}</span>
                    </div>
                    {detail && <div className="mt-0.5 truncate text-xs text-subtle">{detail}</div>}
                  </div>
                  <time className="shrink-0 text-xs text-subtle" dateTime={entry.createdAt}>
                    {timeFormat.format(new Date(entry.createdAt))}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
