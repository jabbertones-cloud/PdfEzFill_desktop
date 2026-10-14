import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";

/**
 * Per-install encryption secret for profile field encryption
 * (server/crypto.ts requires ENCRYPTION_SECRET and throws without it,
 * which made every real profile save fail with HTTP 500 in the app).
 *
 * Resolution order:
 *   1. an ENCRYPTION_SECRET already in the environment (operator override)
 *   2. the secret persisted from a previous launch under userData
 *   3. a freshly generated 256-bit secret, persisted under userData
 *      with owner-only permissions (0600) and reused on later launches
 *
 * No secret value is ever hard-coded or logged.
 */
export function ensureEncryptionSecret(
  userDataDir: string,
  existing?: string,
): string {
  if (existing) return existing;

  const secretFile = path.join(userDataDir, "encryption-secret");
  try {
    const saved = fs.readFileSync(secretFile, "utf8").trim();
    if (saved) return saved;
  } catch {
    // Not created yet — fall through and generate one.
  }

  const secret = randomBytes(32).toString("hex");
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  try {
    fs.chmodSync(secretFile, 0o600);
  } catch {
    // Best effort on filesystems without POSIX modes.
  }
  return secret;
}
