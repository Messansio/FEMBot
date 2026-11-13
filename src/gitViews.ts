import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { UserError } from "./errors.js";
import { GitHubError, githubGet, githubQuery } from "./github.js";
import { packMessages, renderCommitSummary, renderPatches } from "./render/commit.js";
import type { CommitDetails } from "./render/commit.js";
import { layoutGraph, renderGraphText, topoSort } from "./render/graph.js";
import type { GraphCommit } from "./render/graph.js";
import { fetchAvatar, renderImage } from "./render/images.js";
import { ansiBlock, padEnd, paint, relativeTime, symbols, truncate } from "./theme.js";

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

const TREE_QUERY = `query Tree($owner: String!, $name: String!) {
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
            history(first: 40) {
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

export async function treeView(token: string, ref: RepoRef, format: "image" | "text"): Promise<View> {
  const { repository } = await notFoundAsUserError(
    githubQuery<TreeQuery>(token, TREE_QUERY, { owner: ref.owner, name: ref.repo }),
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

  const limit = format === "image" ? 32 : 60;
  const ordered = topoSort([...commits.values()]).slice(0, limit);
  const defaultHead = repository.defaultBranchRef.target.oid;
  // Pin the default branch to lane 0 only when its head is in view (else an empty lane runs down).
  const seeds = ordered.some((c) => c.oid === defaultHead) ? [defaultHead] : [];
  const layout = layoutGraph(ordered, refs, seeds);
  const button = githubButton(`${repository.url}/network`, "Open on GitHub");

  if (format === "text") {
    const lines = renderGraphText(layout, repository.nameWithOwner, defaultBranch, 1990 - 12);
    return { messages: [ansiBlock(lines)], files: [], components: [button] };
  }

  const pictures = await avatars(layout.rows.map((row) => avatarUrls.get(row.commit.oid)));
  const png = await renderImage({
    kind: "graph",
    repo: repository.nameWithOwner,
    defaultBranch,
    branchCount: repository.refs.totalCount,
    width: layout.width,
    tail: layout.tail,
    rows: layout.rows.map((row) => ({
      sha: row.commit.oid.slice(0, 7),
      message: row.commit.message,
      author: row.commit.author,
      date: relativeTime(row.commit.date),
      refs: row.refs,
      col: row.col,
      merge: row.commit.parents.length > 1,
      above: row.above,
      avatar: pictures.get(avatarUrls.get(row.commit.oid) ?? ""),
    })),
  });
  return { messages: [], files: [new AttachmentBuilder(png, { name: "tree.png" })], components: [button] };
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
