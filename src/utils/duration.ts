const units: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** Parses strings like `30s`, `10m`, `1h30m`, `7d`, `2w` into milliseconds. Returns null when invalid. */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!/^(\d+[smhdw])+$/.test(text)) return null;

  let total = 0;
  for (const match of text.matchAll(/(\d+)([smhdw])/g)) {
    const [, amount, unit] = match;
    if (!amount || !unit) return null;
    total += Number(amount) * (units[unit] ?? 0);
  }
  return total > 0 ? total : null;
}

/** Formats milliseconds as a compact human string, e.g. `1d 2h 5m`. */
export function formatDuration(ms: number): string {
  const parts: string[] = [];
  let remaining = ms;
  for (const [label, size] of [
    ["w", units["w"]!],
    ["d", units["d"]!],
    ["h", units["h"]!],
    ["m", units["m"]!],
    ["s", units["s"]!],
  ] as const) {
    const amount = Math.floor(remaining / size);
    if (amount > 0) {
      parts.push(`${amount}${label}`);
      remaining -= amount * size;
    }
  }
  return parts.join(" ") || "0s";
}

export const discordTimestamp = (date: Date | number, style: "R" | "F" | "f" = "f"): string =>
  `<t:${Math.floor((typeof date === "number" ? date : date.getTime()) / 1000)}:${style}>`;
