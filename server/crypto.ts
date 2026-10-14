import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const ENCODING = "hex" as const;

function getDerivedKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("ENCRYPTION_SECRET env var is required for field encryption");
  }
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a plaintext string. Returns `iv:tag:ciphertext` hex string.
 * Returns null/undefined unchanged (no-op on empty values).
 */
export function encrypt(plaintext: string | null | undefined): string | null | undefined {
  if (!plaintext) return plaintext;
  const key = getDerivedKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString(ENCODING)}:${tag.toString(ENCODING)}:${encrypted.toString(ENCODING)}`;
}

/**
 * Decrypt an `iv:tag:ciphertext` hex string back to plaintext.
 * Returns null/undefined unchanged; returns already-plaintext values if not in encrypted format.
 */
export function decrypt(ciphertext: string | null | undefined): string | null | undefined {
  if (!ciphertext) return ciphertext;
  const parts = ciphertext.split(":");
  if (parts.length !== 3) return ciphertext; // not encrypted — return as-is (migration safety)
  const [ivHex, tagHex, encHex] = parts;
  try {
    const key = getDerivedKey();
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, ENCODING));
    decipher.setAuthTag(Buffer.from(tagHex, ENCODING));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, ENCODING)), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return ciphertext; // decryption failed — return raw (graceful degradation)
  }
}
