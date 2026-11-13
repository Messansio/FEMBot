import { Bot, FileText, Gauge, LogOut, ScrollText, ShieldCheck, Sparkles, Ticket } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Outlet } from "react-router";
import { Spinner, cx } from "../components/ui";
import { logout, useMe } from "../lib/api";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cx("grid h-8 w-8 place-items-center rounded-lg bg-accent text-white shadow-lg shadow-accent/25", className)}>
      <Bot className="h-[18px] w-[18px]" strokeWidth={2.25} />
    </span>
  );
}

export function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
      <BrandMark />
      Dashboard
    </Link>
  );
}

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const me = useMe();
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

  if (!me.data) return null;
  const name = me.data.globalName ?? me.data.username;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cx(
          "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-surface-3",
          open && "bg-surface-3",
        )}
        aria-expanded={open}
      >
        <img src={me.data.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{name}</span>
            <span className="block truncate text-xs text-subtle">@{me.data.username}</span>
          </span>
        )}
      </button>
      {open && (
        <div
          className={cx(
            "absolute z-40 w-52 overflow-hidden rounded-lg border border-border-strong bg-surface-2 p-1 shadow-2xl shadow-black/50",
            compact ? "top-full right-0 mt-2" : "bottom-full left-0 mb-2",
          )}
        >
          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted hover:bg-surface-3 hover:text-text"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

/** Auth gate: shows the login screen until the session is known. */
export function AppShell() {
  const me = useMe();
  if (me.isLoading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  return me.data ? <Outlet /> : <LoginScreen />;
}

const features = [
  { icon: ShieldCheck, title: "Moderation", text: "Cases, temp bans, timeouts and warnings with a full history." },
  { icon: ScrollText, title: "Logging", text: "Message, member and moderation logs in the channels you choose." },
  { icon: Ticket, title: "Tickets", text: "Private support threads with transcripts for your staff." },
  { icon: Sparkles, title: "Engagement", text: "Welcome messages, role panels, leveling and rewards." },
];

function LoginScreen() {
  const failed = new URLSearchParams(window.location.search).get("login") === "failed";
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]"
      />
      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6">
        <header className="py-6">
          <Brand />
        </header>

        <main className="flex flex-1 flex-col items-center justify-center pb-24 text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface-2 px-3 py-1 text-xs text-muted">
            <Gauge className="h-3.5 w-3.5" />
            Built for large communities
          </span>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Run your Discord server from one place
          </h1>
          <p className="mt-4 max-w-lg text-base text-muted text-balance">
            Configure moderation, logging, onboarding and community features for every server you manage.
          </p>

          {failed && (
            <p className="mt-6 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-[13px] text-danger">
              Login failed. Please try again.
            </p>
          )}

          <a
            href="/auth/login"
            className="mt-8 inline-flex h-11 items-center gap-2.5 rounded-lg bg-accent px-5 text-[15px] font-medium text-white shadow-lg shadow-accent/25 transition-colors hover:bg-accent-hover"
          >
            <DiscordLogo className="h-5 w-5" />
            Continue with Discord
          </a>

          <div className="mt-20 grid w-full gap-px overflow-hidden rounded-xl border border-border bg-border text-left sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="bg-surface p-5">
                <Icon className="h-5 w-5 text-accent" />
                <div className="mt-3 font-medium">{title}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{text}</p>
              </div>
            ))}
          </div>
        </main>

        <footer className="flex items-center gap-2 py-6 text-xs text-subtle">
          <FileText className="h-3.5 w-3.5" />
          You'll only see servers where you have the Manage Server permission.
        </footer>
      </div>
    </div>
  );
}

function DiscordLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
