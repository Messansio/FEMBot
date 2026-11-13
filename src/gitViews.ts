import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { UserError } from "./errors.js";
import { GitHubError, githubGet, githubQuery } from "./github.js";
import { packMessages, renderCommitSummary, renderPatches } from "./render/commit.js";
import type { CommitDetails } from "./render/commit.js";
import { layoutGraph, renderGraphText, topoSort } from "./render/graph.js";
import type { GraphCommit, GraphLayout } from "./render/graph.js";
import { fetchAvatar, renderImage } from "./render/images.js";
import { ansiBlock, padEnd, paint, relativeTime, shortDate, symbols, truncate } from "./theme.js";

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface View {
  messages: string[];
  files: AttachmentBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

function githubButton(url: string, label = "Open on GitHub") {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url),
  );
}

function repoPath({ owner, repo }: RepoRef) {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

async function notFoundAsUserError<T>(promise: Promise<T>, message: string): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof GitHubError && [404, 409, 422].includes(error.status)) throw new UserError(message);
    throw error;
  }
}

async function avatars(urls: (string | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(urls.filter((u): u is string => Boolean(u)))].slice(0, 40);
  const fetched = await Promise.all(unique.map(async (url) => [url, await fetchAvatar(url)] as const));
  return new Map(fetched.filter((entry): entry is [string, string] => Boolean(entry[1])));
}

// --- Commit ------------------------------------------------------------------------

export async function commitView(token: string, ref: RepoRef, hash: string): Promise<View> {
  if (!/^[0-9a-f]{4,40}$/i.test(hash)) throw new UserError("A commit hash is 4–40 hex characters.");
  const name = `${ref.owner}/${ref.repo}`;
  const commit = await notFoundAsUserError(
    githubGet<CommitDetails>(token, `${repoPath(ref)}/commits/${hash}`),
    `No commit \`${hash}\` in ${name}.`,
  );

  const summary = packMessages([renderCommitSummary(commit, name)], 2);
  const patches = packMessages(renderPatches(commit.files ?? []), 4);
  const files: AttachmentBuilder[] = [];
  const truncated = !summary.complete || !patches.complete || (commit.files ?? []).some((f) => !f.patch);
  if (truncated) {
    const diff = await githubGet<string>(token, `${repoPath(ref)}/commits/${commit.sha}`, "application/vnd.github.diff");
    files.push(new AttachmentBuilder(Buffer.from(diff.slice(0, 7_000_000)), { name: `${commit.sha.slice(0, 7)}.diff` }));
  }
  return {
    messages: [...summary.messages, ...patches.messages],
    files,
    components: [githubButton(commit.html_url, "Open commit on GitHub")],
  };
}

// --- Tree ----------------------------------------------------------------------------

interface TreeQuery {
  repository: {
    nameWithOwner: string;
    url: string;
    defaultBranchRef: { name: string; target: { oid: string } } | null;
    refs: { totalCount: number; nodes: { name: string; target: { oid: string; history?: { nodes: HistoryNode[] } } }[] };
  } | null;
}

interface HistoryNode {
  oid: string;
  messageHeadline: string;
  committedDate: string;
  author: { name: string | null; avatarUrl: string | null; user: { login: string } | null } | null;
  parents: { nodes: { oid: string }[] };
}

const TREE_QUERY = `query Tree($owner: String!, $name: String!, $since: GitTimestamp, $until: GitTimestamp) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    url
    defaultBranchRef { name target { oid } }
    refs(refPrefix: "refs/heads/", first: 20, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) {
      totalCount
      nodes {
        name
        target {
          oid
          ... on Commit {
            history(first: 100, since: $since, until: $until) {
              nodes {
                oid messageHeadline committedDate
                author { name avatarUrl user { login } }
                parents(first: 4) { nodes { oid } }
              }
            }
          }
        }
      }
    }
  }
}`;

export interface DateRange {
  since: Date | undefined;
  until: Date | undefined;
}

/** Everything a tree view needs, fetched once; scrolling re-renders from this. */
export interface TreeData {
  repo: string;
  url: string;
  defaultBranch: string;
  branchCount: number;
  range: DateRange;
  layout: GraphLayout;
  avatarUrls: Map<string, string | undefined>;
  avatarCache: Map<string, string>;
}

/** "2024-03-01" → Date (UTC); `endOfDay` makes `to` inclusive. */
export function parseDay(input: string | null, endOfDay: boolean): Date | undefined {
  if (!input) return undefined;
  const match = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match ? new Date(`${match[0]}T${endOfDay ? "23:59:59" : "00:00:00"}Z`) : undefined;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match?.[0]) {
    throw new UserError(`\`${input}\` isn't a date. Use YYYY-MM-DD, e.g. 2024-03-01.`);
  }
  return date;
}

export async function loadTree(token: string, ref: RepoRef, range: DateRange): Promise<TreeData> {
  if (range.since && range.until && range.since > range.until) {
    throw new UserError("`from` must be before `to`.");
  }
  const { repository } = await notFoundAsUserError(
    githubQuery<TreeQuery>(token, TREE_QUERY, {
      owner: ref.owner,
      name: ref.repo,
      since: range.since?.toISOString() ?? null,
      until: range.until?.toISOString() ?? null,
    }),
    `Can't find ${ref.owner}/${ref.repo}, or your GitHub account can't see it.`,
  );
  if (!repository) throw new UserError(`Can't find ${ref.owner}/${ref.repo}, or your GitHub account can't see it.`);
  if (!repository.defaultBranchRef) throw new UserError(`${repository.nameWithOwner} has no commits yet.`);

  const defaultBranch = repository.defaultBranchRef.name;
  const avatarUrls = new Map<string, string | undefined>();
  const commits = new Map<string, GraphCommit>();
  const refs = new Map<string, string[]>();
  for (const branch of repository.refs.nodes) {
    const names = refs.get(branch.target.oid) ?? [];
    if (branch.name === defaultBranch) names.unshift(branch.name);
    else names.push(branch.name);
    refs.set(branch.target.oid, names);
    for (const node of branch.target.history?.nodes ?? []) {
      if (commits.has(node.oid)) continue;
      avatarUrls.set(node.oid, node.author?.avatarUrl ?? undefined);
      commits.set(node.oid, {
        oid: node.oid,
        parents: node.parents.nodes.map((p) => p.oid),
        message: node.messageHeadline,
        author: node.author?.name ?? "unknown",
        login: node.author?.user?.login,
        date: node.committedDate,
      });
    }
  }
  if (!commits.size) {
    throw new UserError(`No commits in ${repository.nameWithOwner} ${describeRange(range) || "yet"}.`);
  }

  const ordered = topoSort([...commits.values()]);
  const defaultHead = repository.defaultBranchRef.target.oid;
  // Pin the default branch to lane 0 only when its head is in view (else an empty lane runs down).
  const seeds = ordered.some((c) => c.oid === defaultHead) ? [defaultHead] : [];
  return {
    repo: repository.nameWithOwner,
    url: repository.url,
    defaultBranch,
    branchCount: repository.refs.totalCount,
    range,
    layout: layoutGraph(ordered, refs, seeds),
    avatarUrls,
    avatarCache: new Map(),
  };
}

function describeRange({ since, until }: DateRange): string {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  if (since && until) return `${day(since)} → ${day(until)}`;
  if (since) return `since ${day(since)}`;
  if (until) return `until ${day(until)}`;
  return "";
}

/** Rows [offset, offset + count) as a layout of their own (edges in from above, out below). */
function windowLayout(layout: GraphLayout, offset: number, count: number): GraphLayout {
  const rows = layout.rows.slice(offset, offset + count);
  const tail = layout.rows[offset + count]?.above ?? layout.tail;
  const lanes = [...rows.flatMap((r) => [r.col, ...r.above.flatMap((e) => [e.from, e.to])]), ...tail.map((e) => e.from)];
  return { rows, tail: tail.map((e) => ({ ...e, to: e.lane })), width: Math.max(...lanes) + 1 };
}

export const TREE_IMAGE_ROWS = 32;

/** One page of the tree; `shown` is how many rows it holds (text pages vary). */
export async function renderTreePage(
  tree: TreeData,
  format: "image" | "text",
  offset: number,
): Promise<{ view: View; shown: number }> {
  const total = tree.layout.rows.length;
  const button = githubButton(`${tree.url}/network`, "Open on GitHub");
  const subtitle = (shown: number) =>
    [
      `${tree.branchCount} branch${tree.branchCount === 1 ? "" : "es"}`,
      `commits ${offset + 1}–${offset + shown} of ${total}`,
      `default ${tree.defaultBranch}`,
      describeRange(tree.range),
    ]
      .filter(Boolean)
      .join("  ·  ");

  if (format === "text") {
    const window = windowLayout(tree.layout, offset, 60);
    const { lines, shown } = renderGraphText(window, tree.repo, tree.defaultBranch, subtitle, 1990 - 12);
    return { view: { messages: [ansiBlock(lines)], files: [], components: [button] }, shown };
  }

  const window = windowLayout(tree.layout, offset, TREE_IMAGE_ROWS);
  const missing = window.rows
    .map((row) => tree.avatarUrls.get(row.commit.oid))
    .filter((url): url is string => Boolean(url) && !tree.avatarCache.has(url as string));
  for (const [url, data] of await avatars(missing)) tree.avatarCache.set(url, data);

  const png = await renderImage({
    kind: "graph",
    repo: tree.repo,
    subtitle: subtitle(window.rows.length),
    defaultBranch: tree.defaultBranch,
    width: window.width,
    tail: window.tail,
    continuesAbove: offset > 0,
    rows: window.rows.map((row) => ({
      sha: row.commit.oid.slice(0, 7),
      message: row.commit.message,
      author: row.commit.author,
      date: shortDate(row.commit.date),
      refs: row.refs,
      col: row.col,
      merge: row.commit.parents.length > 1,
      above: row.above,
      avatar: tree.avatarCache.get(tree.avatarUrls.get(row.commit.oid) ?? ""),
    })),
  });
  return {
    view: { messages: [], files: [new AttachmentBuilder(png, { name: "tree.png" })], components: [button] },
    shown: window.rows.length,
  };
}

// --- Pull requests -------------------------------------------------------------------

interface PullSummary {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  draft: boolean;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string } | null;
  base: { ref: string };
  head: { ref: string };
  labels: { name: string; color: string }[];
}

interface PullDetails extends PullSummary {
  additions: number;
  deletions: number;
  changed_files: number;
  commits: number;
  comments: number;
  review_comments: number;
}

interface PullCommit {
  sha: string;
  commit: { message: string; author: { name: string; date: string } | null };
  author: { login: string; avatar_url: string } | null;
}

function pullState(pull: PullSummary): "open" | "draft" | "merged" | "closed" {
  if (pull.merged_at) return "merged";
  if (pull.state === "closed") return "closed";
  return pull.draft ? "draft" : "open";
}

export async function pullView(token: string, ref: RepoRef, number: number | null): Promise<View> {
  const name = `${ref.owner}/${ref.repo}`;
  if (number === null) {
    const pulls = await notFoundAsUserError(
      githubGet<PullSummary[]>(token, `${repoPath(ref)}/pulls?state=open&per_page=15`),
      `Can't find ${name}, or your GitHub account can't see it.`,
    );
    const lines = [`${paint(` ${symbols.branch} ${name} `, "foreground", { inverse: true })} ${paint("open pull requests", "muted")}`, ""];
    if (!pulls.length) lines.push(paint("No open pull requests.", "muted"));
    const numberWidth = Math.max(0, ...pulls.map((p) => String(p.number).length)) + 2;
    let size = lines.join("\n").length;
    for (const pull of pulls) {
      const draft = pull.draft;
      const entry = [
        `${paint(symbols.commit, draft ? "muted" : "green")} ${paint(padEnd(`#${pull.number}`, numberWidth), "amber")}${paint(
          truncate(pull.title, 44),
          draft ? "muted" : "foreground",
          { bold: !draft },
        )}`,
        `${" ".repeat(numberWidth + 2)}${paint(`@${pull.user?.login ?? "ghost"} ${symbols.dot} ${relativeTime(pull.updated_at)}`, "muted")}  ${paint(
          truncate(pull.head.ref, 18),
          "blue",
        )} ${paint(symbols.arrow, "muted")} ${paint(pull.base.ref, "blue")}`,
      ];
      size += entry.join("\n").length + 1;
      if (size > 1980) break; // whole entries only
      lines.push(...entry);
    }
    return {
      messages: packMessages([lines], 1).messages,
      files: [],
      components: [githubButton(`https://github.com/${name}/pulls`)],
    };
  }

  const [pull, commits] = await notFoundAsUserError(
    Promise.all([
      githubGet<PullDetails>(token, `${repoPath(ref)}/pulls/${number}`),
      githubGet<PullCommit[]>(token, `${repoPath(ref)}/pulls/${number}/commits?per_page=100`),
    ]),
    `No pull request #${number} in ${name}.`,
  );
  const pictures = await avatars([pull.user?.avatar_url, ...commits.map((c) => c.author?.avatar_url)]);
  const png = await renderImage({
    kind: "pull",
    repo: name,
    number: pull.number,
    title: pull.title,
    state: pullState(pull),
    author: { login: pull.user?.login ?? "ghost", avatar: pictures.get(pull.user?.avatar_url ?? "") },
    base: pull.base.ref,
    head: pull.head.ref,
    additions: pull.additions,
    deletions: pull.deletions,
    changedFiles: pull.changed_files,
    commitsCount: pull.commits,
    comments: pull.comments + pull.review_comments,
    created: relativeTime(pull.created_at),
    updated: relativeTime(pull.updated_at),
    labels: pull.labels.map(({ name: label, color }) => ({ name: label, color })),
    commits: commits.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0] ?? "",
      author: c.commit.author?.name ?? c.author?.login ?? "unknown",
      login: c.author?.login,
      avatar: pictures.get(c.author?.avatar_url ?? ""),
      date: c.commit.author ? relativeTime(c.commit.author.date) : "",
    })),
  });
  return {
    messages: [],
    files: [new AttachmentBuilder(png, { name: `pull-${pull.number}.png` })],
    components: [githubButton(pull.html_url, "Open pull request on GitHub")],
  };
}
