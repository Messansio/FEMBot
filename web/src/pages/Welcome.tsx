import { Bot } from "lucide-react";
import type { ApiSettings } from "@api/types";
import {
  Card,
  ChannelSelect,
  ErrorBox,
  Field,
  PageHeader,
  RoleMultiSelect,
  SaveBar,
  SettingRow,
  Spinner,
  TextArea,
  ToggleRow,
  cx,
} from "../components/ui";
import { useChannels, useMe, useOverview, useRoles } from "../lib/api";
import { useSettingsForm } from "../lib/useSettingsForm";
import { useGuildId } from "./GuildLayout";

const placeholders = ["{user}", "{username}", "{tag}", "{server}", "{memberCount}"];

/** Renders a template the way Discord would show the bot's message. */
export function DiscordPreview({ template, values }: { template: string; values: Record<string, string> }) {
  const parts = template.split(/(\{\w+\}|\*\*[^*]+\*\*)/g);
  return (
    <div className="flex gap-3 rounded-lg bg-[#313338] px-4 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-white">
        <Bot className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-white">Bot</span>
          <span className="rounded bg-[#5865f2] px-1 text-[10px] leading-4 font-semibold text-white">APP</span>
          <span className="text-xs text-[#949ba4]">Today at 12:00</span>
        </div>
        <div className="mt-0.5 text-[15px] leading-snug break-words whitespace-pre-wrap text-[#dbdee1]">
          {parts.map((part, i) => {
            const key = part.slice(1, -1);
            if (/^\{\w+\}$/.test(part) && key in values) {
              return key === "user" ? (
                <span key={i} className="rounded-[3px] bg-[#5865f2]/30 px-0.5 font-medium text-[#c9cdfb]">{values[key]}</span>
              ) : (
                <span key={i}>{values[key]}</span>
              );
            }
            if (/^\*\*[^*]+\*\*$/.test(part)) {
              return <strong key={i} className="font-semibold text-white">{part.slice(2, -2).replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m)}</strong>;
            }
            return <span key={i}>{part}</span>;
          })}
        </div>
      </div>
    </div>
  );
}

function PlaceholderHint() {
  return (
    <span className="flex flex-wrap gap-1">
      {placeholders.map((p) => (
        <code key={p} className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-muted">{p}</code>
      ))}
    </span>
  );
}

type MessageKind = "welcome" | "leave";
const keys: Record<MessageKind, { enabled: keyof ApiSettings; channel: keyof ApiSettings; message: keyof ApiSettings }> = {
  welcome: { enabled: "welcomeEnabled", channel: "welcomeChannelId", message: "welcomeMessage" },
  leave: { enabled: "leaveEnabled", channel: "leaveChannelId", message: "leaveMessage" },
};

export function WelcomePage() {
  const guildId = useGuildId();
  const form = useSettingsForm(guildId);
  const channels = useChannels(guildId);
  const roles = useRoles(guildId);
  const me = useMe();
  const overview = useOverview(guildId);

  if (form.loadError) return <ErrorBox error={form.loadError} />;
  if (!form.draft || !channels.data || !roles.data) return <Spinner />;
  const draft = form.draft;

  const sample = {
    user: `@${me.data?.globalName ?? me.data?.username ?? "member"}`,
    username: me.data?.username ?? "member",
    tag: me.data?.username ?? "member",
    server: overview.data?.name ?? "Server",
    memberCount: String(overview.data?.memberCount ?? 100),
  };

  const messageCard = (kind: MessageKind, title: string, description: string) => {
    const k = keys[kind];
    const enabled = draft[k.enabled] as boolean;
    return (
      <Card title={title} description={description} padded={false}>
        <ToggleRow label="Enabled" checked={enabled} onChange={(v) => form.set(k.enabled, v as never)} />
        <div className={cx("transition-opacity", !enabled && "pointer-events-none opacity-40")} aria-disabled={!enabled}>
          <SettingRow label="Channel" description="Where the message is posted.">
            <ChannelSelect
              channels={channels.data}
              value={draft[k.channel] as string | null}
              onChange={(v) => form.set(k.channel, v as never)}
              placeholder="Select a channel"
            />
          </SettingRow>
          <div className="grid gap-5 px-5 py-4 lg:grid-cols-2">
            <Field label="Message" hint={<PlaceholderHint />}>
              <TextArea
                rows={4}
                value={draft[k.message] as string}
                maxLength={1500}
                onChange={(e) => form.set(k.message, e.target.value as never)}
              />
            </Field>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-muted">Preview</span>
              <DiscordPreview template={draft[k.message] as string} values={sample} />
            </div>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <>
      <PageHeader title="Welcome & autoroles" description="Greet new members and give them roles automatically." />
      <div className="space-y-6">
        {messageCard("welcome", "Welcome message", "Sent when someone joins the server.")}
        {messageCard("leave", "Leave message", "Sent when someone leaves the server.")}
        <Card title="Autoroles" description="Given to every new member, after membership screening if it's enabled." padded={false}>
          <SettingRow label="Roles" description="Up to 10 roles. Only roles below the bot's highest role can be assigned." stacked>
            <RoleMultiSelect roles={roles.data} value={draft.autoroleIds} onChange={(v) => form.set("autoroleIds", v)} onlyAssignable max={10} />
          </SettingRow>
        </Card>
      </div>
      <SaveBar dirty={form.dirty} saving={form.saving} error={form.saveError} onSave={form.save} onReset={form.reset} />
    </>
  );
}
