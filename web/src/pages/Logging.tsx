import type { ApiSettings } from "@api/types";
import { Card, ChannelSelect, ErrorBox, PageHeader, SaveBar, SettingRow, Spinner } from "../components/ui";
import { useChannels } from "../lib/api";
import { useSettingsForm } from "../lib/useSettingsForm";
import { useGuildId } from "./GuildLayout";

type LogKey = "modLogChannelId" | "messageLogChannelId" | "memberLogChannelId" | "ticketLogChannelId";

const logs: Array<{ key: LogKey & keyof ApiSettings; label: string; description: string }> = [
  { key: "modLogChannelId", label: "Moderation", description: "Bans, kicks, timeouts, warnings and channel locks, including bans made through Discord directly." },
  { key: "messageLogChannelId", label: "Messages", description: "Edited and deleted messages, and bulk purges." },
  { key: "memberLogChannelId", label: "Members", description: "Joins with account age, and leaves with the roles the member had." },
  { key: "ticketLogChannelId", label: "Tickets", description: "Tickets being opened and closed, with a transcript file." },
];

export function LoggingPage() {
  const guildId = useGuildId();
  const form = useSettingsForm(guildId);
  const channels = useChannels(guildId);

  if (form.loadError) return <ErrorBox error={form.loadError} />;
  if (!form.draft || !channels.data) return <Spinner />;
  const draft = form.draft;
  const enabled = logs.filter((log) => draft[log.key]).length;

  return (
    <>
      <PageHeader title="Logging" description="Record what happens in your server in staff-only channels." />
      <Card title="Log channels" description={`${enabled} of ${logs.length} logs enabled`} padded={false}>
        {logs.map((log) => (
          <SettingRow key={log.key} label={log.label} description={log.description}>
            <ChannelSelect channels={channels.data} value={draft[log.key]} onChange={(v) => form.set(log.key, v)} />
          </SettingRow>
        ))}
      </Card>
      <SaveBar dirty={form.dirty} saving={form.saving} error={form.saveError} onSave={form.save} onReset={form.reset} />
    </>
  );
}
