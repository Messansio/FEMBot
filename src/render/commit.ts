import {
  ansiBlock,
  diffBar,
  padEnd,
  padStart,
  paint,
  relativeTime,
  symbols,
  truncate,
} from "../theme.js";
import type { AnsiColor } from "../theme.js";

export interface CommitFile {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface CommitDetails {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
  author: { login: string } | null;
  parents: { sha: string }[];
  stats?: { additions: number; deletions: number; total: number };
  files?: CommitFile[];
}

const STATUS: Record<string, [string, AnsiColor]> = {
  added: ["A", "green"],
  removed: ["D", "red"],
  modified: ["M", "amber"],
  renamed: ["R", "blue"],
  copied: ["C", "blue"],
  changed: ["M", "amber"],
  unchanged: ["·", "muted"],
};

const WIDTH = 60;
const CODE_WIDTH = 52;
const LINES_PER_FILE = 8;

/** Three lines: hash and title, who and when, totals. */
function header(commit: CommitDetails, repo: string): string[] {
  const title = commit.commit.message.split("\n")[0] ?? "";
  const files = commit.files ?? [];
  const additions = commit.stats?.additions ?? 0;
  const deletions = commit.stats?.deletions ?? 0;
  const author = commit.commit.author;
  const who = commit.author ? `@${commit.author.login}` : (author?.name ?? "unknown");
  const parents = commit.parents.map((p) => p.sha.slice(0, 7));
  return [
    `${paint(commit.sha.slice(0, 7), "amber", { bold: true })} ${paint(truncate(title, WIDTH - 8), "foreground", { bold: true })}`,
    paint(
      [repo, who, author ? relativeTime(author.date) : "", parents.length > 1 ? `merge of ${parents.join(" + ")}` : ""]
        .filter(Boolean)
        .join(` ${symbols.dot} `),
      "muted",
    ),
    `${diffBar(additions, deletions)} ${paint(`${symbols.added}${additions}`, "green")} ${paint(`${symbols.removed}${deletions}`, "red")} ${paint(
      `in ${files.length} file${files.length === 1 ? "" : "s"}`,
      "muted",
    )}`,
  ];
}

function truncateStart(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? `…${chars.slice(chars.length - max + 1).join("")}` : text;
}

/** One file: status, name and counts, then only its changed lines (capped), each with its line number. */
function fileBlock(file: CommitFile): { lines: string[]; cut: boolean } {
  const [letter, color] = STATUS[file.status] ?? ["?", "muted"];
  const counts = `${file.additions ? paint(`${symbols.added}${file.additions}`, "green") : ""}${
    file.additions && file.deletions ? " " : ""
  }${file.deletions ? paint(`${symbols.removed}${file.deletions}`, "red") : ""}`;
  const lines = [`${paint(letter, color, { bold: true })} ${padEnd(paint(truncateStart(file.filename, WIDTH - 16), "foreground"), WIDTH - 14)}${counts}`];
  if (!file.patch) return { lines: [...lines, paint("  binary or too large to show", "muted")], cut: true };

  const changed: string[] = [];
  let total = 0;
  let oldLine = 0;
  let newLine = 0;
  let gap = false;
  for (const raw of file.patch.split("\n")) {
    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      gap = changed.length > 0;
      continue;
    }
    const sign = raw[0];
    if (sign !== "+" && sign !== "-") {
      if (sign === " ") {
        oldLine++;
        newLine++;
        gap = changed.length > 0;
      }
      continue;
    }
    total++;
    if (changed.length >= LINES_PER_FILE) continue;
    if (gap) changed.push(paint("     ┄", "muted"));
    gap = false;
    const code = truncate(raw.slice(1).replace(/\t/g, "  ").trimEnd(), CODE_WIDTH);
    const number = paint(padStart(String(sign === "+" ? newLine++ : oldLine++), 4), "muted");
    changed.push(`${number} ${paint(`${sign === "+" ? symbols.added : symbols.removed} ${code}`, sign === "+" ? "green" : "red")}`);
  }
  const shown = changed.filter((l) => !l.endsWith("┄")).length;
  if (total > shown) changed.push(paint(`     ${symbols.dot}${symbols.dot}${symbols.dot} ${total - shown} more changed lines`, "muted"));
  return { lines: [...lines, ...changed], cut: total > shown };
}

/**
 * The whole commit in at most `maxMessages` Discord messages: header, then each file's changed lines.
 * `trimmed` is true when anything was left out, so the caller can attach the full diff.
 */
export function renderCommit(commit: CommitDetails, repo: string, maxMessages = 2): { messages: string[]; trimmed: boolean } {
  const LIMIT = 2000 - "```ansi\n\n```".length - 60;
  const files = commit.files ?? [];
  const pages: string[][] = [header(commit, repo)];
  let trimmed = false;
  let size = pages[0]!.join("\n").length;
  let shownFiles = 0;
  for (const file of files) {
    const block = fileBlock(file);
    const lines = ["", ...block.lines];
    const cost = lines.join("\n").length + 1;
    if (size + cost > LIMIT) {
      if (pages.length >= maxMessages) break;
      pages.push([]);
      lines.shift();
      size = 0;
    }
    pages.at(-1)!.push(...lines);
    size += cost;
    shownFiles++;
    trimmed ||= block.cut;
  }
  if (shownFiles < files.length) {
    trimmed = true;
    pages.at(-1)!.push("", paint(`${files.length - shownFiles} more file${files.length - shownFiles === 1 ? "" : "s"} in the attached diff`, "muted"));
  } else if (trimmed) {
    pages.at(-1)!.push("", paint("Full diff attached", "muted"));
  }
  return { messages: pages.map(ansiBlock), trimmed };
}

/** Packs ansi blocks into Discord messages (2000 chars each); returns the messages and whether all fit. */
export function packMessages(blocks: string[][], maxMessages: number): { messages: string[]; complete: boolean } {
  const LIMIT = 2000 - "```ansi\n\n```".length;
  const messages: string[] = [];
  let current: string[] = [];
  let size = 0;
  const flush = () => {
    if (current.length) messages.push(`\`\`\`ansi\n${current.join("\n")}\n\`\`\``);
    current = [];
    size = 0;
  };
  for (const block of blocks) {
    for (const line of block) {
      if (size + line.length + 1 > LIMIT) {
        flush();
        if (messages.length >= maxMessages) return { messages, complete: false };
      }
      current.push(line);
      size += line.length + 1;
    }
  }
  flush();
  return { messages: messages.slice(0, maxMessages), complete: messages.length <= maxMessages };
}
