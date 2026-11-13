import { Inbox, Terminal } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Card,
  ChannelSelect,
  EmptyState,
  ErrorBox,
  Input,
  PageHeader,
  RoleMultiSelect,
  SaveBar,
  SettingRow,
  Spinner,
  cx,
} from "../components/ui";
import { useChannels, useRoles, useTickets } from "../lib/api";
import { useSettingsForm } from "../lib/useSettingsForm";
import { useGuildId } from "./GuildLayout";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function TicketList({ guildId }: { guildId: string }) {
  const [status, setStatus] = useState<"open" | "closed">("open");
  const tickets = useTickets(guildId, status);

  return (
    <Card
      title="Tickets"
      padded={false}
      actions={
        <div className="flex rounded-lg border border-border-strong bg-surface-2 p-0.5" role="tablist">
          {(["open", "closed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={cx(
                "rounded-md px-3 py-1 text-[13px] font-medium transition-colors",
                status === s ? "bg-surface-3 text-text shadow-sm" : "text-subtle hover:text-text",
              )}
            >
              {s === "open" ? "Open" : "Closed"}
            </button>
          ))}
        </div>
      }
    >
      {tickets.isLoading ? (
        <Spinner />
      ) : tickets.error ? (
        <div className="p-5"><ErrorBox error={tickets.error} /></div>
      ) : tickets.data?.length === 0 ? (
        <EmptyState icon={Inbox} title={`No ${status} tickets`} description={status === "open" ? "New tickets from members will appear here." : "Closed tickets will appear here."} />
      ) : (
        <ul className="divide-y divide-border">
          {tickets.data?.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] text-subtle">#{t.id}</span>
                  <span className="font-medium">{t.openerTag ?? t.openerId}</span>
                  <Badge tone={t.status === "open" ? "success" : "neutral"}>{t.status}</Badge>
                </div>
                <div className="mt-0.5 truncate text-[13px] text-muted">{t.topic ?? "No topic given"}</div>
              </div>
              <div className="text-right text-xs text-subtle">
                <div>Opened {dateFormat.format(new Date(t.createdAt))}</div>
                {t.closedAt && <div>Closed {dateFormat.format(new Date(t.closedAt))}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function TicketsPage() {
  const guildId = useGuildId();
  const form = useSettingsForm(guildId);
  const channels = useChannels(guildId);
  const roles = useRoles(guildId);

  if (form.loadError) return <ErrorBox error={form.loadError} />;
  if (!form.draft || !channels.data || !roles.data) return <Spinner />;
  const draft = form.draft;

  return (
    <>
      <PageHeader title="Tickets" description="Private support threads between members and your staff." />

      <div className="mb-6 flex gap-3 rounded-xl border border-border bg-surface p-4">
        <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p className="text-[13px] text-muted">
          Run <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-text">/ticket setup</code> in Discord to post the
          "Open ticket" button. Tickets open as private threads in the ticket channel.
        </p>
      </div>

      <div className="space-y-6">
        <Card title="Configuration" padded={false}>
          <SettingRow label="Ticket channel" description="Members need to see this channel. The bot needs Create Private Threads.">
            <ChannelSelect channels={channels.data} value={draft.ticketChannelId} onChange={(v) => form.set("ticketChannelId", v)} types={["text"]} />
          </SettingRow>
          <SettingRow label="Transcript channel" description="Where open/close events and transcripts are posted.">
            <ChannelSelect channels={channels.data} value={draft.ticketLogChannelId} onChange={(v) => form.set("ticketLogChannelId", v)} />
          </SettingRow>
          <SettingRow label="Open tickets per member" description="How many tickets a member can have open at once.">
            <Input
              type="number"
              min={1}
              max={10}
              value={draft.ticketMaxOpenPerUser}
              onChange={(e) => form.set("ticketMaxOpenPerUser", Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
            />
          </SettingRow>
          <SettingRow label="Staff roles" description="Pinged and added to every new ticket. They can close tickets and add members." stacked>
            <RoleMultiSelect roles={roles.data} value={draft.ticketStaffRoleIds} onChange={(v) => form.set("ticketStaffRoleIds", v)} />
          </SettingRow>
        </Card>
        <SaveBar dirty={form.dirty} saving={form.saving} error={form.saveError} onSave={form.save} onReset={form.reset} />
        <TicketList guildId={guildId} />
      </div>
    </>
  );
}
