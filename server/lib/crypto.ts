import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = "bunz-byok-salt-v1";

/**
 * Derive a 256-bit encryption key from the ENCRYPTION_KEY env var.
 * Falls back to a deterministic key derived from a default passphrase
 * if ENCRYPTION_KEY is not set (development only).
 */
function getKey(): Buffer {
  const passphrase = process.env.ENCRYPTION_KEY || "bunz-dev-encryption-key-change-in-prod";
  return scryptSync(passphrase, SALT, KEY_LENGTH);
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns `iv:authTag:ciphertext` as base64-encoded segments.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Decrypt an `iv:authTag:ciphertext` string produced by encrypt().
 */
export function decrypt(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Mask an API key for frontend display: `sk-ant-...abcd`
 */
export function maskKey(key: string): string {
  if (!key || key.length < 8) return "****";
  return key.slice(0, 8) + "..." + key.slice(-4);
}
