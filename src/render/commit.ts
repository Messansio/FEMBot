import {
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
const CODE_WIDTH = 48;

/** Header card: sha pill, message, author, parents, totals and the per-file list. */
export function renderCommitSummary(commit: CommitDetails, repo: string): string[] {
  const [title = "", ...body] = commit.commit.message.split("\n");
  const files = commit.files ?? [];
  const additions = commit.stats?.additions ?? 0;
  const deletions = commit.stats?.deletions ?? 0;
  const author = commit.commit.author;

  const lines = [
    `${paint(` ${symbols.commit} ${commit.sha.slice(0, 7)} `, "foreground", { inverse: true, bold: true })} ${paint(repo, "blue")}`,
    "",
    paint(truncate(title, WIDTH), "foreground", { bold: true }),
    ...body
      .filter((line, i) => line.trim() || i > 0)
      .slice(0, 6)
      .map((line) => paint(truncate(line, WIDTH), "muted")),
    "",
    `${paint(padEnd("author", 8), "muted")}${paint(author?.name ?? "unknown", "foreground")}${
      commit.author ? paint(` @${commit.author.login}`, "blue") : ""
    }${author ? paint(` ${symbols.dot} ${relativeTime(author.date)}`, "muted") : ""}`,
    `${paint(padEnd(commit.parents.length > 1 ? "merge" : "parent", 8), "muted")}${
      commit.parents.map((p) => paint(p.sha.slice(0, 7), "amber")).join(paint(" + ", "muted")) || paint("none (root)", "muted")
    }`,
    "",
    `${paint(`${files.length} file${files.length === 1 ? "" : "s"}`, "foreground")}  ${paint(
      `${symbols.added}${additions}`,
      "green",
    )} ${paint(`${symbols.removed}${deletions}`, "red")}  ${diffBar(additions, deletions)}`,
    paint("─".repeat(WIDTH), "muted"),
  ];

  const nameWidth = WIDTH - 22;
  for (const file of files.slice(0, 25)) {
    const [letter, color] = STATUS[file.status] ?? ["?", "muted"];
    const name = file.previous_filename
      ? `${file.previous_filename} ${symbols.arrow} ${file.filename}`
      : file.filename;
    lines.push(
      `${paint(letter, color, { bold: true })} ${padEnd(paint(truncateStart(name, nameWidth), "foreground"), nameWidth)}${padStart(
        file.additions ? paint(`${symbols.added}${file.additions}`, "green") : "",
        6,
      )}${padStart(file.deletions ? paint(`${symbols.removed}${file.deletions}`, "red") : "", 6)}  ${diffBar(
        file.additions,
        file.deletions,
        5,
      )}`,
    );
  }
  if (files.length > 25) lines.push(paint(`${symbols.dot}${symbols.dot}${symbols.dot} ${files.length - 25} more files`, "muted"));
  return lines;
}

function truncateStart(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? `…${chars.slice(chars.length - max + 1).join("")}` : text;
}

/** Per-file patch blocks with old/new line numbers, green additions and red deletions. */
export function renderPatches(files: CommitFile[]): string[][] {
  return files.map((file) => {
    const [letter, color] = STATUS[file.status] ?? ["?", "muted"];
    const block = [
      `${paint("┌", "muted")} ${paint(letter, color, { bold: true })} ${paint(truncateStart(file.filename, WIDTH - 14), "foreground", {
        bold: true,
      })}  ${paint(`${symbols.added}${file.additions}`, "green")} ${paint(`${symbols.removed}${file.deletions}`, "red")}`,
    ];
    if (!file.patch) {
      block.push(`${paint("│", "muted")} ${paint("binary or too large to show", "muted")}`);
    } else {
      let oldLine = 0;
      let newLine = 0;
      for (const raw of file.patch.split("\n")) {
        const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
        if (hunk) {
          oldLine = Number(hunk[1]);
          newLine = Number(hunk[2]);
          block.push(`${paint("│", "muted")} ${paint(truncate(raw, WIDTH), "teal")}`);
          continue;
        }
        const sign = raw[0];
        const code = truncate(raw.slice(1).replace(/\t/g, "  "), CODE_WIDTH);
        if (sign === "+") {
          block.push(`${paint("│", "muted")} ${paint(`${padStart("", 4)} ${padStart(String(newLine++), 4)}`, "muted")} ${paint(`${symbols.added} ${code}`, "green")}`);
        } else if (sign === "-") {
          block.push(`${paint("│", "muted")} ${paint(`${padStart(String(oldLine++), 4)} ${padStart("", 4)}`, "muted")} ${paint(`${symbols.removed} ${code}`, "red")}`);
        } else if (sign === "\\") {
          block.push(`${paint("│", "muted")} ${paint(raw, "muted")}`);
        } else {
          block.push(`${paint("│", "muted")} ${paint(`${padStart(String(oldLine++), 4)} ${padStart(String(newLine++), 4)}`, "muted")}   ${code}`);
        }
      }
    }
    block.push(paint("└", "muted"));
    return block;
  });
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
