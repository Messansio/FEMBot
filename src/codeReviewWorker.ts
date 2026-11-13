import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export interface CodeReview {
  language: string;
  errorLines: number[];
  /** Compiler/parser messages by line; lines without one were flagged by the model. */
  messages: Record<string, string>;
  image: Buffer;
}

interface WorkerReply {
  id?: number;
  ready?: boolean;
  error?: string;
  language?: string;
  errorLines?: number[];
  messages?: Record<string, string>;
  image?: string;
}

interface Pending {
  resolve(review: CodeReview): void;
  reject(error: Error): void;
}

// Same relative path from src/ (tsx) and dist/ (built).
const reviewDir = fileURLToPath(new URL("../review/", import.meta.url));

let worker: ChildProcessWithoutNullStreams | undefined;
let ready: Promise<void> | undefined;
let nextId = 0;
const pending = new Map<number, Pending>();

function startWorker(): Promise<void> {
  const child = spawn("uv", ["run", "--project", reviewDir, "python", "worker.py"], {
    cwd: reviewDir,
  });
  worker = child;
  child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));

  return new Promise((resolve, reject) => {
    createInterface({ input: child.stdout }).on("line", (line) => {
      const reply = JSON.parse(line) as WorkerReply;
      if (reply.ready) {
        resolve();
        return;
      }
      if (reply.id === undefined) return;
      const request = pending.get(reply.id);
      pending.delete(reply.id);
      if (reply.error !== undefined || !reply.image) {
        request?.reject(new Error(reply.error ?? "The reviewer returned no image."));
      } else {
        request?.resolve({
          language: reply.language ?? "unknown",
          errorLines: reply.errorLines ?? [],
          messages: reply.messages ?? {},
          image: Buffer.from(reply.image, "base64"),
        });
      }
    });

    const fail = (error: Error) => {
      worker = undefined;
      ready = undefined;
      reject(error);
      for (const request of pending.values()) request.reject(error);
      pending.clear();
    };
    child.on("error", fail);
    child.on("exit", (code) => fail(new Error(`Code review worker exited (code ${code}).`)));
  });
}

export async function reviewCode(code: string, filename?: string): Promise<CodeReview> {
  ready ??= startWorker();
  await ready;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker?.stdin.write(`${JSON.stringify({ id, code, filename })}\n`);
  });
}
