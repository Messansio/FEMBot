import { Award, Plus, Trash2, Trophy, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ApiLevelReward } from "@api/types";
import {
  Button,
  Card,
  ChannelSelect,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  RoleBadge,
  SaveBar,
  Select,
  SettingRow,
  Spinner,
  TextArea,
  ToggleRow,
  cx,
} from "../components/ui";
import { useChannels, useLeaderboard, useLevelRewards, useRoles, useSaveLevelRewards } from "../lib/api";
import { useSettingsForm } from "../lib/useSettingsForm";
import { useGuildId } from "./GuildLayout";

function Rewards({ guildId }: { guildId: string }) {
  const rewards = useLevelRewards(guildId);
  const roles = useRoles(guildId);
  const save = useSaveLevelRewards(guildId);
  const [items, setItems] = useState<ApiLevelReward[]>([]);
  const [level, setLevel] = useState(5);
  const [roleId, setRoleId] = useState("");

  useEffect(() => {
    if (rewards.data) setItems(rewards.data);
  }, [rewards.data]);

  if (!rewards.data || !roles.data) return <Card title="Level rewards"><Spinner /></Card>;
  const saved = rewards.data;
  const byId = new Map(roles.data.map((r) => [r.id, r]));
  const dirty = JSON.stringify(items) !== JSON.stringify(saved);

  return (
    <Card title="Level rewards" description="Roles given when a member reaches a level." padded={false}>
      {items.length === 0 ? (
        <EmptyState icon={Award} title="No rewards yet" description="Add a role below to reward active members." />
      ) : (
        <ul className="divide-y divide-border">
          {items.map((r, i) => (
            <li key={`${r.level}-${r.roleId}`} className="flex items-center gap-4 px-5 py-3">
              <span className="w-16 shrink-0 text-[13px] text-subtle">
                Level <span className="font-semibold text-text tabular-nums">{r.level}</span>
              </span>
              <span className="flex-1"><RoleBadge role={byId.get(r.roleId)} /></span>
              <Button variant="ghost" size="sm" icon={Trash2} aria-label="Remove reward" className="hover:text-danger" onClick={() => setItems(items.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-3 border-t border-border bg-surface-2/40 px-5 py-4">
        <Field label="Level">
          <Input type="number" min={1} max={500} value={level} onChange={(e) => setLevel(Number(e.target.value))} className="w-20" />
        </Field>
        <Field label="Role">
          <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="w-52">
            <option value="">Select a role</option>
            {roles.data.filter((r) => r.assignable).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
        </Field>
        <Button
          variant="secondary"
          icon={Plus}
          disabled={!roleId || level < 1 || items.some((r) => r.level === level && r.roleId === roleId)}
          onClick={() => {
            setItems([...items, { level, roleId }].sort((a, b) => a.level - b.level));
            setRoleId("");
          }}
        >
          Add
        </Button>
      </div>
      {(dirty || save.error) && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <span className="text-[13px]">{save.error ? <span className="text-danger">{save.error.message}</span> : <span className="text-muted">Unsaved reward changes</span>}</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setItems(saved)}>Discard</Button>
            <Button size="sm" loading={save.isPending} onClick={() => save.mutate(items)}>Save rewards</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

const podium = ["text-amber-300", "text-zinc-300", "text-orange-400"];

function Leaderboard({ guildId }: { guildId: string }) {
  const board = useLeaderboard(guildId);
  return (
    <Card title="Leaderboard" description="Top 50 members by XP." padded={false}>
      {board.isLoading ? (
        <Spinner />
      ) : board.data?.length === 0 ? (
        <EmptyState icon={Trophy} title="No XP earned yet" description="Members earn XP by chatting once leveling is enabled." />
      ) : (
        <ol className="max-h-[480px] divide-y divide-border overflow-y-auto">
          {board.data?.map((entry, i) => (
            <li key={entry.userId} className="flex items-center gap-3 px-5 py-2.5">
              <span className={cx("w-6 text-right text-[13px] font-semibold tabular-nums", podium[i] ?? "text-subtle")}>{i + 1}</span>
              {entry.avatarUrl ? (
                <img src={entry.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
              ) : (
                <span className="h-8 w-8 rounded-full bg-surface-3" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{entry.username ?? entry.userId}</span>
                <span className="block text-xs text-subtle">{entry.messageCount.toLocaleString()} messages</span>
              </span>
              <span className="text-right">
                <span className="block text-[13px] font-medium">Level {entry.level}</span>
                <span className="block text-xs text-subtle tabular-nums">{entry.xp.toLocaleString()} XP</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function LevelingPage() {
  const guildId = useGuildId();
  const form = useSettingsForm(guildId);
  const channels = useChannels(guildId);

  if (form.loadError) return <ErrorBox error={form.loadError} />;
  if (!form.draft || !channels.data) return <Spinner />;
  const draft = form.draft;
  const textChannels = channels.data.filter((c) => c.type === "text" || c.type === "announcement");

  return (
    <>
      <PageHeader title="Leveling" description="Reward active members with XP, levels and roles." />
      <div className="space-y-6">
        <Card title="Settings" padded={false}>
          <ToggleRow
            label="Enable leveling"
            description="Members earn XP for chatting and level up over time."
            checked={draft.levelingEnabled}
            onChange={(v) => form.set("levelingEnabled", v)}
          />
          <div className={cx("transition-opacity", !draft.levelingEnabled && "pointer-events-none opacity-40")}>
            <SettingRow label="XP per message" description="A random amount between the minimum and maximum.">
              <div className="flex items-center gap-2">
                <Input type="number" min={1} max={500} value={draft.xpMin} onChange={(e) => form.set("xpMin", Number(e.target.value))} aria-label="Minimum XP" />
                <span className="text-subtle">to</span>
                <Input type="number" min={1} max={500} value={draft.xpMax} onChange={(e) => form.set("xpMax", Number(e.target.value))} aria-label="Maximum XP" />
              </div>
            </SettingRow>
            <SettingRow label="Cooldown" description="Seconds before a member can earn XP again. Stops spam farming.">
              <Input type="number" min={0} max={3600} value={draft.xpCooldownSeconds} onChange={(e) => form.set("xpCooldownSeconds", Number(e.target.value))} />
            </SettingRow>
            <SettingRow label="Announcement channel" description="Where level-ups are announced.">
              <ChannelSelect channels={channels.data} value={draft.levelUpChannelId} onChange={(v) => form.set("levelUpChannelId", v)} placeholder="Same channel as the message" />
            </SettingRow>
            <SettingRow label="Level-up message" description={<>Placeholders: <code className="font-mono text-xs">{"{user} {username} {level} {server}"}</code></>} stacked>
              <TextArea value={draft.levelUpMessage} maxLength={1000} onChange={(e) => form.set("levelUpMessage", e.target.value)} />
            </SettingRow>
            <SettingRow label="No-XP channels" description="Messages here don't earn XP, e.g. bot command or spam channels." stacked>
              <div className="flex flex-wrap items-center gap-1.5">
                {draft.noXpChannelIds.map((id) => (
                  <span key={id} className="inline-flex h-7 items-center gap-1 rounded-md border border-border-strong bg-surface-2 pr-1 pl-2 text-[13px]">
                    <span className="text-subtle">#</span>
                    {channels.data.find((c) => c.id === id)?.name ?? "deleted"}
                    <button
                      type="button"
                      className="grid h-5 w-5 place-items-center rounded text-subtle hover:bg-surface-3 hover:text-text"
                      aria-label="Remove channel"
                      onClick={() => form.set("noXpChannelIds", draft.noXpChannelIds.filter((c) => c !== id))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                <Select
                  className="w-48"
                  value=""
                  onChange={(e) => e.target.value && form.set("noXpChannelIds", [...draft.noXpChannelIds, e.target.value])}
                >
                  <option value="">Add channel</option>
                  {textChannels.filter((c) => !draft.noXpChannelIds.includes(c.id)).map((c) => (
                    <option key={c.id} value={c.id}># {c.name}</option>
                  ))}
                </Select>
              </div>
            </SettingRow>
          </div>
        </Card>
        <SaveBar dirty={form.dirty} saving={form.saving} error={form.saveError} onSave={form.save} onReset={form.reset} />
        <div className="grid gap-6 xl:grid-cols-2">
          <Rewards guildId={guildId} />
          <Leaderboard guildId={guildId} />
        </div>
      </div>
    </>
  );
}
