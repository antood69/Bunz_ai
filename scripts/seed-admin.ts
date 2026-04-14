/**
 * Seed script: create or update admin account for abigail.lowry@uky.edu
 *
 * Usage: npx tsx scripts/seed-admin.ts
 */
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

const DB_PATH = process.env.NODE_ENV === "production" ? "/data/data.db" : "data.db";
const EMAIL = "abigail.lowry@uky.edu";
const PASSWORD = "lesboqueen";
const ROLE = "admin";
const TIER = "agency";
const MONTHLY_TOKENS = 999_999_999;

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

// Ensure required tables exist (mirrors server/storage.ts initialization)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    display_name TEXT,
    avatar_url TEXT,
    auth_provider TEXT NOT NULL DEFAULT 'email',
    provider_id TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    tier TEXT NOT NULL DEFAULT 'free',
    stripe_customer_id TEXT,
    subscription_id TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS user_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free',
    monthly_tokens INTEGER NOT NULL DEFAULT 50000,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    period_start TEXT NOT NULL DEFAULT '',
    period_end TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ''
  );
`);

const existing = sqlite
  .prepare("SELECT id, email, role, tier FROM users WHERE email = ?")
  .get(EMAIL) as { id: number; email: string; role: string; tier: string } | undefined;

if (existing) {
  console.log(`User already exists (id=${existing.id}). Updating role → ${ROLE}, tier → ${TIER}, password...`);

  const updatedHash = bcrypt.hashSync(PASSWORD, 12);
  sqlite
    .prepare("UPDATE users SET role = ?, tier = ?, email_verified = 1, password_hash = ? WHERE id = ?")
    .run(ROLE, TIER, updatedHash, existing.id);

  // Update or create user plan
  const plan = sqlite
    .prepare("SELECT id FROM user_plans WHERE user_id = ?")
    .get(existing.id) as { id: number } | undefined;

  if (plan) {
    sqlite
      .prepare(
        "UPDATE user_plans SET tier = ?, monthly_tokens = ?, tokens_used = 0, period_start = ?, period_end = ? WHERE id = ?"
      )
      .run(
        TIER,
        MONTHLY_TOKENS,
        new Date().toISOString(),
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        plan.id
      );
    console.log("Updated existing user plan.");
  } else {
    sqlite
      .prepare(
        "INSERT INTO user_plans (user_id, tier, monthly_tokens, tokens_used, period_start, period_end, created_at) VALUES (?, ?, ?, 0, ?, ?, ?)"
      )
      .run(
        existing.id,
        TIER,
        MONTHLY_TOKENS,
        new Date().toISOString(),
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        new Date().toISOString()
      );
    console.log("Created new user plan.");
  }

  console.log("Done. User updated successfully.");
} else {
  console.log("User does not exist. Creating new admin account...");

  const passwordHash = bcrypt.hashSync(PASSWORD, 12);
  const username = EMAIL.split("@")[0] + "_" + Math.random().toString(36).slice(2, 6);
  const now = new Date().toISOString();

  const result = sqlite
    .prepare(
      `INSERT INTO users (username, email, password_hash, display_name, auth_provider, role, tier, email_verified, created_at)
       VALUES (?, ?, ?, ?, 'email', ?, ?, 1, ?)`
    )
    .run(username, EMAIL, passwordHash, "Abigail Lowry", ROLE, TIER, now);

  const userId = result.lastInsertRowid;
  console.log(`Created user id=${userId}, username=${username}`);

  // Create user plan with unlimited tokens
  sqlite
    .prepare(
      "INSERT INTO user_plans (user_id, tier, monthly_tokens, tokens_used, period_start, period_end, created_at) VALUES (?, ?, ?, 0, ?, ?, ?)"
    )
    .run(
      userId,
      TIER,
      MONTHLY_TOKENS,
      now,
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      now
    );
  console.log("Created user plan with 999,999,999 monthly tokens.");

  // Create welcome notification
  sqlite
    .prepare(
      "INSERT INTO notifications (user_id, type, title, message, read, created_at) VALUES (?, 'welcome', 'Welcome to Bunz!', 'Your admin account has been created.', 0, ?)"
    )
    .run(userId, now);

  console.log(`Done. Admin account created.`);
  console.log(`  Email:    ${EMAIL}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log(`  Role:     ${ROLE}`);
  console.log(`  Tier:     ${TIER}`);
  console.log(`  Tokens:   ${MONTHLY_TOKENS.toLocaleString()}/month`);
}

sqlite.close();
