// Run: npm test. Covers the pure logic that is easy to break silently.
process.env["TOKEN_ENCRYPTION_KEY"] ??= Buffer.alloc(32, 7).toString("base64");
for (const name of ["DISCORD_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_APP_SLUG", "PUBLIC_URL"]) {
  process.env[name] ??= "test";
}
process.env["DISCORD_TOKEN"] ??= "test";
process.env["DISCORD_CLIENT_ID"] ??= "test";
process.env["DATABASE_PATH"] = ":memory:";

import assert from "node:assert/strict";
import { test } from "node:test";

const { layoutGraph, topoSort } = await import("./render/graph.js");
const { parseRepoReference } = await import("./github.js");
const { parseDay } = await import("./gitViews.js");
const { parseDuration } = await import("./projects.js");
const { decryptSecret, encryptSecret, hashToken } = await import("./security.js");
const { commands } = await import("./commands/index.js");

const commit = (oid: string, parents: string[], date: string) => ({ oid, parents, message: oid, author: "a", login: undefined, date });

test("graph: a branch forks and merges back", () => {
  // main: m3 (merge of m2 + f1) → m2 → m1; feature: f1 → m1
  const commits = topoSort([
    commit("m1", [], "2024-01-01"),
    commit("m2", ["m1"], "2024-01-02"),
    commit("f1", ["m1"], "2024-01-03"),
    commit("m3", ["m2", "f1"], "2024-01-04"),
  ]);
  assert.deepEqual(commits.map((c) => c.oid), ["m3", "f1", "m2", "m1"]);
  const layout = layoutGraph(commits, new Map([["m3", ["main"]]]), ["m3"]);
  assert.deepEqual(layout.rows.map((r) => r.col), [0, 1, 0, 0]);
  assert.equal(layout.width, 2);
  // f1 joins m1's lane (0): edge from lane 1 to lane 0 coloured as the feature lane.
  const intoRoot = layout.rows[3]?.above.find((e) => e.from === 1);
  assert.deepEqual(intoRoot, { from: 1, lane: 1, color: 1, to: 0 });
  assert.deepEqual(layout.tail, []);
});

test("graph: children always come before parents", () => {
  const commits = topoSort([commit("child", ["parent"], "2020-01-01"), commit("parent", [], "2030-01-01")]);
  assert.deepEqual(commits.map((c) => c.oid), ["child", "parent"]);
});

test("repo references", () => {
  assert.deepEqual(parseRepoReference("vercel/next.js"), { owner: "vercel", repo: "next.js" });
  assert.deepEqual(parseRepoReference("https://github.com/Messansio/FEMBot/tree/main"), { owner: "Messansio", repo: "FEMBot" });
  assert.deepEqual(parseRepoReference("git@github.com:a/b.git"), { owner: "a", repo: "b" });
  assert.equal(parseRepoReference("https://gitlab.com/a/b"), undefined);
  assert.equal(parseRepoReference("just-text"), undefined);
});

test("durations", () => {
  assert.equal(parseDuration("30m"), 1_800_000);
  assert.equal(parseDuration("2h"), 7_200_000);
  assert.throws(() => parseDuration("30s"));
  assert.throws(() => parseDuration("40d"));
});

test("secrets are encrypted, tamper-proof, and never stored in plain text", () => {
  const sealed = encryptSecret("gho_secret");
  assert.ok(!sealed.includes("gho_secret"));
  assert.equal(decryptSecret(sealed), "gho_secret");
  const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
  assert.throws(() => decryptSecret(tampered));
  assert.equal(hashToken("x").length, 64);
});

test("every slash command definition is valid for Discord", () => {
  for (const command of commands) assert.doesNotThrow(() => command.data.toJSON(), command.data.name);
});

test("tree date range", () => {
  assert.equal(parseDay("2025-03-01", false)?.toISOString(), "2025-03-01T00:00:00.000Z");
  assert.equal(parseDay("2025-03-01", true)?.toISOString(), "2025-03-01T23:59:59.000Z");
  assert.equal(parseDay(null, false), undefined);
  assert.throws(() => parseDay("2025-02-30", false));
  assert.throws(() => parseDay("01/03/2025", false));
});
