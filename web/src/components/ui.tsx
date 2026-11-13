import { AlertCircle, Check, ChevronDown, Loader2, Plus, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ApiChannel, ApiRole } from "@api/types";

export const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

/* ── Layout ─────────────────────────────────────────────────────── */

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({ title, description, children, actions, padded = true, className }: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <section className={cx("overflow-hidden rounded-xl border border-border bg-surface", className)}>
      {(title || actions) && (
        <header className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            {title && <h2 className="font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cx(padded && "p-5")}>{children}</div>
    </section>
  );
}

/** A label/description on the left and a control on the right, stacked on mobile. */
export function SettingRow({ label, description, children, stacked = false }: {
  label: string;
  description?: ReactNode;
  children: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex flex-col gap-3 border-b border-border px-5 py-4 last:border-b-0",
        !stacked && "sm:flex-row sm:items-center sm:justify-between sm:gap-8",
      )}
    >
      <div className="min-w-0 sm:max-w-sm">
        <div className="font-medium">{label}</div>
        {description && <div className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</div>}
      </div>
      <div className={cx("min-w-0", stacked ? "w-full" : "w-full sm:w-72 sm:shrink-0")}>{children}</div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-subtle">{hint}</span>}
    </label>
  );
}

/* ── Inputs ─────────────────────────────────────────────────────── */

const inputClass =
  "w-full rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-subtle transition-colors hover:border-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(inputClass, "resize-y leading-relaxed", props.className)} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cx("relative", className)}>
      <select {...props} className={cx(inputClass, "cursor-pointer appearance-none pr-9")} />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-subtle" />
    </div>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  icon?: LucideIcon;
  loading?: boolean;
}) {
  const styles = {
    primary: "bg-accent text-white shadow-sm shadow-accent/20 hover:bg-accent-hover",
    secondary: "border border-border-strong bg-surface-2 text-text hover:bg-surface-3",
    danger: "border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20",
    ghost: "text-muted hover:bg-surface-3 hover:text-text",
  }[variant];
  const sizes = { sm: "h-8 px-2.5 text-[13px]", md: "h-9 px-3.5 text-sm" }[size];
  const IconComponent = loading ? Loader2 : Icon;
  return (
    <button
      type="button"
      disabled={disabled || loading}
      {...props}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        styles,
        sizes,
        className,
      )}
    >
      {IconComponent && <IconComponent className={cx("h-4 w-4", loading && "animate-spin")} />}
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        checked ? "bg-accent" : "bg-border-strong",
      )}
    >
      <span
        className={cx(
          "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/** Toggle aligned to the right of a setting row. */
export function ToggleRow({ label, description, checked, onChange }: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border px-5 py-4 last:border-b-0">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        {description && <div className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

/* ── Discord pickers ────────────────────────────────────────────── */

const textLike = new Set<ApiChannel["type"]>(["text", "announcement"]);

export function ChannelSelect({ channels, value, onChange, placeholder = "Disabled", types }: {
  channels: ApiChannel[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  types?: Array<ApiChannel["type"]>;
}) {
  const allowed = types ? new Set(types) : textLike;
  const categories = channels.filter((c) => c.type === "category");
  const options = channels.filter((c) => allowed.has(c.type));
  const uncategorized = options.filter((c) => !c.parentId || !categories.some((cat) => cat.id === c.parentId));

  return (
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {uncategorized.map((c) => (
        <option key={c.id} value={c.id}># {c.name}</option>
      ))}
      {categories.map((category) => {
        const children = options.filter((c) => c.parentId === category.id);
        if (children.length === 0) return null;
        return (
          <optgroup key={category.id} label={category.name.toUpperCase()}>
            {children.map((c) => (
              <option key={c.id} value={c.id}># {c.name}</option>
            ))}
          </optgroup>
        );
      })}
    </Select>
  );
}

export function roleColor(role: ApiRole | undefined): string {
  return role && role.color !== "#000000" ? role.color : "#a1a1aa";
}

export function RoleBadge({ role, onRemove }: { role: ApiRole | undefined; onRemove?: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border-strong bg-surface-2 pr-1.5 pl-2 text-[13px]">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: roleColor(role) }} />
      <span className="max-w-40 truncate">{role ? role.name : "Deleted role"}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="grid h-5 w-5 place-items-center rounded text-subtle hover:bg-surface-3 hover:text-text"
          aria-label={`Remove ${role?.name ?? "role"}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {!onRemove && <span className="w-0.5" />}
    </span>
  );
}

/** Role chips plus a searchable popover for adding more. */
export function RoleMultiSelect({ roles, value, onChange, onlyAssignable = false, max }: {
  roles: ApiRole[];
  value: string[];
  onChange: (value: string[]) => void;
  onlyAssignable?: boolean;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const byId = new Map(roles.map((r) => [r.id, r]));
  const available = roles.filter(
    (r) =>
      !value.includes(r.id) &&
      !r.managed &&
      (!onlyAssignable || r.assignable) &&
      r.name.toLowerCase().includes(query.toLowerCase()),
  );
  const full = max !== undefined && value.length >= max;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((id) => (
          <RoleBadge key={id} role={byId.get(id)} onRemove={() => onChange(value.filter((v) => v !== id))} />
        ))}
        <button
          type="button"
          disabled={full}
          onClick={() => setOpen(!open)}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border-strong px-2 text-[13px] text-muted hover:border-subtle hover:text-text disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {full ? `Max ${max}` : "Add role"}
        </button>
      </div>
      {open && (
        <div className="absolute z-30 mt-2 w-72 overflow-hidden rounded-lg border border-border-strong bg-surface-2 shadow-2xl shadow-black/50">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search roles"
              className="w-full bg-transparent px-1.5 py-1 text-sm placeholder:text-subtle focus:outline-none"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto p-1">
            {available.length === 0 && <li className="px-2.5 py-2 text-[13px] text-subtle">No roles available</li>}
            {available.map((role) => (
              <li key={role.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange([...value, role.id]);
                    setQuery("");
                    if (max !== undefined && value.length + 1 >= max) setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-3"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: roleColor(role) }} />
                  <span className="truncate">{role.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Feedback ───────────────────────────────────────────────────── */

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-16 text-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-danger" role="alert">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error instanceof Error ? error.message : "Something went wrong."}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-xl border border-border-strong bg-surface-2">
        <Icon className="h-5 w-5 text-muted" />
      </div>
      <div className="mt-4 font-medium">{title}</div>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-surface-3 text-muted ring-border-strong",
  accent: "bg-accent-soft text-indigo-300 ring-accent/30",
  success: "bg-success/10 text-green-400 ring-success/25",
  danger: "bg-danger/10 text-red-400 ring-danger/25",
  warning: "bg-warning/10 text-amber-400 ring-warning/25",
  info: "bg-info/10 text-sky-300 ring-info/25",
};
export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset", badgeTones[tone])}>
      {children}
    </span>
  );
}

export function Stat({ label, value, icon: Icon, hint }: { label: string; value: ReactNode; icon: LucideIcon; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between text-muted">
        <span className="text-[13px] font-medium">{label}</span>
        <Icon className="h-4 w-4 text-subtle" />
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-subtle">{hint}</div>}
    </div>
  );
}

/** Floating bar shown while a form has unsaved changes. */
export function SaveBar({ dirty, saving, error, onSave, onReset }: {
  dirty: boolean;
  saving: boolean;
  error: unknown;
  onSave: () => void;
  onReset: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const wasSaving = useRef(false);

  useEffect(() => {
    const finished = wasSaving.current && !saving;
    wasSaving.current = saving;
    if (!finished || error) return undefined;
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saving, error]);

  if (!dirty && !saved && !error) return null;

  return (
    <div className="pointer-events-none sticky bottom-6 z-20 mt-8 flex justify-center">
      <div className="pointer-events-auto flex w-full max-w-xl items-center justify-between gap-4 rounded-xl border border-border-strong bg-surface-2/95 py-2.5 pr-2.5 pl-4 shadow-2xl shadow-black/60 backdrop-blur">
        <span className="flex min-w-0 items-center gap-2 text-[13px]">
          {error ? (
            <>
              <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
              <span className="truncate text-danger">{error instanceof Error ? error.message : "Save failed"}</span>
            </>
          ) : dirty ? (
            <>
              <span className="h-2 w-2 shrink-0 rounded-full bg-warning" />
              Unsaved changes
            </>
          ) : (
            <>
              <Check className="h-4 w-4 text-success" />
              Changes saved
            </>
          )}
        </span>
        {dirty && (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onReset} disabled={saving}>
              Discard
            </Button>
            <Button size="sm" onClick={onSave} loading={saving}>
              Save changes
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
