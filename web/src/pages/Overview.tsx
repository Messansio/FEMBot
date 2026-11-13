import {
  AlertTriangle,
  ArrowUpRight,
  Gavel,
  ScrollText,
  ShieldCheck,
  Tags,
  Ticket,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { Card, EmptyState, PageHeader, Stat } from "../components/ui";
import { useOverview } from "../lib/api";
import { useGuildId } from "./GuildLayout";

const caseLabels: Record<string, string> = {
  ban: "Bans",
  kick: "Kicks",
  timeout: "Timeouts",
  warn: "Warnings",
  unban: "Unbans",
  untimeout: "Timeouts lifted",
  note: "Notes",
};

const shortcuts: Array<{ to: string; label: string; description: string; icon: LucideIcon }> = [
  { to: "logging", label: "Logging", description: "Choose log channels", icon: ScrollText },
  { to: "welcome", label: "Welcome", description: "Greet new members", icon: UserPlus },
  { to: "role-panels", label: "Role panels", description: "Self-assignable roles", icon: Tags },
  { to: "leveling", label: "Leveling", description: "XP and rewards", icon: TrendingUp },
];

export function OverviewPage() {
  const guildId = useGuildId();
  const { data } = useOverview(guildId);
  if (!data) return null;

  const cases = Object.entries(data.casesLast7Days).sort((a, b) => b[1] - a[1]);
  const totalCases = cases.reduce((sum, [, n]) => sum + n, 0);
  const max = Math.max(1, ...cases.map(([, n]) => n));

  return (
    <>
      <PageHeader title="Overview" description={`A snapshot of ${data.name}.`} />

      {data.botPermissions.missing.length > 0 && (
        <div className="mb-6 flex gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <div className="font-medium text-amber-300">The bot is missing permissions</div>
            <p className="mt-1 text-[13px] text-muted">
              Some features won't work until these are granted: {data.botPermissions.missing.join(", ")}.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Members" value={data.memberCount.toLocaleString()} icon={Users} />
        <Stat label="Cases" value={totalCases} icon={Gavel} hint="Last 7 days" />
        <Stat label="Open tickets" value={data.openTickets} icon={Ticket} />
        <Stat label="Ranked members" value={data.rankedMembers.toLocaleString()} icon={TrendingUp} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card
          title="Moderation activity"
          description="Cases created in the last 7 days"
          className="lg:col-span-3"
          actions={
            <Link to="moderation" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-text">
              View cases <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {cases.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="All quiet" description="No moderation actions in the last 7 days." />
          ) : (
            <ul className="space-y-4">
              {cases.map(([type, n]) => (
                <li key={type}>
                  <div className="mb-1.5 flex justify-between text-[13px]">
                    <span className="text-muted">{caseLabels[type] ?? type}</span>
                    <span className="font-medium tabular-nums">{n}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Quick setup" className="lg:col-span-2" padded={false}>
          <ul className="divide-y divide-border">
            {shortcuts.map(({ to, label, description, icon: Icon }) => (
              <li key={to}>
                <Link to={to} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg border border-border-strong bg-surface-2">
                    <Icon className="h-4 w-4 text-muted group-hover:text-accent" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-[13px] font-medium">{label}</span>
                    <span className="block text-xs text-subtle">{description}</span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-subtle group-hover:text-text" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <dl className="mt-6 grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-surface text-center">
        {[
          ["Channels", data.channelCount],
          ["Roles", data.roleCount],
          ["Bot access", data.botPermissions.administrator ? "Administrator" : data.botPermissions.missing.length ? "Incomplete" : "Complete"],
        ].map(([label, value]) => (
          <div key={label} className="px-4 py-4">
            <dt className="text-xs text-subtle">{label}</dt>
            <dd className="mt-1 font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
