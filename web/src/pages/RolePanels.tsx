import { ArrowLeft, Bot, ChevronDown, ExternalLink, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { ApiChannel, ApiRole, ApiRolePanel, ApiRolePanelInput } from "@api/types";
import {
  Badge,
  Button,
  Card,
  ChannelSelect,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  RoleBadge,
  Select,
  Spinner,
  TextArea,
  cx,
  roleColor,
} from "../components/ui";
import { useChannels, usePanelMutations, useRolePanels, useRoles } from "../lib/api";
import { useGuildId } from "./GuildLayout";

const emptyPanel: ApiRolePanelInput = { title: "Pick your roles", description: "", mode: "buttons", maxChoices: 0, options: [] };

/** Approximates how the panel message renders in Discord. */
function PanelPreview({ panel, roles }: { panel: ApiRolePanelInput; roles: Map<string, ApiRole> }) {
  const description =
    panel.description ||
    panel.options.map((o) => `${o.emoji ? `${o.emoji} ` : ""}@${roles.get(o.roleId)?.name ?? "role"}${o.description ? ` | ${o.description}` : ""}`).join("\n");

  return (
    <div className="flex gap-3 rounded-lg bg-[#313338] p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-white">
        <Bot className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-white">Bot</span>
          <span className="rounded bg-[#5865f2] px-1 text-[10px] leading-4 font-semibold text-white">APP</span>
        </div>
        <div className="mt-1.5 max-w-md rounded border-l-4 border-[#5865f2] bg-[#2b2d31] p-3">
          <div className="font-semibold text-white">{panel.title || "Untitled panel"}</div>
          {description && <div className="mt-1 text-[13px] whitespace-pre-wrap text-[#dbdee1]">{description}</div>}
        </div>
        {panel.options.length > 0 &&
          (panel.mode === "select" ? (
            <div className="mt-2 flex max-w-md items-center justify-between rounded border border-[#1e1f22] bg-[#1e1f22] px-3 py-2.5 text-[13px] text-[#949ba4]">
              Choose your roles
              <ChevronDown className="h-4 w-4" />
            </div>
          ) : (
            <div className="mt-2 flex max-w-md flex-wrap gap-2">
              {panel.options.map((o) => (
                <span key={o.roleId} className="inline-flex h-8 items-center gap-1.5 rounded bg-[#4e5058] px-3 text-[13px] font-medium text-white">
                  {o.emoji && <span>{o.emoji}</span>}
                  {o.label || "Label"}
                </span>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

function PanelEditor({ guildId, panel, roles, channels, onDone }: {
  guildId: string;
  panel: ApiRolePanel | null;
  roles: ApiRole[];
  channels: ApiChannel[];
  onDone: () => void;
}) {
  const { create, save, publish } = usePanelMutations(guildId);
  const [draft, setDraft] = useState<ApiRolePanelInput>(
    panel ? { title: panel.title, description: panel.description, mode: panel.mode, maxChoices: panel.maxChoices, options: panel.options } : emptyPanel,
  );
  const [channelId, setChannelId] = useState<string | null>(panel?.channelId ?? null);
  const byId = new Map(roles.map((r) => [r.id, r]));
  const assignable = roles.filter((r) => r.assignable && !draft.options.some((o) => o.roleId === r.id));
  const mutation = panel ? save : create;
  const error = mutation.error ?? publish.error;
  const busy = mutation.isPending || publish.isPending;

  const setOption = (index: number, patch: Partial<ApiRolePanelInput["options"][number]>) =>
    setDraft({ ...draft, options: draft.options.map((o, i) => (i === index ? { ...o, ...patch } : o)) });

  const submit = (andPublish: boolean) => {
    const onSuccess = (saved: ApiRolePanel) => {
      if (andPublish && channelId) publish.mutate({ id: saved.id, channelId }, { onSuccess: onDone });
      else onDone();
    };
    if (panel) save.mutate({ id: panel.id, ...draft }, { onSuccess });
    else create.mutate(draft, { onSuccess });
  };

  return (
    <>
      <button type="button" onClick={onDone} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" />
        Role panels
      </button>
      <PageHeader title={panel ? panel.title : "New role panel"} description="Members click a button or pick from a dropdown to toggle roles." />

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Card title="Message">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Title">
                  <Input value={draft.title} maxLength={256} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </Field>
                <Field label="Style">
                  <Select value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value as "buttons" | "select" })}>
                    <option value="buttons">Buttons</option>
                    <option value="select">Dropdown menu</option>
                  </Select>
                </Field>
              </div>
              <Field label="Description" hint="Leave empty to list the roles automatically.">
                <TextArea value={draft.description} maxLength={2000} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </Field>
              {draft.mode === "select" && (
                <Field label="Max roles per member" hint="0 means no limit.">
                  <Input type="number" min={0} max={25} value={draft.maxChoices} onChange={(e) => setDraft({ ...draft, maxChoices: Number(e.target.value) })} className="w-28" />
                </Field>
              )}
            </div>
          </Card>

          <Card title="Roles" description={`${draft.options.length} of 25`} padded={false}>
            {draft.options.length === 0 ? (
              <EmptyState icon={Tags} title="No roles yet" description="Add the roles members can pick from." />
            ) : (
              <ul className="divide-y divide-border">
                {draft.options.map((option, i) => (
                  <li key={option.roleId} className="grid gap-2 px-5 py-3 sm:grid-cols-[minmax(0,9rem)_4.5rem_1fr_auto] sm:items-center">
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: roleColor(byId.get(option.roleId)) }} />
                      <span className="truncate font-medium">{byId.get(option.roleId)?.name ?? "Deleted role"}</span>
                    </div>
                    <Input placeholder="Emoji" value={option.emoji ?? ""} onChange={(e) => setOption(i, { emoji: e.target.value || null })} aria-label="Emoji" />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input placeholder="Label" value={option.label} maxLength={80} onChange={(e) => setOption(i, { label: e.target.value })} aria-label="Label" />
                      <Input
                        placeholder={draft.mode === "select" ? "Description" : "Description (dropdown only)"}
                        disabled={draft.mode !== "select"}
                        value={option.description ?? ""}
                        maxLength={100}
                        onChange={(e) => setOption(i, { description: e.target.value || null })}
                        aria-label="Description"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={X}
                      aria-label="Remove role"
                      className="hover:text-danger"
                      onClick={() => setDraft({ ...draft, options: draft.options.filter((_, j) => j !== i) })}
                    />
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-border bg-surface-2/40 px-5 py-3">
              <Select
                value=""
                disabled={draft.options.length >= 25}
                onChange={(e) => {
                  const role = byId.get(e.target.value);
                  if (role) setDraft({ ...draft, options: [...draft.options, { roleId: role.id, label: role.name.slice(0, 80), emoji: null, description: null }] });
                }}
              >
                <option value="">Add a role…</option>
                {assignable.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs text-subtle">Only roles below the bot's highest role and without moderator permissions can be used.</p>
            </div>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-10 xl:self-start">
          <Card title="Preview" padded={false}>
            <div className="p-4">
              <PanelPreview panel={draft} roles={byId} />
            </div>
          </Card>
          <Card title="Publish">
            <div className="space-y-4">
              <Field label="Channel" hint={panel?.messageId ? "Saving updates the posted message in place." : undefined}>
                <ChannelSelect channels={channels} value={channelId} onChange={setChannelId} placeholder="Don't post yet" />
              </Field>
              {error && <ErrorBox error={error} />}
              <div className="flex flex-col gap-2">
                <Button
                  loading={busy}
                  disabled={!channelId || draft.options.length === 0 || !draft.title.trim()}
                  onClick={() => submit(true)}
                >
                  {panel?.messageId && panel.channelId === channelId ? "Save and update message" : "Save and publish"}
                </Button>
                <Button variant="secondary" disabled={busy || !draft.title.trim()} onClick={() => submit(false)}>
                  Save as draft
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

export function RolePanelsPage() {
  const guildId = useGuildId();
  const panels = useRolePanels(guildId);
  const roles = useRoles(guildId);
  const channels = useChannels(guildId);
  const { remove } = usePanelMutations(guildId);
  const [editing, setEditing] = useState<ApiRolePanel | "new" | null>(null);

  if (panels.error) return <ErrorBox error={panels.error} />;
  if (!panels.data || !roles.data || !channels.data) return <Spinner />;

  if (editing) {
    return (
      <PanelEditor
        key={editing === "new" ? "new" : editing.id}
        guildId={guildId}
        panel={editing === "new" ? null : editing}
        roles={roles.data}
        channels={channels.data}
        onDone={() => setEditing(null)}
      />
    );
  }

  const byId = new Map(roles.data.map((r) => [r.id, r]));
  const channelName = (id: string | null) => channels.data.find((c) => c.id === id)?.name;
  const newButton = <Button icon={Plus} onClick={() => setEditing("new")}>New panel</Button>;

  return (
    <>
      <PageHeader title="Role panels" description="Let members choose their own roles with buttons or a dropdown." actions={panels.data.length > 0 && newButton} />
      {panels.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Tags}
            title="No role panels yet"
            description="Create a panel for pronouns, notifications, regions, or anything else members should pick themselves."
            action={newButton}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {panels.data.map((panel) => (
            <div key={panel.id} className="flex flex-col rounded-xl border border-border bg-surface">
              <div className="flex-1 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{panel.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-[13px] text-subtle">
                      <Badge tone={panel.channelId ? "success" : "neutral"}>{panel.channelId ? "Published" : "Draft"}</Badge>
                      {panel.mode === "select" ? "Dropdown" : "Buttons"}
                      {panel.channelId && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <ExternalLink className="h-3 w-3" /># {channelName(panel.channelId) ?? "deleted-channel"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className={cx("mt-4 flex flex-wrap gap-1.5")}>
                  {panel.options.length === 0 && <span className="text-[13px] text-subtle">No roles</span>}
                  {panel.options.map((o) => <RoleBadge key={o.roleId} role={byId.get(o.roleId)} />)}
                </div>
              </div>
              <div className="flex justify-end gap-1 border-t border-border px-3 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  className="hover:text-danger"
                  onClick={() => confirm(`Delete "${panel.title}"? Its message will also be deleted.`) && remove.mutate(panel.id)}
                >
                  Delete
                </Button>
                <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(panel)}>Edit</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
