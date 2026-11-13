import { ArrowRight, Plus, Search, Server } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { ApiGuildSummary } from "@api/types";
import { EmptyState, ErrorBox, Input, Spinner, cx } from "../components/ui";
import { useGuilds } from "../lib/api";
import { Brand, UserMenu } from "./AppShell";

export function GuildIcon({ name, iconUrl, className = "h-12 w-12 rounded-xl" }: {
  name: string;
  iconUrl: string | null;
  className?: string;
}) {
  if (iconUrl) return <img src={iconUrl} alt="" className={cx("shrink-0 object-cover", className)} />;
  const initials = name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={cx("grid shrink-0 place-items-center bg-surface-3 text-[13px] font-semibold text-muted", className)}>
      {initials}
    </div>
  );
}

function GuildCard({ guild }: { guild: ApiGuildSummary }) {
  const body = (
    <>
      <GuildIcon name={guild.name} iconUrl={guild.iconUrl} className={cx("h-12 w-12 rounded-xl", !guild.botPresent && "opacity-60 grayscale")} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{guild.name}</div>
        <div className="mt-0.5 text-[13px] text-subtle">{guild.botPresent ? "Bot active" : "Bot not added"}</div>
      </div>
      {guild.botPresent ? (
        <ArrowRight className="h-4 w-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-text" />
      ) : (
        <span className="inline-flex items-center gap-1 rounded-md border border-border-strong px-2 py-1 text-xs text-muted group-hover:border-accent group-hover:text-text">
          <Plus className="h-3.5 w-3.5" />
          Add
        </span>
      )}
    </>
  );
  const className =
    "group flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2";

  return guild.botPresent ? (
    <Link to={`/guilds/${guild.id}`} className={className}>{body}</Link>
  ) : (
    <a href={guild.inviteUrl ?? "#"} className={className}>{body}</a>
  );
}

export function HomePage() {
  const guilds = useGuilds();
  const [query, setQuery] = useState("");
  const filtered = guilds.data?.filter((g) => g.name.toLowerCase().includes(query.toLowerCase())) ?? [];
  const active = filtered.filter((g) => g.botPresent);
  const inactive = filtered.filter((g) => !g.botPresent);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Brand />
          <UserMenu compact />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">Select a server</h1>
            <p className="mt-1 text-muted">Servers where you have the Manage Server permission.</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search servers" className="pl-9" />
          </div>
        </div>

        {guilds.isLoading && <Spinner />}
        {guilds.error && <ErrorBox error={guilds.error} />}
        {guilds.data && guilds.data.length === 0 && (
          <div className="rounded-xl border border-border bg-surface">
            <EmptyState icon={Server} title="No servers to manage" description="You need the Manage Server permission in a server to configure it here." />
          </div>
        )}

        {active.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-medium tracking-wider text-subtle uppercase">Active · {active.length}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((guild) => <GuildCard key={guild.id} guild={guild} />)}
            </div>
          </section>
        )}
        {inactive.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-xs font-medium tracking-wider text-subtle uppercase">Add the bot · {inactive.length}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {inactive.map((guild) => <GuildCard key={guild.id} guild={guild} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
