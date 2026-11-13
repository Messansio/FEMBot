import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getGitHubSetup } from "./config.js";

/** Encrypts a secret (GitHub/Discord token) for storage: AES-256-GCM, "v1.iv.tag.ciphertext". */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getGitHubSetup().tokenEncryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), encrypted].map((part) =>
    typeof part === "string" ? part : part.toString("base64url"),
  ).join(".");
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, encrypted] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Unknown secret format.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getGitHubSetup().tokenEncryptionKey,
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Unguessable token for links (login, invites). Only its hash is stored. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
