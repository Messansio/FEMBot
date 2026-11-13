import { ChevronLeft, ChevronRight, FileSearch, Pencil, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ApiCase, ApiCaseType } from "@api/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Input,
  PageHeader,
  RoleMultiSelect,
  SaveBar,
  Select,
  SettingRow,
  Spinner,
  ToggleRow,
  type BadgeTone,
} from "../components/ui";
import { useCaseMutations, useCases, useRoles } from "../lib/api";
import { useSettingsForm } from "../lib/useSettingsForm";
import { useGuildId } from "./GuildLayout";

const typeTones: Record<ApiCaseType, BadgeTone> = {
  ban: "danger",
  kick: "warning",
  timeout: "warning",
  warn: "warning",
  unban: "success",
  untimeout: "success",
  note: "info",
};

function formatDuration(ms: number): string {
  const units: Array<[string, number]> = [["d", 86_400_000], ["h", 3_600_000], ["m", 60_000]];
  let rest = ms;
  const parts = units
    .map(([label, size]) => {
      const n = Math.floor(rest / size);
      rest -= n * size;
      return n ? `${n}${label}` : "";
    })
    .filter(Boolean);
  return parts.join(" ") || "<1m";
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function CaseRow({ guildId, item }: { guildId: string; item: ApiCase }) {
  const { update, remove } = useCaseMutations(guildId);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(item.reason ?? "");

  return (
    <tr className="group border-t border-border align-top transition-colors hover:bg-surface-2/60">
      <td className="py-3.5 pr-4 pl-5 font-mono text-[13px] text-subtle">{item.caseNumber}</td>
      <td className="py-3.5 pr-4">
        <div className="flex flex-col items-start gap-1">
          <Badge tone={typeTones[item.type]}>{item.type}</Badge>
          {!item.active && item.type !== "note" && <span className="text-[11px] text-subtle">Inactive</span>}
        </div>
      </td>
      <td className="py-3.5 pr-4">
        <div className="font-medium">{item.targetTag}</div>
        <div className="font-mono text-xs text-subtle">{item.targetId}</div>
      </td>
      <td className="py-3.5 pr-4 text-muted">{item.moderatorTag ?? <span className="font-mono text-xs">{item.moderatorId}</span>}</td>
      <td className="max-w-xs py-3.5 pr-4">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate({ caseNumber: item.caseNumber, reason: reason || null }, { onSuccess: () => setEditing(false) });
            }}
          >
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={512} autoFocus className="h-8 py-1" />
            <Button type="submit" size="sm" loading={update.isPending}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </form>
        ) : (
          <div className="text-muted">{item.reason ?? <span className="text-subtle italic">No reason</span>}</div>
        )}
        {item.durationMs && <div className="mt-1 text-xs text-subtle">Duration {formatDuration(item.durationMs)}</div>}
      </td>
      <td className="py-3.5 pr-4 whitespace-nowrap text-[13px] text-subtle">{dateFormat.format(new Date(item.createdAt))}</td>
      <td className="py-2.5 pr-3">
        <div className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="sm" icon={Pencil} aria-label="Edit reason" onClick={() => setEditing(true)} />
          <Button
            variant="ghost"
            size="sm"
            icon={Trash2}
            aria-label={`Delete case ${item.caseNumber}`}
            className="hover:text-danger"
            loading={remove.isPending}
            onClick={() => confirm(`Delete case #${item.caseNumber}? This can't be undone.`) && remove.mutate(item.caseNumber)}
          />
        </div>
      </td>
    </tr>
  );
}

function CasesTable({ guildId }: { guildId: string }) {
  const [page, setPage] = useState(1);
  const [type, setType] = useState<ApiCaseType | "">("");
  const [user, setUser] = useState("");
  const validUser = /^\d{17,20}$/.test(user) ? user : "";
  const cases = useCases(guildId, page, type, validUser);
  const totalPages = cases.data ? Math.max(1, Math.ceil(cases.data.total / cases.data.pageSize)) : 1;

  return (
    <Card
      title="Cases"
      description="Every moderation action is stored as a numbered case."
      padded={false}
      actions={
        <div className="flex flex-wrap gap-2">
          <Select value={type} onChange={(e) => { setType(e.target.value as ApiCaseType | ""); setPage(1); }} className="w-36">
            <option value="">All types</option>
            {Object.keys(typeTones).map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </Select>
          <div className="relative w-48">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input placeholder="User ID" value={user} onChange={(e) => { setUser(e.target.value.trim()); setPage(1); }} className="pl-9" />
          </div>
        </div>
      }
    >
      {cases.isLoading ? (
        <Spinner />
      ) : cases.error ? (
        <div className="p-5"><ErrorBox error={cases.error} /></div>
      ) : cases.data?.items.length === 0 ? (
        <EmptyState icon={FileSearch} title="No cases found" description={type || validUser ? "Try different filters." : "Cases appear here when moderators use the bot's moderation commands."} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-subtle">
                <th className="py-2.5 pr-4 pl-5 font-medium">#</th>
                <th className="py-2.5 pr-4 font-medium">Type</th>
                <th className="py-2.5 pr-4 font-medium">User</th>
                <th className="py-2.5 pr-4 font-medium">Moderator</th>
                <th className="py-2.5 pr-4 font-medium">Reason</th>
                <th className="py-2.5 pr-4 font-medium">Date</th>
                <th className="py-2.5 pr-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {cases.data?.items.map((item) => <CaseRow key={item.caseNumber} guildId={guildId} item={item} />)}
            </tbody>
          </table>
        </div>
      )}
      {cases.data && cases.data.total > 0 && (
        <div className="flex items-center justify-between border-t border-border px-5 py-3 text-[13px] text-subtle">
          <span>{cases.data.total.toLocaleString()} cases</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page" />
            <span className="px-2 tabular-nums">Page {page} of {totalPages}</span>
            <Button variant="ghost" size="sm" icon={ChevronRight} disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Next page" />
          </div>
        </div>
      )}
    </Card>
  );
}

export function ModerationPage() {
  const guildId = useGuildId();
  const form = useSettingsForm(guildId);
  const roles = useRoles(guildId);

  return (
    <>
      <PageHeader title="Moderation" description="Moderator roles, punishment behaviour and case history." />
      {form.loadError && <ErrorBox error={form.loadError} />}
      {form.draft && roles.data ? (
        <div className="mb-8">
          <Card title="Settings" padded={false}>
            <SettingRow
              label="Moderator roles"
              description="Members with these roles count as moderators for the bot, in addition to their Discord permissions."
              stacked
            >
              <RoleMultiSelect roles={roles.data} value={form.draft.modRoleIds} onChange={(v) => form.set("modRoleIds", v)} />
            </SettingRow>
            <ToggleRow
              label="Notify punished members"
              description="Send the member a DM with the reason and duration before the action is taken."
              checked={form.draft.dmOnPunish}
              onChange={(v) => form.set("dmOnPunish", v)}
            />
          </Card>
          <SaveBar dirty={form.dirty} saving={form.saving} error={form.saveError} onSave={form.save} onReset={form.reset} />
        </div>
      ) : (
        !form.loadError && <Spinner />
      )}
      <CasesTable guildId={guildId} />
    </>
  );
}
