import { EmbedBuilder } from "discord.js";

// One Vercel/Geist dark palette for everything the bot draws: embeds, ANSI text and
// images (review/theme.py holds the same values for the Python renderers).

export const colors = {
  background: 0x0a0a0a,
  foreground: 0xededed,
  muted: 0x8f8f8f,
  blue: 0x47a8ff,
  purple: 0xc472fb,
  pink: 0xff4d8d,
  amber: 0xffb224,
  green: 0x00ca50,
  teal: 0x0ac5b3,
  red: 0xff6166,
} as const;

/** Glyphs shared by every text view, so the ASCII output reads as one system. */
export const symbols = {
  commit: "●",
  merge: "◉",
  branch: "⑂",
  arrow: "→",
  dot: "·",
  added: "+",
  removed: "−",
  barFull: "■",
  barEmpty: "□",
  ok: "✓",
  fail: "✕",
} as const;

// Discord's ```ansi blocks support 8 foreground colours; these are the closest to the palette.
const ANSI = {
  muted: 30,
  red: 31,
  green: 32,
  amber: 33,
  blue: 34,
  pink: 35,
  teal: 36,
  foreground: 37,
} as const;

export type AnsiColor = keyof typeof ANSI;

/** Lane colours, in order, for git graphs (text and image use the same order). */
export const laneColors: AnsiColor[] = ["blue", "pink", "amber", "green", "teal", "red"];

export function paint(text: string, color: AnsiColor, options: { bold?: boolean; inverse?: boolean } = {}): string {
  const codes: number[] = [];
  if (options.bold) codes.push(1);
  // Inverse = a "pill": dark text on Discord's light background colour.
  codes.push(options.inverse ? 30 : ANSI[color]);
  if (options.inverse) codes.push(47);
  return `\u001b[${codes.join(";")}m${text}\u001b[0m`;
}

export function ansiBlock(lines: string[]): string {
  return `\`\`\`ansi\n${lines.join("\n")}\n\`\`\``;
}

/** Visible length (without ANSI codes). */
export function visibleLength(text: string): number {
  // eslint-disable-next-line no-control-regex
  return [...text.replace(/\u001b\[[\d;]*m/g, "")].length;
}

export function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text;
}

export function padEnd(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleLength(text)));
}

export function padStart(text: string, width: number): string {
  return " ".repeat(Math.max(0, width - visibleLength(text))) + text;
}

export function relativeTime(date: string | Date): string {
  const seconds = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  const units: [number, string][] = [
    [60 * 60 * 24 * 365, "y"],
    [60 * 60 * 24 * 30, "mo"],
    [60 * 60 * 24 * 7, "w"],
    [60 * 60 * 24, "d"],
    [60 * 60, "h"],
    [60, "m"],
  ];
  for (const [size, unit] of units) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${unit} ago`;
  }
  return "just now";
}

/** GitHub-style diff bar: green squares for additions, red for deletions. */
export function diffBar(additions: number, deletions: number, width = 10): string {
  const total = additions + deletions;
  if (!total) return paint(symbols.barEmpty.repeat(width), "muted");
  const green = Math.round((additions / total) * width);
  return paint(symbols.barFull.repeat(green), "green") + paint(symbols.barFull.repeat(width - green), "red");
}

const TONE = { neutral: colors.background, ok: colors.green, error: colors.red, info: colors.blue, warn: colors.amber };

/** The bot's one embed style: dark card, coloured edge by tone, short title with a symbol. */
export function card(title: string, description?: string, tone: keyof typeof TONE = "neutral"): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(TONE[tone]).setTitle(title);
  return description ? embed.setDescription(description) : embed;
}
