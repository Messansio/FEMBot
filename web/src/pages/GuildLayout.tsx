import {
  ArrowLeft,
  Check,
  ChevronsUpDown,
  Gavel,
  History,
  LayoutDashboard,
  Menu,
  ScrollText,
  Tags,
  Ticket,
  TrendingUp,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { ErrorBox, Spinner, cx } from "../components/ui";
import { useGuilds, useOverview } from "../lib/api";
import { BrandMark, UserMenu } from "./AppShell";
import { GuildIcon } from "./Home";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "General",
    items: [
      { to: "", label: "Overview", icon: LayoutDashboard },
      { to: "audit", label: "Audit log", icon: History },
    ],
  },
  {
    label: "Moderation",
    items: [
      { to: "moderation", label: "Moderation", icon: Gavel },
      { to: "logging", label: "Logging", icon: ScrollText },
    ],
  },
  {
    label: "Community",
    items: [
      { to: "welcome", label: "Welcome & autoroles", icon: UserPlus },
      { to: "role-panels", label: "Role panels", icon: Tags },
      { to: "tickets", label: "Tickets", icon: Ticket },
      { to: "leveling", label: "Leveling", icon: TrendingUp },
    ],
  },
];

export function useGuildId(): string {
  const { guildId } = useParams();
  if (!guildId) throw new Error("Missing guild id");
  return guildId;
}

function ServerSwitcher({ guildId }: { guildId: string }) {
  const overview = useOverview(guildId);
  const guilds = useGuilds();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const others = guilds.data?.filter((g) => g.botPresent) ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cx(
          "flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface-2 p-2 text-left transition-colors hover:border-border-strong",
          open && "border-border-strong",
        )}
        aria-expanded={open}
      >
        <GuildIcon name={overview.data?.name ?? ""} iconUrl={overview.data?.iconUrl ?? null} className="h-8 w-8 rounded-lg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{overview.data?.name ?? "Loading"}</span>
          <span className="block text-xs text-subtle">
            {overview.data ? `${overview.data.memberCount.toLocaleString()} members` : " "}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-subtle" />
      </button>

      {open && (
        <div className="absolute top-full right-0 left-0 z-40 mt-2 overflow-hidden rounded-lg border border-border-strong bg-surface-2 shadow-2xl shadow-black/50">
          <ul className="max-h-72 overflow-y-auto p-1">
            {others.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void navigate(`/guilds/${g.id}`);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-3"
                >
                  <GuildIcon name={g.name} iconUrl={g.iconUrl} className="h-6 w-6 rounded-md text-[10px]" />
                  <span className="flex-1 truncate">{g.name}</span>
                  {g.id === guildId && <Check className="h-4 w-4 text-accent" />}
                </button>
              </li>
            ))}
          </ul>
          <Link
            to="/"
            className="flex items-center gap-2 border-t border-border px-3 py-2.5 text-[13px] text-muted hover:bg-surface-3 hover:text-text"
          >
            <ArrowLeft className="h-4 w-4" />
            All servers
          </Link>
        </div>
      )}
    </div>
  );
}

function SidebarContent({ guildId, onNavigate }: { guildId: string; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5 font-semibold tracking-tight">
        <BrandMark className="h-7 w-7" />
        Dashboard
      </div>
      <div className="px-3">
        <ServerSwitcher guildId={guildId} />
      </div>
      <nav className="mt-5 flex-1 space-y-6 overflow-y-auto px-3 pb-4" aria-label="Server settings">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="mb-1.5 px-2.5 text-[11px] font-medium tracking-wider text-subtle uppercase">{group.label}</div>
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === ""}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cx(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                        isActive ? "bg-surface-3 text-text" : "text-muted hover:bg-surface-2 hover:text-text",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon className={cx("h-4 w-4", isActive ? "text-accent" : "text-subtle")} />
                        {label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <UserMenu />
      </div>
    </div>
  );
}

export function GuildLayout() {
  const guildId = useGuildId();
  const overview = useOverview(guildId);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-surface lg:block">
        <SidebarContent guildId={guildId} />
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-text"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="truncate font-medium">{overview.data?.name}</span>
      </header>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-border bg-surface">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-3"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent guildId={guildId} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8 lg:py-10">
        {overview.isLoading ? (
          <Spinner />
        ) : overview.error ? (
          <div className="space-y-4">
            <ErrorBox error={overview.error} />
            <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-text">
              <ArrowLeft className="h-4 w-4" />
              Back to servers
            </Link>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
