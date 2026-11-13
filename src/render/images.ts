import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const reviewDir = fileURLToPath(new URL("../../review/", import.meta.url));

/** Renders a PNG with review/graphics.py (Pillow, Vercel theme). */
export function renderImage(data: Record<string, unknown>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("uv", ["run", "--project", reviewDir, "python", "graphics.py"], { cwd: reviewDir });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`Image renderer failed: ${Buffer.concat(errors).toString().trim().split("\n").pop()}`));
    });
    child.stdin.end(JSON.stringify(data));
  });
}

/** Avatar bytes (base64) for the renderer; undefined when it can't be fetched. */
export async function fetchAvatar(url: string | undefined, size = 64): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const target = new URL(url);
    target.searchParams.set("s", String(size));
    const response = await fetch(target);
    return response.ok ? Buffer.from(await response.arrayBuffer()).toString("base64") : undefined;
  } catch {
    return undefined;
  }
}
