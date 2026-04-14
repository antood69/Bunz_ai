import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHmac } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = "bunz-connector-salt-v1";

let warnedAboutKey = false;

function getKey(): Buffer {
  const envKey = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!envKey && !warnedAboutKey) {
    console.warn("[Connectors] CONNECTOR_ENCRYPTION_KEY not set — using auto-generated key. Set this env var in production!");
    warnedAboutKey = true;
  }
  const passphrase = envKey || "bunz-connector-auto-key-" + (process.env.SESSION_SECRET || "dev");
  return scryptSync(passphrase, SALT, KEY_LENGTH);
}

export function encryptCredentials(data: Record<string, any>): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptCredentials(encrypted: string): Record<string, any> {
  const parts = encrypted.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted credential format");
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

export function generateHmacSecret(): string {
  return randomBytes(32).toString("hex");
}

export function verifyHmac(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  return expected === signature;
}

export function signHmac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
