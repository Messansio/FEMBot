import { laneColors, paint, relativeTime, symbols, truncate, visibleLength } from "../theme.js";

export interface GraphCommit {
  oid: string;
  parents: string[];
  message: string;
  author: string;
  login: string | undefined;
  date: string;
}

/** A line segment between two rows: from a lane at the row above to a lane at this row. */
export interface GraphEdge {
  from: number;
  to: number;
  lane: number;
  /** Lane whose colour the line takes: the branch it belongs to. */
  color: number;
}

export interface GraphRow {
  commit: GraphCommit;
  col: number;
  /** Edges arriving from the previous row (or the top edge for row 0). */
  above: GraphEdge[];
  refs: string[];
}

export interface GraphLayout {
  rows: GraphRow[];
  /** Edges leaving the last row towards older, unshown history. */
  tail: GraphEdge[];
  width: number;
}

/** Children before parents, newest first among the ready ones. */
export function topoSort(commits: GraphCommit[]): GraphCommit[] {
  const byOid = new Map(commits.map((c) => [c.oid, c]));
  const pendingChildren = new Map(commits.map((c) => [c.oid, 0]));
  for (const c of commits) {
    for (const p of c.parents) if (byOid.has(p)) pendingChildren.set(p, (pendingChildren.get(p) ?? 0) + 1);
  }
  const ready = commits.filter((c) => pendingChildren.get(c.oid) === 0);
  const sorted: GraphCommit[] = [];
  while (ready.length) {
    ready.sort((a, b) => b.date.localeCompare(a.date));
    const next = ready.shift() as GraphCommit;
    sorted.push(next);
    for (const p of next.parents) {
      const left = (pendingChildren.get(p) ?? 0) - 1;
      pendingChildren.set(p, left);
      const parent = byOid.get(p);
      if (left === 0 && parent) ready.push(parent);
    }
  }
  return sorted;
}

function firstFree(lanes: (string | null)[]): number {
  const index = lanes.indexOf(null);
  return index === -1 ? lanes.length : index;
}

/**
 * Lane layout: each lane holds the commit it waits for. A commit takes the first lane
 * waiting for it (others merge into it); its first parent continues in its lane, other
 * parents open or join lanes. `seeds` pins commits (the default branch) to lane 0.
 */
export function layoutGraph(commits: GraphCommit[], refs: Map<string, string[]>, seeds: string[] = []): GraphLayout {
  const lanes: (string | null)[] = [...seeds];
  let pending = seeds.map((_, lane) => ({ from: lane, lane, color: lane }));
  const rows: GraphRow[] = [];
  let width = lanes.length;

  for (const commit of commits) {
    let col = lanes.indexOf(commit.oid);
    if (col === -1) {
      col = firstFree(lanes);
      lanes[col] = commit.oid;
    }
    const above = pending.map(({ from, lane, color }) => ({
      from,
      lane,
      color,
      to: lanes[lane] === commit.oid ? col : lane,
    }));
    lanes.forEach((oid, i) => {
      if (oid === commit.oid) lanes[i] = null;
    });

    const next: { from: number; lane: number; color: number }[] = [];
    lanes.forEach((oid, i) => {
      if (oid !== null) next.push({ from: i, lane: i, color: i });
    });
    commit.parents.forEach((parent, n) => {
      // The first parent continues in this lane (even if another lane also waits for it:
      // duplicate lanes merge where the parent is drawn), so a branch keeps its column.
      if (n === 0 && lanes[col] === null) {
        lanes[col] = parent;
        next.push({ from: col, lane: col, color: col });
        return;
      }
      let lane = lanes.indexOf(parent);
      // Joining an existing lane keeps this branch's colour; opening one takes the new lane's.
      let color = col;
      if (lane === -1) {
        lane = firstFree(lanes);
        lanes[lane] = parent;
        color = lane;
      }
      next.push({ from: col, lane, color });
    });
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();

    width = Math.max(width, lanes.length, col + 1);
    rows.push({ commit, col, above, refs: refs.get(commit.oid) ?? [] });
    pending = next;
  }

  return { rows, tail: pending.map(({ from, lane, color }) => ({ from, lane, color, to: lane })), width };
}

// --- Text rendering ------------------------------------------------------------

const BOX: Record<string, string> = {
  ud: "│", lr: "─", dr: "╭", dl: "╮", ur: "╰", ul: "╯",
  udr: "├", udl: "┤", dlr: "┬", ulr: "┴", udlr: "┼",
};

function laneColor(lane: number) {
  return laneColors[lane % laneColors.length] ?? "blue";
}

/** One connector line drawing every edge with box-drawing curves. */
function connector(edges: GraphEdge[], width: number): string | undefined {
  if (edges.every((e) => e.from === e.to)) return undefined;
  const cells = Array.from({ length: width * 2 }, () => ({ dirs: new Set<string>(), lane: 0 }));
  const mark = (x: number, lane: number, ...dirs: string[]) => {
    const cell = cells[x];
    if (!cell) return;
    dirs.forEach((d) => cell.dirs.add(d));
    cell.lane = lane;
  };
  for (const { from, to, color: lane } of edges) {
    if (from === to) {
      mark(from * 2, lane, "u", "d");
      continue;
    }
    const step = to > from ? 1 : -1;
    mark(from * 2, lane, "u", step > 0 ? "r" : "l");
    for (let x = from * 2 + step; x !== to * 2; x += step) mark(x, lane, "l", "r");
    mark(to * 2, lane, "d", step > 0 ? "l" : "r");
  }
  return cells
    .map(({ dirs, lane }) => {
      const key = ["u", "d", "l", "r"].filter((d) => dirs.has(d)).join("");
      return key ? paint(BOX[key] ?? "┼", laneColor(lane)) : " ";
    })
    .join("")
    .trimEnd();
}

function commitLine(row: GraphRow, width: number): string {
  const through = new Map(row.above.filter((e) => e.to !== row.col).map((e) => [e.to, e.color]));
  let graph = "";
  for (let lane = 0; lane < width; lane++) {
    if (lane === row.col) {
      const glyph = row.commit.parents.length > 1 ? symbols.merge : symbols.commit;
      graph += paint(glyph, laneColor(lane), { bold: true });
    } else {
      const color = through.get(lane);
      graph += color === undefined ? " " : paint("│", laneColor(color));
    }
    graph += " ";
  }
  return graph;
}

/** Vertical bars for every lane an edge leaves from (lines between commit rows). */
function bars(edges: GraphEdge[], width: number): string {
  let graph = "";
  for (let lane = 0; lane < width; lane++) {
    const edge = edges.find((e) => e.from === lane && e.lane === lane) ?? edges.find((e) => e.from === lane);
    graph += (edge ? paint("│", laneColor(edge.color)) : " ") + " ";
  }
  return graph;
}

/** git log --graph in Vercel colours, as many rows as fit in `maxChars`. */
export function renderGraphText(layout: GraphLayout, repo: string, defaultBranch: string, maxChars: number): string[] {
  const graphWidth = Math.min(layout.width, 8);
  const header = [
    `${paint(` ${symbols.branch} ${repo} `, "foreground", { inverse: true })} ${paint(`default ${defaultBranch}`, "muted")}`,
    "",
  ];
  const lines = [...header];
  let used = header.join("\n").length;

  for (const [index, row] of layout.rows.entries()) {
    if (row.col >= graphWidth) continue;
    const leaving = layout.rows[index + 1]?.above ?? layout.tail;
    const edges = row.above.filter((e) => e.from < graphWidth && e.to < graphWidth);
    const link = connector(edges, graphWidth);
    const refs = row.refs
      .map((ref) => paint(`[${ref}]`, ref === defaultBranch ? "green" : laneColor(row.col), { bold: true }))
      .join(" ");
    const graph = commitLine(row, graphWidth);
    const room = Math.max(12, 58 - visibleLength(graph) - visibleLength(refs));
    const text = [
      graph + paint(row.commit.oid.slice(0, 7), "amber"),
      refs,
      paint(truncate(row.commit.message, room), "foreground"),
    ].filter(Boolean).join(" ");
    const meta = `${bars(leaving, graphWidth)}${" ".repeat(8)}${paint(
      `${row.commit.login ? `@${row.commit.login}` : row.commit.author} ${symbols.dot} ${relativeTime(row.commit.date)}`,
      "muted",
    )}`;
    const add = [link, text, meta].filter((l): l is string => l !== undefined);
    const cost = add.join("\n").length + 1;
    if (used + cost > maxChars) break;
    lines.push(...add);
    used += cost;
  }
  return lines;
}
