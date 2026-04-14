import {
  type User, type InsertUser, users,
  type Workflow, type InsertWorkflow, workflows,
  type Agent, type InsertAgent, agents,
  type Job, type InsertJob, jobs,
  type Message, type InsertMessage, messages,
  type AuditReview, type InsertAuditReview, auditReviews,
  type Escalation, type InsertEscalation, escalations,
  type TradeJournalEntry, type InsertTradeJournal, tradeJournal,
  type BotChallenge, type InsertBotChallenge, botChallenges,
  type TokenUsageRecord, type InsertTokenUsage, tokenUsage,
  type TokenPack, type InsertTokenPack, tokenPacks,
  type UserPlan, type InsertUserPlan, userPlans,
  type WorkflowRun, type InsertWorkflowRun, workflowRuns,
  type AgentExecution, type InsertAgentExecution, agentExecutions,
  type WorkflowVersion, type InsertWorkflowVersion, workflowVersions,
  type Session, sessions,
  type OwnerIntelligence, ownerIntelligence,
  type EmailVerification, emailVerifications,
  type Notification, notifications,
  type MarketplaceListing, type MarketplacePurchase, type MarketplaceReview,
  type Conversation, type InsertConversation, conversations,
  type BossMessage, type InsertBossMessage, bossMessages,
  type AgentJob, type InsertAgentJob, agentJobs,
  type GigTemplate, type InsertGigTemplate, gigTemplates,
  type WebhookSecret, webhookSecrets,
  type ManualIncomeEntry, manualIncomeEntries,
  agentConfigs, type AgentConfig, type InsertAgentConfig,
  workflowExecutions, type WorkflowExecution, type InsertWorkflowExecution,
  workflowNodeResults, type WorkflowNodeResult, type InsertWorkflowNodeResult,
  connectors, type Connector, type InsertConnector,
  oauthStates, type OAuthState,
  webhookEvents, type WebhookEvent,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, gte, and } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.NODE_ENV === "production" ? "/data/data.db" : "data.db";
// Ensure parent directory exists (fixes Railway crash when /data isn't pre-created)
try { mkdirSync(dirname(DB_PATH), { recursive: true }); } catch {}
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

// Auto-create ALL tables if they don't exist (covers fresh deploys)
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
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
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
  CREATE TABLE IF NOT EXISTS owner_intelligence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_email TEXT,
    event_type TEXT NOT NULL,
    model TEXT,
    input_data TEXT,
    output_data TEXT,
    tokens_used INTEGER DEFAULT 0,
    quality TEXT,
    tags TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS workflows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    priority TEXT NOT NULL DEFAULT 'medium',
    canvas_state TEXT,
    is_template INTEGER DEFAULT 0,
    template_category TEXT,
    template_description TEXT,
    is_public INTEGER DEFAULT 0,
    fork_count INTEGER DEFAULT 0,
    use_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS workflow_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id INTEGER NOT NULL,
    version_number INTEGER NOT NULL,
    graph_state TEXT NOT NULL,
    label TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'claude-sonnet',
    workflow_id INTEGER,
    status TEXT NOT NULL DEFAULT 'idle',
    system_prompt TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id INTEGER NOT NULL,
    agent_id INTEGER,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    result TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS audit_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    agent_id INTEGER NOT NULL,
    verdict TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS escalations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    agent_id INTEGER,
    level INTEGER NOT NULL DEFAULT 1,
    reason TEXT NOT NULL,
    context TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    resolution TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS trade_journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firm TEXT NOT NULL,
    instrument TEXT NOT NULL,
    direction TEXT NOT NULL,
    entry_price TEXT NOT NULL,
    exit_price TEXT,
    pnl TEXT,
    risk_reward TEXT,
    entry_reason TEXT,
    ai_analysis TEXT,
    tags TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    opened_at TEXT NOT NULL DEFAULT '',
    closed_at TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS bot_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    firm TEXT NOT NULL,
    account_size INTEGER NOT NULL DEFAULT 100000,
    profit_target TEXT NOT NULL,
    max_drawdown TEXT NOT NULL,
    daily_drawdown TEXT NOT NULL,
    consistency_rule TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    current_pnl TEXT DEFAULT '0',
    peak_balance TEXT,
    bot_config TEXT,
    started_at TEXT NOT NULL DEFAULT '',
    ended_at TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    endpoint TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS token_packs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tokens INTEGER NOT NULL,
    price INTEGER NOT NULL,
    stripe_payment_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    tokens_remaining INTEGER NOT NULL,
    purchased_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS user_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free',
    monthly_tokens INTEGER NOT NULL DEFAULT 3000,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    period_start TEXT NOT NULL DEFAULT '',
    period_end TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS workflow_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    execution_mode TEXT NOT NULL DEFAULT 'boss',
    input_data TEXT,
    final_output TEXT,
    total_tokens_used INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS agent_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    agent_id INTEGER,
    worker_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    input_payload TEXT,
    output TEXT,
    model_used TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS marketplace_listings (
    id TEXT PRIMARY KEY,
    seller_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    short_description TEXT,
    category TEXT NOT NULL DEFAULT 'workflow',
    listing_type TEXT NOT NULL DEFAULT 'standalone',
    price_usd REAL NOT NULL DEFAULT 0,
    price_type TEXT NOT NULL DEFAULT 'free',
    content_ref TEXT,
    version TEXT NOT NULL DEFAULT '1.0.0',
    is_published INTEGER NOT NULL DEFAULT 0,
    is_verified INTEGER NOT NULL DEFAULT 0,
    install_count INTEGER NOT NULL DEFAULT 0,
    rating_avg REAL NOT NULL DEFAULT 0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    preview_images TEXT,
    tags TEXT,
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS marketplace_purchases (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    buyer_id INTEGER NOT NULL,
    seller_id INTEGER NOT NULL,
    amount_usd REAL NOT NULL DEFAULT 0,
    platform_fee_usd REAL NOT NULL DEFAULT 0,
    seller_payout_usd REAL NOT NULL DEFAULT 0,
    stripe_payment_id TEXT,
    stripe_transfer_id TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS marketplace_reviews (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    buyer_id INTEGER NOT NULL,
    purchase_id TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 5,
    review_text TEXT,
    is_verified_purchase INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS custom_tools (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    tool_type TEXT NOT NULL DEFAULT 'rest_api',
    endpoint TEXT,
    method TEXT DEFAULT 'POST',
    headers TEXT,
    auth_type TEXT DEFAULT 'none',
    auth_config TEXT,
    input_schema TEXT,
    output_schema TEXT,
    is_active INTEGER DEFAULT 1,
    usage_count INTEGER DEFAULT 0,
    last_used_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    wallpaper_url TEXT,
    wallpaper_type TEXT DEFAULT 'none',
    wallpaper_tint REAL DEFAULT 0.4,
    accent_color TEXT DEFAULT '#6366f1',
    glass_blur INTEGER DEFAULT 12,
    glass_opacity REAL DEFAULT 0.08,
    sidebar_position TEXT DEFAULT 'left',
    compact_mode INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL,
    entry_price REAL NOT NULL,
    exit_price REAL,
    quantity REAL NOT NULL,
    entry_time TEXT NOT NULL,
    exit_time TEXT,
    gross_pnl REAL,
    fees REAL DEFAULT 0,
    net_pnl REAL,
    strategy_tag TEXT,
    notes TEXT,
    screenshot_url TEXT,
    import_source TEXT DEFAULT 'manual',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trading_sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    gross_pnl REAL DEFAULT 0,
    net_pnl REAL DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS broker_connections (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    broker TEXT NOT NULL,
    label TEXT,
    api_key TEXT,
    api_secret TEXT,
    is_paper INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    last_sync_at TEXT,
    account_id TEXT,
    account_info TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_api_keys (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    api_key TEXT,
    endpoint_url TEXT,
    default_model TEXT,
    is_default INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS account_stacks (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    leader_connection_id TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    copy_mode TEXT DEFAULT 'mirror',
    size_multiplier REAL DEFAULT 1.0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS account_stack_followers (
    id TEXT PRIMARY KEY,
    stack_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    size_multiplier REAL DEFAULT 1.0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trading_bots (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    strategy_type TEXT NOT NULL DEFAULT 'custom',
    model TEXT DEFAULT 'claude-sonnet',
    system_prompt TEXT,
    indicators TEXT,
    entry_rules TEXT,
    exit_rules TEXT,
    risk_rules TEXT,
    timeframe TEXT DEFAULT '5m',
    symbols TEXT DEFAULT '["ES","NQ"]',
    status TEXT DEFAULT 'draft',
    backtest_results TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bot_deployments (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    bot_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    status TEXT DEFAULT 'stopped',
    max_position_size INTEGER DEFAULT 1,
    max_daily_loss REAL DEFAULT 500,
    max_trades_per_day INTEGER DEFAULT 10,
    last_signal_at TEXT,
    total_trades INTEGER DEFAULT 0,
    total_pnl REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fiverr_gigs (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    category TEXT,
    description TEXT,
    price_tiers TEXT,
    auto_response TEXT,
    ai_model TEXT DEFAULT 'claude-sonnet',
    is_active INTEGER DEFAULT 1,
    total_orders INTEGER DEFAULT 0,
    total_revenue REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fiverr_orders (
    id TEXT PRIMARY KEY,
    gig_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    buyer_name TEXT,
    requirements TEXT,
    ai_draft TEXT,
    status TEXT DEFAULT 'pending',
    amount REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS gig_templates (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    output_format TEXT DEFAULT 'markdown',
    default_model TEXT,
    estimated_tokens INTEGER,
    turnaround_hours INTEGER,
    auto_generate INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS webhook_secrets (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    secret TEXT NOT NULL,
    source TEXT DEFAULT 'fiverr',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS manual_income_entries (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT NOT NULL,
    platform TEXT DEFAULT 'manual',
    date INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS generated_apps (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    app_type TEXT DEFAULT 'web',
    framework TEXT DEFAULT 'react',
    generated_code TEXT,
    preview_url TEXT,
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS white_label_configs (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    brand_name TEXT NOT NULL,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#6366f1',
    secondary_color TEXT DEFAULT '#8b5cf6',
    custom_domain TEXT,
    features TEXT,
    max_users INTEGER DEFAULT 10,
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS prop_accounts (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    firm TEXT NOT NULL,
    account_number TEXT,
    account_size INTEGER,
    phase TEXT DEFAULT 'evaluation',
    profit_target REAL,
    max_drawdown REAL,
    daily_drawdown REAL,
    current_balance REAL,
    current_pnl REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    credentials TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    category TEXT,
    features TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_products (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id INTEGER NOT NULL,
    product_id TEXT NOT NULL,
    stripe_payment_id TEXT,
    price_cents INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    purchased_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT
  );

  CREATE TABLE IF NOT EXISTS workflow_presets (
    id TEXT PRIMARY KEY,
    product_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    template_data TEXT NOT NULL,
    icon TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Phase 1: Boss AI Engine tables
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT 'New conversation',
    model TEXT DEFAULT 'claude-sonnet',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS boss_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER DEFAULT 0,
    model TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_jobs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    input TEXT,
    output TEXT,
    token_count INTEGER DEFAULT 0,
    duration_ms INTEGER,
    parent_job_id TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS agent_configs (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    agent_type TEXT NOT NULL,
    model TEXT,
    models TEXT,
    system_prompt TEXT,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workflow_executions (
    id TEXT PRIMARY KEY,
    workflow_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at INTEGER,
    completed_at INTEGER,
    error_message TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workflow_node_results (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    agent_type TEXT,
    input TEXT,
    output TEXT,
    token_count INTEGER DEFAULT 0,
    duration_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS connectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    name TEXT NOT NULL,
    config TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'connected',
    last_used_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    connector_id INTEGER NOT NULL,
    headers TEXT,
    payload TEXT,
    source_ip TEXT,
    processed_at TEXT,
    created_at TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS workshop_mods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    long_description TEXT,
    category TEXT NOT NULL,
    icon TEXT,
    price REAL NOT NULL DEFAULT 0,
    version TEXT NOT NULL DEFAULT '1.0.0',
    install_count INTEGER NOT NULL DEFAULT 0,
    rating REAL,
    is_official INTEGER NOT NULL DEFAULT 0,
    is_published INTEGER NOT NULL DEFAULT 1,
    route TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_installed_mods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    mod_id INTEGER NOT NULL,
    installed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, mod_id)
  );

  CREATE TABLE IF NOT EXISTS uploaded_files (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    conversation_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed products
try {
  sqlite.exec(`INSERT OR IGNORE INTO products (id, name, description, price_cents, category, features) VALUES ('meme-coin-engine', 'Meme Coin Trading Engine', 'Complete meme coin trading workflow suite with signal detection, risk management, and execution templates. Includes 5 pre-built workflow presets.', 799, 'trading', '["Token Scanner Workflow","Smart Money Tracker","Auto-Exit Strategy","Social Sentiment Pipeline","Multi-Chain Sniper"]')`);
} catch (_) {}

// Seed workflow presets for meme coin engine
try {
  sqlite.exec(`INSERT OR IGNORE INTO workflow_presets (id, product_id, name, description, category, template_data, icon) VALUES ('preset-token-scanner', 'meme-coin-engine', 'Token Scanner', 'Monitors new token launches, filters by liquidity and volume, generates trade signals', 'trading', '{"nodes":[{"id":"trigger","type":"trigger","data":{"label":"New Token Alert"},"position":{"x":50,"y":100}},{"id":"filter","type":"logic","data":{"label":"Liquidity Filter"},"position":{"x":300,"y":100}},{"id":"signal","type":"output","data":{"label":"Generate Signal"},"position":{"x":550,"y":100}}],"edges":[{"source":"trigger","target":"filter"},{"source":"filter","target":"signal"}]}', 'Search')`);
  sqlite.exec(`INSERT OR IGNORE INTO workflow_presets (id, product_id, name, description, category, template_data, icon) VALUES ('preset-smart-money', 'meme-coin-engine', 'Smart Money Tracker', 'Watches whale wallets for large buys and alerts you in real-time', 'trading', '{"nodes":[{"id":"trigger","type":"trigger","data":{"label":"Wallet Monitor"},"position":{"x":50,"y":100}},{"id":"agent","type":"agent","data":{"label":"Whale Detector"},"position":{"x":300,"y":100}},{"id":"alert","type":"output","data":{"label":"Alert Owner"},"position":{"x":550,"y":100}}],"edges":[{"source":"trigger","target":"agent"},{"source":"agent","target":"alert"}]}', 'Eye')`);
  sqlite.exec(`INSERT OR IGNORE INTO workflow_presets (id, product_id, name, description, category, template_data, icon) VALUES ('preset-auto-exit', 'meme-coin-engine', 'Auto-Exit Strategy', 'Monitors open positions and applies take-profit and stop-loss rules automatically', 'trading', '{"nodes":[{"id":"trigger","type":"trigger","data":{"label":"Position Monitor"},"position":{"x":50,"y":100}},{"id":"check","type":"logic","data":{"label":"TP/SL Check"},"position":{"x":300,"y":100}},{"id":"exit","type":"output","data":{"label":"Execute Exit"},"position":{"x":550,"y":100}}],"edges":[{"source":"trigger","target":"check"},{"source":"check","target":"exit"}]}', 'ShieldCheck')`);
  sqlite.exec(`INSERT OR IGNORE INTO workflow_presets (id, product_id, name, description, category, template_data, icon) VALUES ('preset-sentiment', 'meme-coin-engine', 'Social Sentiment Pipeline', 'Scrapes social mentions, classifies sentiment with AI, generates buy or skip signals', 'trading', '{"nodes":[{"id":"trigger","type":"trigger","data":{"label":"Social Scraper"},"position":{"x":50,"y":100}},{"id":"agent","type":"agent","data":{"label":"Sentiment Analyzer"},"position":{"x":300,"y":100}},{"id":"decision","type":"logic","data":{"label":"Signal Gate"},"position":{"x":550,"y":100}},{"id":"output","type":"output","data":{"label":"Buy Signal"},"position":{"x":800,"y":100}}],"edges":[{"source":"trigger","target":"agent"},{"source":"agent","target":"decision"},{"source":"decision","target":"output"}]}', 'MessageSquare')`);
  sqlite.exec(`INSERT OR IGNORE INTO workflow_presets (id, product_id, name, description, category, template_data, icon) VALUES ('preset-sniper', 'meme-coin-engine', 'Multi-Chain Sniper', 'Cross-chain token scanner for fastest entry execution on new launches', 'trading', '{"nodes":[{"id":"trigger","type":"trigger","data":{"label":"Chain Scanner"},"position":{"x":50,"y":100}},{"id":"validate","type":"logic","data":{"label":"Contract Validator"},"position":{"x":300,"y":100}},{"id":"execute","type":"output","data":{"label":"Execute Buy"},"position":{"x":550,"y":100}}],"edges":[{"source":"trigger","target":"validate"},{"source":"validate","target":"execute"}]}', 'Zap')`);
} catch (_) {}

// Seed official workshop mods
try {
  sqlite.exec(`
    INSERT OR IGNORE INTO workshop_mods (slug, name, description, long_description, category, icon, price, version, install_count, rating, is_official, route) VALUES
    ('fiverr-automation', 'Fiverr Automation', 'AI-powered Fiverr order management with kanban, templates, auto-generation', 'Complete Fiverr automation suite. Manage orders with AI-powered drafting, kanban boards, gig templates, and one-click delivery. Auto-generate deliverables from buyer requirements.', 'Freelance', 'Briefcase', 0, '1.0.0', 142, 4.7, 1, '/fiverr'),
    ('bot-challenge', 'Bot Challenge', 'Test your trading skills against AI-configured bot scenarios', 'Simulated prop firm challenges where you trade against AI bots. Configure account sizes, drawdown limits, and profit targets. Track your performance and learn risk management.', 'Trading', 'Target', 0, '1.0.0', 89, 4.3, 1, '/bot-challenge'),
    ('trade-journal', 'Trade Journal', 'AI-analyzed trading journal with entry/exit tracking and coaching insights', 'Professional trading journal with AI-powered post-trade analysis. Track entries, exits, P&L, and get personalized coaching insights to improve your trading.', 'Trading', 'BookOpen', 0, '1.0.0', 203, 4.8, 1, '/journal'),
    ('account-stacking', 'Account Stacking', 'Multi-account equity tracking and prop firm management', 'Manage multiple trading accounts with copy trading, equity tracking, and automated execution across prop firms and brokers.', 'Trading', 'Layers', 0, '1.0.0', 67, 4.1, 1, '/stacks'),
    ('app-generator', 'App Generator', 'Claude Code-style IDE with AI chat, live preview, and ZIP export', 'Full-stack app generator with AI chat, code editor, live preview, and one-click ZIP export. Build React, Node, and Python apps with AI assistance.', 'Development', 'Cpu', 0, '1.0.0', 312, 4.9, 1, '/app-generator'),
    ('prop-trading', 'Prop Trading', 'Professional trading with live charts, firm presets, and risk management', 'Professional prop trading dashboard with live charts, firm preset configurations, risk management tools, and real-time P&L tracking.', 'Trading', 'Trophy', 0, '1.0.0', 156, 4.5, 1, '/prop-trading'),
    ('white-label', 'White Label', 'Rebrand Bunz as your own platform for clients', 'Create your own branded AI platform. Customize logos, colors, domains, and features. Perfect for agencies and consultants who want to offer AI services under their own brand.', 'Productivity', 'Building2', 0, '1.0.0', 34, 4.0, 1, '/white-label');
  `);
} catch (_) {}

// Auto-seed admin accounts
try {
  const bcrypt = require("bcryptjs");
  const seedAccounts = [
    { email: "test@bunz.io", password: "TestBunz123!", displayName: "Test Admin" },
    { email: "abigail.lowry@uky.edu", password: "lesboqueen", displayName: "Abigail Lowry" },
  ];
  for (const acct of seedAccounts) {
    const existing = sqlite.prepare("SELECT id FROM users WHERE email = ?").get(acct.email);
    if (!existing) {
      const hash = bcrypt.hashSync(acct.password, 12);
      const username = acct.email.split("@")[0] + "_" + Math.random().toString(36).slice(2, 6);
      const result = sqlite.prepare(
        "INSERT INTO users (username, email, password_hash, display_name, auth_provider, role, tier, email_verified, created_at) VALUES (?, ?, ?, ?, 'email', 'admin', 'agency', 1, ?)"
      ).run(username, acct.email, hash, acct.displayName, new Date().toISOString());
      const userId = result.lastInsertRowid;
      sqlite.prepare(
        "INSERT INTO user_plans (user_id, tier, monthly_tokens, tokens_used, period_start, period_end, created_at) VALUES (?, 'agency', 999999999, 0, ?, ?, ?)"
      ).run(userId, new Date().toISOString(), new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), new Date().toISOString());
      console.log(`[seed] Created admin account: ${acct.email}`);
    }
  }
} catch (e) {
  console.error("[seed] Failed to seed admin accounts:", e);
}

// Auto-install all mods for owner account (reederb46@gmail.com)
try {
  const ownerUser = sqlite.prepare("SELECT id FROM users WHERE email = 'reederb46@gmail.com'").get() as any;
  if (ownerUser) {
    const allMods = sqlite.prepare("SELECT id FROM workshop_mods").all() as any[];
    for (const mod of allMods) {
      sqlite.prepare("INSERT OR IGNORE INTO user_installed_mods (user_id, mod_id) VALUES (?, ?)").run(ownerUser.id, mod.id);
    }
  }
  // Also auto-install all mods for admin accounts
  const adminUsers = sqlite.prepare("SELECT id FROM users WHERE role IN ('admin', 'owner')").all() as any[];
  for (const u of adminUsers) {
    const allMods = sqlite.prepare("SELECT id FROM workshop_mods").all() as any[];
    for (const mod of allMods) {
      sqlite.prepare("INSERT OR IGNORE INTO user_installed_mods (user_id, mod_id) VALUES (?, ?)").run(u.id, mod.id);
    }
  }
} catch (_) {}

// Safe ALTER TABLE for existing DBs that lack new columns
const safeAlter = (sql: string) => {
  try { sqlite.exec(sql); } catch (_) { /* column already exists */ }
};

// Marketplace listing type columns
safeAlter("ALTER TABLE marketplace_listings ADD COLUMN listing_type TEXT DEFAULT 'service'");
safeAlter("ALTER TABLE marketplace_listings ADD COLUMN attached_item_id TEXT");
safeAlter("ALTER TABLE marketplace_listings ADD COLUMN attached_item_data TEXT");

// Fiverr orders pipeline columns
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN client_name TEXT");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN client_email TEXT");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN gig_type TEXT");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN deadline TEXT");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN ai_output TEXT");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN revision_notes TEXT");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN delivery_message TEXT");
// Phase 3: Fiverr Automation extended columns
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN order_id TEXT");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN gig_title TEXT");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN specs TEXT");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN revenue INTEGER");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN generated_output TEXT");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN generation_job_id TEXT");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN template_id TEXT");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN auto_generate INTEGER DEFAULT 0");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN due_at INTEGER");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN delivered_at INTEGER");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN reviewed_at INTEGER");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN review_note TEXT");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN updated_at INTEGER");
safeAlter("ALTER TABLE fiverr_orders ADD COLUMN models TEXT");

// Users table migration for existing DBs
safeAlter("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''");
safeAlter("ALTER TABLE users ADD COLUMN password_hash TEXT");
safeAlter("ALTER TABLE users ADD COLUMN display_name TEXT");
safeAlter("ALTER TABLE users ADD COLUMN avatar_url TEXT");
safeAlter("ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'email'");
safeAlter("ALTER TABLE users ADD COLUMN provider_id TEXT");
safeAlter("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
safeAlter("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
safeAlter("ALTER TABLE users ADD COLUMN last_login_at TEXT");
safeAlter("ALTER TABLE users ADD COLUMN created_at TEXT NOT NULL DEFAULT ''");
// GitHub token for Coder agent repo access
safeAlter("ALTER TABLE users ADD COLUMN github_token TEXT");
safeAlter("ALTER TABLE users ADD COLUMN github_username TEXT");
// Generated apps version tracking
safeAlter("ALTER TABLE generated_apps ADD COLUMN versions TEXT");

// Stack execution log table
try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS stack_execution_log (
      id TEXT PRIMARY KEY,
      stack_id TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      executed_at TEXT DEFAULT (datetime('now'))
    );
  `);
} catch (_) {}

// Workflows table migration
safeAlter("ALTER TABLE user_preferences ADD COLUMN trading_disclaimer_ack INTEGER NOT NULL DEFAULT 0");
safeAlter("ALTER TABLE workflows ADD COLUMN canvas_state TEXT");
safeAlter("ALTER TABLE workflows ADD COLUMN is_template INTEGER DEFAULT 0");
safeAlter("ALTER TABLE workflows ADD COLUMN template_category TEXT");
safeAlter("ALTER TABLE workflows ADD COLUMN template_description TEXT");
safeAlter("ALTER TABLE workflows ADD COLUMN is_public INTEGER DEFAULT 0");
safeAlter("ALTER TABLE workflows ADD COLUMN fork_count INTEGER DEFAULT 0");
safeAlter("ALTER TABLE workflows ADD COLUMN use_count INTEGER DEFAULT 0");
safeAlter("ALTER TABLE gig_templates ADD COLUMN workflow_id INTEGER");

// Agent configs multi-model support
safeAlter("ALTER TABLE agent_configs ADD COLUMN models TEXT");

// Phase 3 Dashboard: user_dashboard_layouts table
try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS user_dashboard_layouts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      layout TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL DEFAULT 0
    );
  `);
} catch (_) {}

// Phase 3 Dashboard: activity_events table
try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT 0
    );
  `);
} catch (_) {}

export const db = drizzle(sqlite);
export { sqlite };

// Custom Tool type (raw SQLite, not drizzle-managed)
export interface CustomTool {
  id: string;
  ownerId: number;
  name: string;
  description: string;
  toolType: string;
  endpoint: string | null;
  method: string | null;
  headers: string | null;
  authType: string | null;
  authConfig: string | null;
  inputSchema: string | null;
  outputSchema: string | null;
  isActive: number;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Trade Journal types ──────────────────────────────────────────────────────
export interface Trade {
  id: string;
  userId: number;
  symbol: string;
  direction: string; // 'long' | 'short'
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  entryTime: string;
  exitTime: string | null;
  grossPnl: number | null;
  fees: number;
  netPnl: number | null;
  strategyTag: string | null;
  notes: string | null;
  screenshotUrl: string | null;
  importSource: string;
  createdAt: string;
}

export interface TradingStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  grossPnl: number;
  netPnl: number;
  bestTrade: number;
  worstTrade: number;
  avgRR: number;
  currentWinStreak: number;
  currentLossStreak: number;
  bestWinStreak: number;
}

// ── Broker Connection types ──────────────────────────────────────────────────
export interface BrokerConnection {
  id: string;
  userId: number;
  broker: string;
  label: string | null;
  apiKey: string | null;
  apiSecret: string | null;
  isPaper: number;
  isActive: number;
  lastSyncAt: string | null;
  accountId: string | null;
  accountInfo: string | null;
  createdAt: string;
}

// ── User API Keys types ──────────────────────────────────────────────────────
export interface UserApiKey {
  id: string;
  userId: number;
  provider: string; // openai | anthropic | google | mistral | groq | ollama
  apiKey: string | null;
  endpointUrl: string | null;
  defaultModel: string | null;
  isDefault: number;
  isActive: number;
  createdAt: string;
}

// ── Account Stacks types ──────────────────────────────────────────────────────
export interface AccountStack {
  id: string;
  userId: number;
  name: string;
  leaderConnectionId: string;
  status: string;
  copyMode: string;
  sizeMultiplier: number;
  createdAt: string;
}

export interface AccountStackFollower {
  id: string;
  stackId: string;
  connectionId: string;
  sizeMultiplier: number;
  isActive: number;
  createdAt: string;
}

// ── Trading Bot types ──────────────────────────────────────────────────────────
export interface TradingBot {
  id: string;
  userId: number;
  name: string;
  description: string | null;
  strategyType: string;
  model: string;
  systemPrompt: string | null;
  indicators: string | null;
  entryRules: string | null;
  exitRules: string | null;
  riskRules: string | null;
  timeframe: string;
  symbols: string;
  status: string;
  backtestResults: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Bot Deployment types ──────────────────────────────────────────────────────
export interface BotDeployment {
  id: string;
  userId: number;
  botId: string;
  connectionId: string;
  status: string;
  maxPositionSize: number;
  maxDailyLoss: number;
  maxTradesPerDay: number;
  lastSignalAt: string | null;
  totalTrades: number;
  totalPnl: number;
  createdAt: string;
}

// ── Fiverr types ──────────────────────────────────────────────────────────────
export interface FiverrGig {
  id: string;
  userId: number;
  title: string;
  category: string | null;
  description: string | null;
  priceTiers: string | null;
  autoResponse: string | null;
  aiModel: string;
  isActive: number;
  totalOrders: number;
  totalRevenue: number;
  createdAt: string;
}

export interface FiverrOrder {
  id: string;
  gigId: string;
  userId: number;
  buyerName: string | null;
  requirements: string | null;
  aiDraft: string | null;
  status: string;
  amount: number;
  createdAt: string;
  completedAt: string | null;
}

// ── Generated App types ──────────────────────────────────────────────────────
export interface GeneratedApp {
  id: string;
  userId: number;
  name: string;
  description: string | null;
  appType: string;
  framework: string;
  generatedCode: string | null;
  previewUrl: string | null;
  status: string;
  versions: string | null;
  createdAt: string;
}

// ── White Label types ──────────────────────────────────────────────────────────
export interface WhiteLabelConfig {
  id: string;
  userId: number;
  brandName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  customDomain: string | null;
  features: string | null;
  maxUsers: number;
  status: string;
  createdAt: string;
}

// ── Prop Account types ──────────────────────────────────────────────────────────
export interface PropAccount {
  id: string;
  userId: number;
  firm: string;
  accountNumber: string | null;
  accountSize: number | null;
  phase: string;
  profitTarget: number | null;
  maxDrawdown: number | null;
  dailyDrawdown: number | null;
  currentBalance: number | null;
  currentPnl: number;
  status: string;
  credentials: string | null;
  createdAt: string;
}

export interface UserPreferences {
  id: number;
  userId: number;
  wallpaperUrl: string | null;
  wallpaperType: string;
  wallpaperTint: number;
  accentColor: string;
  glassBlur: number;
  glassOpacity: number;
  sidebarPosition: string;
  compactMode: number;
  createdAt: string;
  updatedAt: string;
}

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  // Workflows
  getWorkflows(): Promise<Workflow[]>;
  getWorkflow(id: number): Promise<Workflow | undefined>;
  createWorkflow(w: InsertWorkflow): Promise<Workflow>;
  updateWorkflow(id: number, data: Partial<InsertWorkflow>): Promise<Workflow | undefined>;
  deleteWorkflow(id: number): Promise<void>;
  // Agents
  getAgents(): Promise<Agent[]>;
  getAgent(id: number): Promise<Agent | undefined>;
  getAgentsByWorkflow(workflowId: number): Promise<Agent[]>;
  createAgent(a: InsertAgent): Promise<Agent>;
  updateAgent(id: number, data: Partial<InsertAgent>): Promise<Agent | undefined>;
  deleteAgent(id: number): Promise<void>;
  // Jobs
  getJobs(): Promise<Job[]>;
  getJobsByWorkflow(workflowId: number): Promise<Job[]>;
  createJob(j: InsertJob): Promise<Job>;
  updateJob(id: number, data: Partial<InsertJob>): Promise<Job | undefined>;
  // Messages
  getMessagesByAgent(agentId: number): Promise<Message[]>;
  createMessage(m: InsertMessage): Promise<Message>;
  // Audit reviews
  getAuditReviews(): Promise<AuditReview[]>;
  getAuditReviewsByJob(jobId: number): Promise<AuditReview[]>;
  createAuditReview(r: InsertAuditReview): Promise<AuditReview>;
  // Escalations
  getEscalations(): Promise<Escalation[]>;
  getEscalationsByJob(jobId: number): Promise<Escalation[]>;
  createEscalation(e: InsertEscalation): Promise<Escalation>;
  updateEscalation(id: number, data: Partial<InsertEscalation>): Promise<Escalation | undefined>;
  // Trade Journal
  getTradeJournalEntries(): Promise<TradeJournalEntry[]>;
  createTradeJournalEntry(e: InsertTradeJournal): Promise<TradeJournalEntry>;
  updateTradeJournalEntry(id: number, data: Partial<InsertTradeJournal>): Promise<TradeJournalEntry | undefined>;
  // Bot Challenges
  getBotChallenges(): Promise<BotChallenge[]>;
  createBotChallenge(c: InsertBotChallenge): Promise<BotChallenge>;
  updateBotChallenge(id: number, data: Partial<InsertBotChallenge>): Promise<BotChallenge | undefined>;
  // Token Usage
  recordTokenUsage(usage: InsertTokenUsage): Promise<TokenUsageRecord>;
  getTokenUsageByUser(userId: number): Promise<TokenUsageRecord[]>;
  getTokenUsageSummary(userId: number, since: string): Promise<{ total: number; byModel: Record<string, number> }>;
  // Token Packs
  getTokenPacksByUser(userId: number): Promise<TokenPack[]>;
  createTokenPack(pack: InsertTokenPack): Promise<TokenPack>;
  updateTokenPack(id: number, data: Partial<InsertTokenPack>): Promise<TokenPack | undefined>;
  // User Plans
  getUserPlan(userId: number): Promise<UserPlan | undefined>;
  createUserPlan(plan: InsertUserPlan): Promise<UserPlan>;
  updateUserPlan(id: number, data: Partial<InsertUserPlan>): Promise<UserPlan | undefined>;
  updateUser(id: number, data: Partial<{ tier: string; stripeCustomerId: string; subscriptionId: string; role: string; avatarUrl: string; displayName: string; lastLoginAt: string; passwordHash: string; authProvider: string; providerId: string; emailVerified: number; githubToken: string; githubUsername: string }>): Promise<User | undefined>;
  // GitHub token for Coder agent
  getGitHubToken(userId: number): Promise<string | null>;
  getGitHubUsername(userId: number): Promise<string | null>;
  setGitHubToken(userId: number, token: string, username: string): Promise<void>;
  // Workflow Runs
  getWorkflowRuns(workflowId: number): Promise<WorkflowRun[]>;
  getWorkflowRun(id: number): Promise<WorkflowRun | undefined>;
  createWorkflowRun(run: InsertWorkflowRun): Promise<WorkflowRun>;
  updateWorkflowRun(id: number, data: Partial<InsertWorkflowRun>): Promise<WorkflowRun | undefined>;
  // Agent Executions
  getAgentExecutions(runId: number): Promise<AgentExecution[]>;
  createAgentExecution(exec: InsertAgentExecution): Promise<AgentExecution>;
  updateAgentExecution(id: number, data: Partial<InsertAgentExecution>): Promise<AgentExecution | undefined>;
  // Workflow Versions
  getWorkflowVersions(workflowId: number): Promise<WorkflowVersion[]>;
  createWorkflowVersion(v: InsertWorkflowVersion): Promise<WorkflowVersion>;
  getWorkflowVersion(id: number): Promise<WorkflowVersion | undefined>;
  // Templates
  getPublicTemplates(): Promise<Workflow[]>;
  // Auth: Sessions
  createSession(session: { id: string; userId: number; expiresAt: string }): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  deleteSession(id: string): Promise<void>;
  deleteExpiredSessions(): Promise<void>;
  // Auth: Users (extended)
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByProviderId(provider: string, providerId: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  // Owner Intelligence
  recordIntelligence(data: { userId: number; userEmail?: string; eventType: string; model?: string; inputData?: string; outputData?: string; tokensUsed?: number; quality?: string; tags?: string; metadata?: string }): Promise<OwnerIntelligence>;
  getIntelligence(opts: { limit?: number; offset?: number; eventType?: string; userId?: number; quality?: string }): Promise<OwnerIntelligence[]>;
  getIntelligenceCount(): Promise<number>;
  updateIntelligenceQuality(id: number, quality: string): Promise<void>;
  // Email Verification
  createEmailVerification(userId: number, token: string, expiresAt: string): Promise<EmailVerification>;
  getEmailVerification(token: string): Promise<EmailVerification | undefined>;
  markEmailVerified(token: string): Promise<void>;
  // Notifications
  createNotification(data: { userId: number; type: string; title: string; message: string; link?: string }): Promise<Notification>;
  getNotifications(userId: number, limit?: number): Promise<Notification[]>;
  getUnreadNotificationCount(userId: number): Promise<number>;
  markNotificationRead(id: number): Promise<void>;
  markAllNotificationsRead(userId: number): Promise<void>;
  // Marketplace Listings
  createListing(data: Omit<MarketplaceListing, "id" | "installCount" | "ratingAvg" | "ratingCount" | "createdAt" | "updatedAt">): Promise<MarketplaceListing>;
  getListing(id: string): Promise<MarketplaceListing | undefined>;
  updateListing(id: string, data: Partial<MarketplaceListing>): Promise<MarketplaceListing | undefined>;
  deleteListing(id: string): Promise<void>;
  getListings(opts: { category?: string; search?: string; minRating?: number; priceType?: string; sellerId?: number; isPublished?: number; sortBy?: string; limit?: number; offset?: number }): Promise<MarketplaceListing[]>;
  getListingsBySeller(sellerId: number): Promise<MarketplaceListing[]>;
  getFeaturedListings(limit: number): Promise<MarketplaceListing[]>;
  getTrendingListings(limit: number): Promise<MarketplaceListing[]>;
  incrementInstallCount(listingId: string): Promise<void>;
  getCategoryCounts(): Promise<{ category: string; count: number }[]>;
  // Marketplace Purchases
  createPurchase(data: Omit<MarketplacePurchase, "id" | "createdAt">): Promise<MarketplacePurchase>;
  getPurchasesByBuyer(buyerId: number): Promise<MarketplacePurchase[]>;
  getPurchasesBySeller(sellerId: number): Promise<MarketplacePurchase[]>;
  hasPurchased(buyerId: number, listingId: string): Promise<boolean>;
  // Marketplace Reviews
  createReview(data: Omit<MarketplaceReview, "id" | "createdAt">): Promise<MarketplaceReview>;
  getReviewsByListing(listingId: string, limit?: number, offset?: number): Promise<MarketplaceReview[]>;
  getReviewByBuyerAndListing(buyerId: number, listingId: string): Promise<MarketplaceReview | undefined>;
  // Custom Tools
  createTool(data: { ownerId: number; name: string; description: string; toolType?: string; endpoint?: string; method?: string; headers?: string; authType?: string; authConfig?: string; inputSchema?: string; outputSchema?: string }): Promise<CustomTool>;
  getTool(id: string): Promise<CustomTool | undefined>;
  getToolsByOwner(ownerId: number): Promise<CustomTool[]>;
  updateTool(id: string, data: Partial<CustomTool>): Promise<CustomTool | undefined>;
  deleteTool(id: string): Promise<void>;
  incrementToolUsage(id: string): Promise<void>;
  // User Preferences
  getUserPreferences(userId: number): Promise<UserPreferences>;
  updateUserPreferences(userId: number, data: Partial<UserPreferences>): Promise<UserPreferences>;
  // Trades
  createTrade(data: { userId: number; symbol: string; direction: string; entryPrice: number; exitPrice?: number | null; quantity: number; entryTime: string; exitTime?: string | null; fees?: number; strategyTag?: string | null; notes?: string | null; screenshotUrl?: string | null; importSource?: string }): Promise<Trade>;
  getTrade(id: string): Promise<Trade | undefined>;
  getTradesByUser(userId: number, opts?: { symbol?: string; direction?: string; startDate?: string; endDate?: string; limit?: number; offset?: number }): Promise<Trade[]>;
  updateTrade(id: string, data: Partial<Omit<Trade, 'id' | 'userId' | 'createdAt'>>): Promise<Trade | undefined>;
  deleteTrade(id: string): Promise<void>;
  closeTrade(id: string, exitPrice: number, exitTime: string, fees?: number): Promise<Trade | undefined>;
  getTradingStats(userId: number): Promise<TradingStats>;
  getEquityCurve(userId: number): Promise<{ date: string; cumulativePnl: number }[]>;
  getMonthlyPnl(userId: number): Promise<{ month: string; pnl: number }[]>;
  getPnlBySymbol(userId: number): Promise<{ symbol: string; pnl: number; tradeCount: number }[]>;
  getPnlByDayOfWeek(userId: number): Promise<{ day: string; pnl: number; tradeCount: number }[]>;
  // Broker Connections
  createBrokerConnection(data: { userId: number; broker: string; label?: string | null; apiKey?: string | null; apiSecret?: string | null; isPaper?: number; accountId?: string | null; accountInfo?: string | null }): Promise<BrokerConnection>;
  getBrokerConnections(userId: number): Promise<BrokerConnection[]>;
  getBrokerConnection(id: string): Promise<BrokerConnection | undefined>;
  updateBrokerConnection(id: string, data: Partial<Omit<BrokerConnection, 'id' | 'userId' | 'createdAt'>>): Promise<BrokerConnection | undefined>;
  deleteBrokerConnection(id: string): Promise<void>;
  // User API Keys
  getUserApiKeys(userId: number): Promise<UserApiKey[]>;
  getUserApiKey(id: string): Promise<UserApiKey | undefined>;
  createUserApiKey(data: { userId: number; provider: string; apiKey?: string; endpointUrl?: string; defaultModel?: string; isDefault?: number }): Promise<UserApiKey>;
  updateUserApiKey(id: string, data: Partial<Omit<UserApiKey, 'id' | 'userId' | 'createdAt'>>): Promise<UserApiKey | undefined>;
  deleteUserApiKey(id: string): Promise<void>;
  getDefaultApiKey(userId: number): Promise<UserApiKey | undefined>;
  // Account Stacks
  getAccountStacks(userId: number): Promise<AccountStack[]>;
  getAccountStack(id: string): Promise<AccountStack | undefined>;
  createAccountStack(data: { userId: number; name: string; leaderConnectionId: string; copyMode?: string; sizeMultiplier?: number }): Promise<AccountStack>;
  deleteAccountStack(id: string): Promise<void>;
  getStackFollowers(stackId: string): Promise<AccountStackFollower[]>;
  addStackFollower(data: { stackId: string; connectionId: string; sizeMultiplier?: number }): Promise<AccountStackFollower>;
  removeStackFollower(id: string): Promise<void>;
  // Trading Bots
  getTradingBots(userId: number): Promise<TradingBot[]>;
  getTradingBot(id: string): Promise<TradingBot | undefined>;
  createTradingBot(data: { userId: number; name: string; description?: string; strategyType?: string; model?: string; systemPrompt?: string; indicators?: string; entryRules?: string; exitRules?: string; riskRules?: string; timeframe?: string; symbols?: string; status?: string }): Promise<TradingBot>;
  updateTradingBot(id: string, data: Partial<TradingBot>): Promise<TradingBot | undefined>;
  deleteTradingBot(id: string): Promise<void>;
  // Bot Deployments
  getBotDeployments(userId: number): Promise<BotDeployment[]>;
  getBotDeployment(id: string): Promise<BotDeployment | undefined>;
  createBotDeployment(data: { userId: number; botId: string; connectionId: string; maxPositionSize?: number; maxDailyLoss?: number; maxTradesPerDay?: number }): Promise<BotDeployment>;
  updateBotDeployment(id: string, data: Partial<BotDeployment>): Promise<BotDeployment | undefined>;
  deleteBotDeployment(id: string): Promise<void>;
  // Fiverr Gigs
  getFiverrGigs(userId: number): Promise<FiverrGig[]>;
  getFiverrGig(id: string): Promise<FiverrGig | undefined>;
  createFiverrGig(data: { userId: number; title: string; category?: string; description?: string; priceTiers?: string; autoResponse?: string; aiModel?: string }): Promise<FiverrGig>;
  updateFiverrGig(id: string, data: Partial<FiverrGig>): Promise<FiverrGig | undefined>;
  deleteFiverrGig(id: string): Promise<void>;
  // Fiverr Orders
  getFiverrOrders(userId: number): Promise<FiverrOrder[]>;
  getFiverrOrder(id: string): Promise<FiverrOrder | undefined>;
  createFiverrOrder(data: { gigId: string; userId: number; buyerName?: string; requirements?: string; amount?: number }): Promise<FiverrOrder>;
  updateFiverrOrder(id: string, data: Partial<FiverrOrder>): Promise<FiverrOrder | undefined>;
  // Generated Apps
  getGeneratedApps(userId: number): Promise<GeneratedApp[]>;
  getGeneratedApp(id: string): Promise<GeneratedApp | undefined>;
  createGeneratedApp(data: { userId: number; name: string; description?: string; appType?: string; framework?: string }): Promise<GeneratedApp>;
  updateGeneratedApp(id: string, data: Partial<GeneratedApp>): Promise<GeneratedApp | undefined>;
  deleteGeneratedApp(id: string): Promise<void>;
  // White Label Configs
  getWhiteLabelConfigs(userId: number): Promise<WhiteLabelConfig[]>;
  getWhiteLabelConfig(id: string): Promise<WhiteLabelConfig | undefined>;
  createWhiteLabelConfig(data: { userId: number; brandName: string; logoUrl?: string; primaryColor?: string; secondaryColor?: string; customDomain?: string; features?: string; maxUsers?: number }): Promise<WhiteLabelConfig>;
  updateWhiteLabelConfig(id: string, data: Partial<WhiteLabelConfig>): Promise<WhiteLabelConfig | undefined>;
  deleteWhiteLabelConfig(id: string): Promise<void>;
  // Prop Accounts
  getPropAccounts(userId: number): Promise<PropAccount[]>;
  getPropAccount(id: string): Promise<PropAccount | undefined>;
  createPropAccount(data: { userId: number; firm: string; accountNumber?: string; accountSize?: number; phase?: string; profitTarget?: number; maxDrawdown?: number; dailyDrawdown?: number; currentBalance?: number; credentials?: string }): Promise<PropAccount>;
  updatePropAccount(id: string, data: Partial<PropAccount>): Promise<PropAccount | undefined>;
  deletePropAccount(id: string): Promise<void>;
  // Agent Configs
  getAgentConfig(userId: number, agentType: string): Promise<AgentConfig | undefined>;
  getAgentConfigs(userId: number): Promise<AgentConfig[]>;
  upsertAgentConfig(config: InsertAgentConfig): Promise<AgentConfig>;
  // Workflow Executions
  createWorkflowExecution(exec: InsertWorkflowExecution): Promise<WorkflowExecution>;
  getWorkflowExecution(id: string): Promise<WorkflowExecution | undefined>;
  getWorkflowExecutions(workflowId: number): Promise<WorkflowExecution[]>;
  updateWorkflowExecution(id: string, data: Partial<WorkflowExecution>): Promise<WorkflowExecution | undefined>;
  // Workflow Node Results
  createWorkflowNodeResult(result: InsertWorkflowNodeResult): Promise<WorkflowNodeResult>;
  getWorkflowNodeResults(executionId: string): Promise<WorkflowNodeResult[]>;
  updateWorkflowNodeResult(id: string, data: Partial<WorkflowNodeResult>): Promise<WorkflowNodeResult | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number) {
    return db.select().from(users).where(eq(users.id, id)).get();
  }
  async getUserByUsername(username: string) {
    return db.select().from(users).where(eq(users.username, username)).get();
  }
  async createUser(insertUser: InsertUser) {
    return db.insert(users).values(insertUser).returning().get();
  }

  // Workflows
  async getWorkflows() {
    return db.select().from(workflows).orderBy(desc(workflows.id)).all();
  }
  async getWorkflow(id: number) {
    return db.select().from(workflows).where(eq(workflows.id, id)).get();
  }
  async createWorkflow(w: InsertWorkflow) {
    return db.insert(workflows).values({ ...w, createdAt: new Date().toISOString() }).returning().get();
  }
  async updateWorkflow(id: number, data: Partial<InsertWorkflow>) {
    return db.update(workflows).set(data).where(eq(workflows.id, id)).returning().get();
  }
  async deleteWorkflow(id: number) {
    db.delete(workflows).where(eq(workflows.id, id)).run();
  }

  // Agents
  async getAgents() {
    return db.select().from(agents).orderBy(desc(agents.id)).all();
  }
  async getAgent(id: number) {
    return db.select().from(agents).where(eq(agents.id, id)).get();
  }
  async getAgentsByWorkflow(workflowId: number) {
    return db.select().from(agents).where(eq(agents.workflowId, workflowId)).all();
  }
  async createAgent(a: InsertAgent) {
    return db.insert(agents).values({ ...a, createdAt: new Date().toISOString() }).returning().get();
  }
  async updateAgent(id: number, data: Partial<InsertAgent>) {
    return db.update(agents).set(data).where(eq(agents.id, id)).returning().get();
  }
  async deleteAgent(id: number) {
    db.delete(agents).where(eq(agents.id, id)).run();
  }

  // Jobs
  async getJobs() {
    return db.select().from(jobs).orderBy(desc(jobs.id)).all();
  }
  async getJobsByWorkflow(workflowId: number) {
    return db.select().from(jobs).where(eq(jobs.workflowId, workflowId)).all();
  }
  async createJob(j: InsertJob) {
    return db.insert(jobs).values({ ...j, createdAt: new Date().toISOString() }).returning().get();
  }
  async updateJob(id: number, data: Partial<InsertJob>) {
    return db.update(jobs).set(data).where(eq(jobs.id, id)).returning().get();
  }

  // Messages
  async getMessagesByAgent(agentId: number) {
    return db.select().from(messages).where(eq(messages.agentId, agentId)).all();
  }
  async createMessage(m: InsertMessage) {
    return db.insert(messages).values({ ...m, createdAt: new Date().toISOString() }).returning().get();
  }

  // Audit reviews
  async getAuditReviews() {
    return db.select().from(auditReviews).orderBy(desc(auditReviews.id)).all();
  }
  async getAuditReviewsByJob(jobId: number) {
    return db.select().from(auditReviews).where(eq(auditReviews.jobId, jobId)).all();
  }
  async createAuditReview(r: InsertAuditReview) {
    return db.insert(auditReviews).values({ ...r, createdAt: new Date().toISOString() }).returning().get();
  }

  // Escalations
  async getEscalations() {
    return db.select().from(escalations).orderBy(desc(escalations.id)).all();
  }
  async getEscalationsByJob(jobId: number) {
    return db.select().from(escalations).where(eq(escalations.jobId, jobId)).all();
  }
  async createEscalation(e: InsertEscalation) {
    return db.insert(escalations).values({ ...e, createdAt: new Date().toISOString() }).returning().get();
  }
  async updateEscalation(id: number, data: Partial<InsertEscalation>) {
    return db.update(escalations).set(data).where(eq(escalations.id, id)).returning().get();
  }

  // Trade Journal
  async getTradeJournalEntries() {
    return db.select().from(tradeJournal).orderBy(desc(tradeJournal.id)).all();
  }
  async createTradeJournalEntry(e: InsertTradeJournal) {
    return db.insert(tradeJournal).values({ ...e, createdAt: new Date().toISOString() }).returning().get();
  }
  async updateTradeJournalEntry(id: number, data: Partial<InsertTradeJournal>) {
    return db.update(tradeJournal).set(data).where(eq(tradeJournal.id, id)).returning().get();
  }

  // Bot Challenges
  async getBotChallenges() {
    return db.select().from(botChallenges).orderBy(desc(botChallenges.id)).all();
  }
  async createBotChallenge(c: InsertBotChallenge) {
    return db.insert(botChallenges).values({ ...c, createdAt: new Date().toISOString() }).returning().get();
  }
  async updateBotChallenge(id: number, data: Partial<InsertBotChallenge>) {
    return db.update(botChallenges).set(data).where(eq(botChallenges.id, id)).returning().get();
  }

  // Token Usage
  async recordTokenUsage(usage: InsertTokenUsage): Promise<TokenUsageRecord> {
    return db.insert(tokenUsage).values({ ...usage, createdAt: new Date().toISOString() }).returning().get();
  }
  async getTokenUsageByUser(userId: number): Promise<TokenUsageRecord[]> {
    return db.select().from(tokenUsage).where(eq(tokenUsage.userId, userId)).orderBy(desc(tokenUsage.id)).all();
  }
  async getTokenUsageSummary(userId: number, since: string): Promise<{ total: number; byModel: Record<string, number> }> {
    const rows = await db.select().from(tokenUsage)
      .where(eq(tokenUsage.userId, userId))
      .all();
    // Filter by since date in JS
    const filtered = rows.filter(r => r.createdAt >= since);
    const total = filtered.reduce((sum, r) => sum + r.totalTokens, 0);
    const byModel: Record<string, number> = {};
    for (const r of filtered) {
      byModel[r.model] = (byModel[r.model] || 0) + r.totalTokens;
    }
    return { total, byModel };
  }

  // Token Packs
  async getTokenPacksByUser(userId: number): Promise<TokenPack[]> {
    return db.select().from(tokenPacks).where(eq(tokenPacks.userId, userId)).orderBy(desc(tokenPacks.id)).all();
  }
  async createTokenPack(pack: InsertTokenPack): Promise<TokenPack> {
    return db.insert(tokenPacks).values({ ...pack, createdAt: new Date().toISOString() }).returning().get();
  }
  async updateTokenPack(id: number, data: Partial<InsertTokenPack>): Promise<TokenPack | undefined> {
    return db.update(tokenPacks).set(data).where(eq(tokenPacks.id, id)).returning().get();
  }

  // User Plans
  async getUserPlan(userId: number): Promise<UserPlan | undefined> {
    return db.select().from(userPlans).where(eq(userPlans.userId, userId)).orderBy(desc(userPlans.id)).get();
  }
  async createUserPlan(plan: InsertUserPlan): Promise<UserPlan> {
    return db.insert(userPlans).values({ ...plan, createdAt: new Date().toISOString() }).returning().get();
  }
  async updateUserPlan(id: number, data: Partial<InsertUserPlan>): Promise<UserPlan | undefined> {
    return db.update(userPlans).set(data).where(eq(userPlans.id, id)).returning().get();
  }

  // Update User
  async updateUser(id: number, data: Partial<{ tier: string; stripeCustomerId: string; subscriptionId: string; role: string; avatarUrl: string; displayName: string; lastLoginAt: string; passwordHash: string; authProvider: string; providerId: string; emailVerified: number; githubToken: string; githubUsername: string }>): Promise<User | undefined> {
    return db.update(users).set(data).where(eq(users.id, id)).returning().get();
  }

  async getGitHubToken(userId: number): Promise<string | null> {
    const row = sqlite.prepare('SELECT github_token FROM users WHERE id = ?').get(userId) as any;
    return row?.github_token || null;
  }

  async getGitHubUsername(userId: number): Promise<string | null> {
    const row = sqlite.prepare('SELECT github_username FROM users WHERE id = ?').get(userId) as any;
    return row?.github_username || null;
  }

  async setGitHubToken(userId: number, token: string, username: string): Promise<void> {
    sqlite.prepare('UPDATE users SET github_token = ?, github_username = ? WHERE id = ?').run(token, username, userId);
  }

  // Workflow Runs
  async getWorkflowRuns(workflowId: number) {
    return db.select().from(workflowRuns).where(eq(workflowRuns.workflowId, workflowId)).orderBy(desc(workflowRuns.id)).all();
  }
  async getWorkflowRun(id: number) {
    return db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).get();
  }
  async createWorkflowRun(run: InsertWorkflowRun) {
    return db.insert(workflowRuns).values({ ...run, createdAt: new Date().toISOString() }).returning().get();
  }
  async updateWorkflowRun(id: number, data: Partial<InsertWorkflowRun>) {
    return db.update(workflowRuns).set(data).where(eq(workflowRuns.id, id)).returning().get();
  }

  // Agent Executions
  async getAgentExecutions(runId: number) {
    return db.select().from(agentExecutions).where(eq(agentExecutions.runId, runId)).orderBy(desc(agentExecutions.id)).all();
  }
  async createAgentExecution(exec: InsertAgentExecution) {
    return db.insert(agentExecutions).values({ ...exec, createdAt: new Date().toISOString() }).returning().get();
  }
  async updateAgentExecution(id: number, data: Partial<InsertAgentExecution>) {
    return db.update(agentExecutions).set(data).where(eq(agentExecutions.id, id)).returning().get();
  }

  // Workflow Versions
  async getWorkflowVersions(workflowId: number) {
    return db.select().from(workflowVersions).where(eq(workflowVersions.workflowId, workflowId)).orderBy(desc(workflowVersions.versionNumber)).all();
  }
  async createWorkflowVersion(v: InsertWorkflowVersion) {
    return db.insert(workflowVersions).values({ ...v, createdAt: new Date().toISOString() }).returning().get();
  }
  async getWorkflowVersion(id: number) {
    return db.select().from(workflowVersions).where(eq(workflowVersions.id, id)).get();
  }

  // Templates
  async getPublicTemplates() {
    return db.select().from(workflows).where(eq(workflows.isPublic, 1)).all();
  }

  // Auth: Sessions
  async createSession(session: { id: string; userId: number; expiresAt: string }) {
    return db.insert(sessions).values({ ...session, createdAt: new Date().toISOString() }).returning().get();
  }
  async getSession(id: string) {
    return db.select().from(sessions).where(eq(sessions.id, id)).get();
  }
  async deleteSession(id: string) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
  }
  async deleteExpiredSessions() {
    const now = new Date().toISOString();
    sqlite.exec(`DELETE FROM sessions WHERE expires_at < '${now}'`);
  }

  // Auth: Users (extended)
  async getUserByEmail(email: string) {
    return db.select().from(users).where(eq(users.email, email)).get();
  }
  async getUserByProviderId(provider: string, providerId: string) {
    return db.select().from(users).where(
      and(eq(users.authProvider, provider), eq(users.providerId, providerId))
    ).get();
  }
  async getAllUsers() {
    return db.select().from(users).orderBy(desc(users.id)).all();
  }

  // Owner Intelligence
  async recordIntelligence(data: { userId: number; userEmail?: string; eventType: string; model?: string; inputData?: string; outputData?: string; tokensUsed?: number; quality?: string; tags?: string; metadata?: string }) {
    return db.insert(ownerIntelligence).values({ ...data, createdAt: new Date().toISOString() } as any).returning().get();
  }
  async getIntelligence(opts: { limit?: number; offset?: number; eventType?: string; userId?: number; quality?: string }) {
    // Use raw SQL for flexible filtering
    const conditions: string[] = [];
    if (opts.eventType) conditions.push(`event_type = '${opts.eventType}'`);
    if (opts.userId) conditions.push(`user_id = ${opts.userId}`);
    if (opts.quality) conditions.push(`quality = '${opts.quality}'`);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts.limit || 50;
    const offset = opts.offset || 0;
    const rows = sqlite.prepare(`SELECT * FROM owner_intelligence ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(limit, offset);
    return rows as OwnerIntelligence[];
  }
  async getIntelligenceCount() {
    const row = sqlite.prepare('SELECT COUNT(*) as count FROM owner_intelligence').get() as any;
    return row?.count || 0;
  }
  async updateIntelligenceQuality(id: number, quality: string) {
    sqlite.prepare('UPDATE owner_intelligence SET quality = ? WHERE id = ?').run(quality, id);
  }

  // Email Verification
  async createEmailVerification(userId: number, token: string, expiresAt: string) {
    return db.insert(emailVerifications).values({ userId, token, expiresAt, createdAt: new Date().toISOString() }).returning().get();
  }
  async getEmailVerification(token: string) {
    return db.select().from(emailVerifications).where(eq(emailVerifications.token, token)).get();
  }
  async markEmailVerified(token: string) {
    const v = await this.getEmailVerification(token);
    if (v) {
      sqlite.prepare('UPDATE email_verifications SET verified = 1 WHERE token = ?').run(token);
      sqlite.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(v.userId);
    }
  }

  // Notifications
  async createNotification(data: { userId: number; type: string; title: string; message: string; link?: string }) {
    return db.insert(notifications).values({ ...data, createdAt: new Date().toISOString() } as any).returning().get();
  }
  async getNotifications(userId: number, limit = 50) {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.id)).limit(limit).all();
  }
  async getUnreadNotificationCount(userId: number) {
    const row = sqlite.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0').get(userId) as any;
    return row?.count || 0;
  }
  async markNotificationRead(id: number) {
    sqlite.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
  }
  async markAllNotificationsRead(userId: number) {
    sqlite.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(userId);
  }

  // ── Marketplace Listings ─────────────────────────────────────────────────
  async createListing(data: Omit<MarketplaceListing, "id" | "installCount" | "ratingAvg" | "ratingCount" | "createdAt" | "updatedAt">): Promise<MarketplaceListing> {
    const { v4: uuidv4 } = await import("uuid");
    const id = uuidv4();
    const now = new Date().toISOString();
    sqlite.prepare(`
      INSERT INTO marketplace_listings
        (id, seller_id, title, description, short_description, category, listing_type, price_usd, price_type, content_ref, version, is_published, is_verified, install_count, rating_avg, rating_count, preview_images, tags, created_at, updated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?)
    `).run(
      id, data.sellerId, data.title, data.description, data.shortDescription ?? null,
      data.category, data.listingType, data.priceUsd, data.priceType,
      data.contentRef ?? null, data.version, data.isPublished ?? 0, data.isVerified ?? 0,
      data.previewImages ?? null, data.tags ?? null, now, now
    );
    return this.getListing(id) as Promise<MarketplaceListing>;
  }

  async getListing(id: string): Promise<MarketplaceListing | undefined> {
    const row = sqlite.prepare('SELECT * FROM marketplace_listings WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this._mapListing(row);
  }

  async updateListing(id: string, data: Partial<MarketplaceListing>): Promise<MarketplaceListing | undefined> {
    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const values: any[] = [now];
    const colMap: Record<string, string> = {
      title: 'title', description: 'description', shortDescription: 'short_description',
      category: 'category', listingType: 'listing_type', priceUsd: 'price_usd',
      priceType: 'price_type', contentRef: 'content_ref', version: 'version',
      isPublished: 'is_published', isVerified: 'is_verified', previewImages: 'preview_images',
      tags: 'tags',
    };
    for (const [key, col] of Object.entries(colMap)) {
      if (key in data) {
        fields.push(`${col} = ?`);
        values.push((data as any)[key]);
      }
    }
    values.push(id);
    sqlite.prepare(`UPDATE marketplace_listings SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getListing(id);
  }

  async deleteListing(id: string): Promise<void> {
    sqlite.prepare('DELETE FROM marketplace_listings WHERE id = ?').run(id);
  }

  async getListings(opts: { category?: string; search?: string; minRating?: number; priceType?: string; sellerId?: number; isPublished?: number; sortBy?: string; limit?: number; offset?: number }): Promise<MarketplaceListing[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    if (opts.category) { conditions.push('category = ?'); params.push(opts.category); }
    if (opts.priceType) { conditions.push('price_type = ?'); params.push(opts.priceType); }
    if (opts.sellerId !== undefined) { conditions.push('seller_id = ?'); params.push(opts.sellerId); }
    if (opts.isPublished !== undefined) { conditions.push('is_published = ?'); params.push(opts.isPublished); }
    if (opts.minRating !== undefined) { conditions.push('rating_avg >= ?'); params.push(opts.minRating); }
    if (opts.search) {
      conditions.push('(title LIKE ? OR description LIKE ? OR short_description LIKE ?)');
      const q = `%${opts.search}%`;
      params.push(q, q, q);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    let orderBy = 'ORDER BY install_count DESC, rating_avg DESC';
    if (opts.sortBy === 'newest') orderBy = 'ORDER BY created_at DESC';
    else if (opts.sortBy === 'rating') orderBy = 'ORDER BY rating_avg DESC, rating_count DESC';
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    params.push(limit, offset);
    const rows = sqlite.prepare(`SELECT * FROM marketplace_listings ${where} ${orderBy} LIMIT ? OFFSET ?`).all(...params) as any[];
    return rows.map(r => this._mapListing(r));
  }

  async getListingsBySeller(sellerId: number): Promise<MarketplaceListing[]> {
    const rows = sqlite.prepare('SELECT * FROM marketplace_listings WHERE seller_id = ? ORDER BY created_at DESC').all(sellerId) as any[];
    return rows.map(r => this._mapListing(r));
  }

  async getFeaturedListings(limit: number): Promise<MarketplaceListing[]> {
    const rows = sqlite.prepare(
      'SELECT * FROM marketplace_listings WHERE is_published = 1 ORDER BY rating_avg DESC, install_count DESC LIMIT ?'
    ).all(limit) as any[];
    return rows.map(r => this._mapListing(r));
  }

  async getTrendingListings(limit: number): Promise<MarketplaceListing[]> {
    // Proxy for trending: most installs overall among published listings (no created_at on purchases for efficient 7-day filter without joins here)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rows = sqlite.prepare(`
      SELECT ml.* FROM marketplace_listings ml
      INNER JOIN marketplace_purchases mp ON mp.listing_id = ml.id
      WHERE ml.is_published = 1 AND mp.created_at >= ?
      GROUP BY ml.id
      ORDER BY COUNT(mp.id) DESC, ml.install_count DESC
      LIMIT ?
    `).all(sevenDaysAgo, limit) as any[];
    // Fallback to most installed if no recent purchases
    if (rows.length === 0) {
      const fallback = sqlite.prepare(
        'SELECT * FROM marketplace_listings WHERE is_published = 1 ORDER BY install_count DESC LIMIT ?'
      ).all(limit) as any[];
      return fallback.map(r => this._mapListing(r));
    }
    return rows.map(r => this._mapListing(r));
  }

  async incrementInstallCount(listingId: string): Promise<void> {
    sqlite.prepare('UPDATE marketplace_listings SET install_count = install_count + 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), listingId);
  }

  async getCategoryCounts(): Promise<{ category: string; count: number }[]> {
    const rows = sqlite.prepare(
      'SELECT category, COUNT(*) as count FROM marketplace_listings WHERE is_published = 1 GROUP BY category'
    ).all() as any[];
    return rows.map(r => ({ category: r.category, count: r.count }));
  }

  private _mapListing(row: any): MarketplaceListing {
    return {
      id: row.id,
      sellerId: row.seller_id,
      title: row.title,
      description: row.description,
      shortDescription: row.short_description,
      category: row.category,
      listingType: row.listing_type,
      priceUsd: row.price_usd,
      priceType: row.price_type,
      contentRef: row.content_ref,
      version: row.version,
      isPublished: row.is_published,
      isVerified: row.is_verified,
      installCount: row.install_count,
      ratingAvg: row.rating_avg,
      ratingCount: row.rating_count,
      previewImages: row.preview_images,
      tags: row.tags,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ── Marketplace Purchases ─────────────────────────────────────────────────
  async createPurchase(data: Omit<MarketplacePurchase, "id" | "createdAt">): Promise<MarketplacePurchase> {
    const { v4: uuidv4 } = await import("uuid");
    const id = uuidv4();
    const now = new Date().toISOString();
    sqlite.prepare(`
      INSERT INTO marketplace_purchases
        (id, listing_id, buyer_id, seller_id, amount_usd, platform_fee_usd, seller_payout_usd, stripe_payment_id, stripe_transfer_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.listingId, data.buyerId, data.sellerId,
      data.amountUsd, data.platformFeeUsd, data.sellerPayoutUsd,
      data.stripePaymentId ?? null, data.stripeTransferId ?? null, now
    );
    return { id, ...data, createdAt: now };
  }

  async getPurchasesByBuyer(buyerId: number): Promise<MarketplacePurchase[]> {
    const rows = sqlite.prepare('SELECT * FROM marketplace_purchases WHERE buyer_id = ? ORDER BY created_at DESC').all(buyerId) as any[];
    return rows.map(r => this._mapPurchase(r));
  }

  async getPurchasesBySeller(sellerId: number): Promise<MarketplacePurchase[]> {
    const rows = sqlite.prepare('SELECT * FROM marketplace_purchases WHERE seller_id = ? ORDER BY created_at DESC').all(sellerId) as any[];
    return rows.map(r => this._mapPurchase(r));
  }

  async hasPurchased(buyerId: number, listingId: string): Promise<boolean> {
    const row = sqlite.prepare('SELECT id FROM marketplace_purchases WHERE buyer_id = ? AND listing_id = ? LIMIT 1').get(buyerId, listingId);
    return !!row;
  }

  private _mapPurchase(row: any): MarketplacePurchase {
    return {
      id: row.id,
      listingId: row.listing_id,
      buyerId: row.buyer_id,
      sellerId: row.seller_id,
      amountUsd: row.amount_usd,
      platformFeeUsd: row.platform_fee_usd,
      sellerPayoutUsd: row.seller_payout_usd,
      stripePaymentId: row.stripe_payment_id,
      stripeTransferId: row.stripe_transfer_id,
      createdAt: row.created_at,
    };
  }

  // ── Marketplace Reviews ───────────────────────────────────────────────────
  async createReview(data: Omit<MarketplaceReview, "id" | "createdAt">): Promise<MarketplaceReview> {
    const { v4: uuidv4 } = await import("uuid");
    const id = uuidv4();
    const now = new Date().toISOString();
    sqlite.prepare(`
      INSERT INTO marketplace_reviews
        (id, listing_id, buyer_id, purchase_id, rating, review_text, is_verified_purchase, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.listingId, data.buyerId, data.purchaseId, data.rating, data.reviewText ?? null, data.isVerifiedPurchase ?? 1, now);
    // Recalculate listing rating
    const agg = sqlite.prepare('SELECT AVG(rating) as avg, COUNT(*) as cnt FROM marketplace_reviews WHERE listing_id = ?').get(data.listingId) as any;
    if (agg) {
      sqlite.prepare('UPDATE marketplace_listings SET rating_avg = ?, rating_count = ?, updated_at = ? WHERE id = ?')
        .run(Math.round((agg.avg || 0) * 100) / 100, agg.cnt, now, data.listingId);
    }
    return { id, ...data, createdAt: now };
  }

  async getReviewsByListing(listingId: string, limit = 20, offset = 0): Promise<MarketplaceReview[]> {
    const rows = sqlite.prepare('SELECT * FROM marketplace_reviews WHERE listing_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(listingId, limit, offset) as any[];
    return rows.map(r => this._mapReview(r));
  }

  async getReviewByBuyerAndListing(buyerId: number, listingId: string): Promise<MarketplaceReview | undefined> {
    const row = sqlite.prepare('SELECT * FROM marketplace_reviews WHERE buyer_id = ? AND listing_id = ? LIMIT 1').get(buyerId, listingId) as any;
    if (!row) return undefined;
    return this._mapReview(row);
  }

  private _mapReview(row: any): MarketplaceReview {
    return {
      id: row.id,
      listingId: row.listing_id,
      buyerId: row.buyer_id,
      purchaseId: row.purchase_id,
      rating: row.rating,
      reviewText: row.review_text,
      isVerifiedPurchase: row.is_verified_purchase,
      createdAt: row.created_at,
    };
  }

  // ── Custom Tools ──────────────────────────────────────────────────────────
  private _mapTool(row: any): CustomTool {
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      description: row.description,
      toolType: row.tool_type,
      endpoint: row.endpoint,
      method: row.method,
      headers: row.headers,
      authType: row.auth_type,
      authConfig: row.auth_config,
      inputSchema: row.input_schema,
      outputSchema: row.output_schema,
      isActive: row.is_active,
      usageCount: row.usage_count,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createTool(data: { ownerId: number; name: string; description: string; toolType?: string; endpoint?: string; method?: string; headers?: string; authType?: string; authConfig?: string; inputSchema?: string; outputSchema?: string }): Promise<CustomTool> {
    const { v4: uuidv4 } = await import("uuid");
    const id = uuidv4();
    const now = new Date().toISOString();
    sqlite.prepare(`
      INSERT INTO custom_tools
        (id, owner_id, name, description, tool_type, endpoint, method, headers, auth_type, auth_config, input_schema, output_schema, is_active, usage_count, last_used_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, ?, ?)
    `).run(
      id, data.ownerId, data.name, data.description,
      data.toolType ?? 'rest_api',
      data.endpoint ?? null, data.method ?? 'POST',
      data.headers ?? null, data.authType ?? 'none',
      data.authConfig ?? null, data.inputSchema ?? null,
      data.outputSchema ?? null, now, now
    );
    return this.getTool(id) as Promise<CustomTool>;
  }

  async getTool(id: string): Promise<CustomTool | undefined> {
    const row = sqlite.prepare('SELECT * FROM custom_tools WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this._mapTool(row);
  }

  async getToolsByOwner(ownerId: number): Promise<CustomTool[]> {
    const rows = sqlite.prepare('SELECT * FROM custom_tools WHERE owner_id = ? ORDER BY created_at DESC').all(ownerId) as any[];
    return rows.map(r => this._mapTool(r));
  }

  async updateTool(id: string, data: Partial<CustomTool>): Promise<CustomTool | undefined> {
    const now = new Date().toISOString();
    const colMap: Record<string, string> = {
      name: 'name', description: 'description', toolType: 'tool_type',
      endpoint: 'endpoint', method: 'method', headers: 'headers',
      authType: 'auth_type', authConfig: 'auth_config',
      inputSchema: 'input_schema', outputSchema: 'output_schema',
      isActive: 'is_active',
    };
    const fields: string[] = ['updated_at = ?'];
    const values: any[] = [now];
    for (const [key, col] of Object.entries(colMap)) {
      if (key in data) {
        fields.push(`${col} = ?`);
        values.push((data as any)[key]);
      }
    }
    values.push(id);
    sqlite.prepare(`UPDATE custom_tools SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getTool(id);
  }

  async deleteTool(id: string): Promise<void> {
    sqlite.prepare('DELETE FROM custom_tools WHERE id = ?').run(id);
  }

  async incrementToolUsage(id: string): Promise<void> {
    const now = new Date().toISOString();
    sqlite.prepare('UPDATE custom_tools SET usage_count = usage_count + 1, last_used_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
  }

  // ── User Preferences ──────────────────────────────────────────────────────
  private readonly defaultPrefs = {
    wallpaperUrl: null,
    wallpaperType: 'none',
    wallpaperTint: 0.4,
    accentColor: '#6366f1',
    glassBlur: 12,
    glassOpacity: 0.08,
    sidebarPosition: 'left',
    compactMode: 0,
  };

  async getUserPreferences(userId: number): Promise<UserPreferences> {
    const row = sqlite.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as any;
    if (!row) {
      // Return defaults (no row yet)
      return {
        id: 0,
        userId,
        ...this.defaultPrefs,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      id: row.id,
      userId: row.user_id,
      wallpaperUrl: row.wallpaper_url,
      wallpaperType: row.wallpaper_type,
      wallpaperTint: row.wallpaper_tint,
      accentColor: row.accent_color,
      glassBlur: row.glass_blur,
      glassOpacity: row.glass_opacity,
      sidebarPosition: row.sidebar_position,
      compactMode: row.compact_mode,
      tradingDisclaimerAck: row.trading_disclaimer_ack ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async updateUserPreferences(userId: number, data: Partial<UserPreferences>): Promise<UserPreferences> {
    const now = new Date().toISOString();
    const existing = sqlite.prepare('SELECT id FROM user_preferences WHERE user_id = ?').get(userId);
    if (!existing) {
      sqlite.prepare(`
        INSERT INTO user_preferences (user_id, wallpaper_url, wallpaper_type, wallpaper_tint, accent_color, glass_blur, glass_opacity, sidebar_position, compact_mode, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        data.wallpaperUrl ?? null,
        data.wallpaperType ?? 'none',
        data.wallpaperTint ?? 0.4,
        data.accentColor ?? '#6366f1',
        data.glassBlur ?? 12,
        data.glassOpacity ?? 0.08,
        data.sidebarPosition ?? 'left',
        data.compactMode ?? 0,
        now
      );
    } else {
      const fields: string[] = [];
      const values: any[] = [];
      if (data.wallpaperUrl !== undefined) { fields.push('wallpaper_url = ?'); values.push(data.wallpaperUrl); }
      if (data.wallpaperType !== undefined) { fields.push('wallpaper_type = ?'); values.push(data.wallpaperType); }
      if (data.wallpaperTint !== undefined) { fields.push('wallpaper_tint = ?'); values.push(data.wallpaperTint); }
      if (data.accentColor !== undefined) { fields.push('accent_color = ?'); values.push(data.accentColor); }
      if (data.glassBlur !== undefined) { fields.push('glass_blur = ?'); values.push(data.glassBlur); }
      if (data.glassOpacity !== undefined) { fields.push('glass_opacity = ?'); values.push(data.glassOpacity); }
      if (data.sidebarPosition !== undefined) { fields.push('sidebar_position = ?'); values.push(data.sidebarPosition); }
      if (data.compactMode !== undefined) { fields.push('compact_mode = ?'); values.push(data.compactMode); }
      if ((data as any).tradingDisclaimerAck !== undefined) { fields.push('trading_disclaimer_ack = ?'); values.push((data as any).tradingDisclaimerAck); }
      if (fields.length > 0) {
        fields.push('updated_at = ?');
        values.push(now);
        values.push(userId);
        sqlite.prepare(`UPDATE user_preferences SET ${fields.join(', ')} WHERE user_id = ?`).run(...values);
      }
    }
    return this.getUserPreferences(userId);
  }

  // ── Trades ────────────────────────────────────────────────────────────────────
  private _calcPnl(direction: string, entryPrice: number, exitPrice: number, quantity: number, fees: number) {
    const grossPnl = direction === 'long'
      ? (exitPrice - entryPrice) * quantity
      : (entryPrice - exitPrice) * quantity;
    const netPnl = grossPnl - fees;
    return { grossPnl, netPnl };
  }

  private _mapTrade(row: any): Trade {
    return {
      id: row.id,
      userId: row.user_id,
      symbol: row.symbol,
      direction: row.direction,
      entryPrice: row.entry_price,
      exitPrice: row.exit_price ?? null,
      quantity: row.quantity,
      entryTime: row.entry_time,
      exitTime: row.exit_time ?? null,
      grossPnl: row.gross_pnl ?? null,
      fees: row.fees ?? 0,
      netPnl: row.net_pnl ?? null,
      strategyTag: row.strategy_tag ?? null,
      notes: row.notes ?? null,
      screenshotUrl: row.screenshot_url ?? null,
      importSource: row.import_source ?? 'manual',
      createdAt: row.created_at,
    };
  }

  async createTrade(data: { userId: number; symbol: string; direction: string; entryPrice: number; exitPrice?: number | null; quantity: number; entryTime: string; exitTime?: string | null; fees?: number; strategyTag?: string | null; notes?: string | null; screenshotUrl?: string | null; importSource?: string }): Promise<Trade> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    const fees = data.fees ?? 0;
    let grossPnl: number | null = null;
    let netPnl: number | null = null;
    if (data.exitPrice != null) {
      const calc = this._calcPnl(data.direction, data.entryPrice, data.exitPrice, data.quantity, fees);
      grossPnl = calc.grossPnl;
      netPnl = calc.netPnl;
    }
    sqlite.prepare(`
      INSERT INTO trades (id, user_id, symbol, direction, entry_price, exit_price, quantity, entry_time, exit_time, gross_pnl, fees, net_pnl, strategy_tag, notes, screenshot_url, import_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.userId, data.symbol, data.direction,
      data.entryPrice, data.exitPrice ?? null, data.quantity,
      data.entryTime, data.exitTime ?? null,
      grossPnl, fees, netPnl,
      data.strategyTag ?? null, data.notes ?? null,
      data.screenshotUrl ?? null, data.importSource ?? 'manual'
    );
    return this.getTrade(id) as Promise<Trade>;
  }

  async getTrade(id: string): Promise<Trade | undefined> {
    const row = sqlite.prepare('SELECT * FROM trades WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this._mapTrade(row);
  }

  async getTradesByUser(userId: number, opts: { symbol?: string; direction?: string; startDate?: string; endDate?: string; limit?: number; offset?: number } = {}): Promise<Trade[]> {
    let query = 'SELECT * FROM trades WHERE user_id = ?';
    const params: any[] = [userId];
    if (opts.symbol) { query += ' AND symbol = ?'; params.push(opts.symbol); }
    if (opts.direction) { query += ' AND direction = ?'; params.push(opts.direction); }
    if (opts.startDate) { query += ' AND entry_time >= ?'; params.push(opts.startDate); }
    if (opts.endDate) { query += ' AND entry_time <= ?'; params.push(opts.endDate); }
    query += ' ORDER BY entry_time DESC';
    query += ` LIMIT ${opts.limit ?? 100} OFFSET ${opts.offset ?? 0}`;
    const rows = sqlite.prepare(query).all(...params) as any[];
    return rows.map(r => this._mapTrade(r));
  }

  async updateTrade(id: string, data: Partial<Omit<Trade, 'id' | 'userId' | 'createdAt'>>): Promise<Trade | undefined> {
    const existing = await this.getTrade(id);
    if (!existing) return undefined;
    const colMap: Record<string, string> = {
      symbol: 'symbol', direction: 'direction', entryPrice: 'entry_price',
      exitPrice: 'exit_price', quantity: 'quantity', entryTime: 'entry_time',
      exitTime: 'exit_time', grossPnl: 'gross_pnl', fees: 'fees',
      netPnl: 'net_pnl', strategyTag: 'strategy_tag', notes: 'notes',
      screenshotUrl: 'screenshot_url', importSource: 'import_source',
    };
    const merged = { ...existing, ...data };
    // Recalculate P&L if exit price is set
    if (merged.exitPrice != null) {
      const calc = this._calcPnl(merged.direction, merged.entryPrice, merged.exitPrice, merged.quantity, merged.fees ?? 0);
      merged.grossPnl = calc.grossPnl;
      merged.netPnl = calc.netPnl;
    }
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, col] of Object.entries(colMap)) {
      if (key in data || key === 'grossPnl' || key === 'netPnl') {
        fields.push(`${col} = ?`);
        values.push((merged as any)[key] ?? null);
      }
    }
    if (fields.length > 0) {
      values.push(id);
      sqlite.prepare(`UPDATE trades SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return this.getTrade(id);
  }

  async deleteTrade(id: string): Promise<void> {
    sqlite.prepare('DELETE FROM trades WHERE id = ?').run(id);
  }

  async closeTrade(id: string, exitPrice: number, exitTime: string, fees = 0): Promise<Trade | undefined> {
    const trade = await this.getTrade(id);
    if (!trade) return undefined;
    const totalFees = (trade.fees ?? 0) + fees;
    const { grossPnl, netPnl } = this._calcPnl(trade.direction, trade.entryPrice, exitPrice, trade.quantity, totalFees);
    sqlite.prepare(`
      UPDATE trades SET exit_price = ?, exit_time = ?, fees = ?, gross_pnl = ?, net_pnl = ? WHERE id = ?
    `).run(exitPrice, exitTime, totalFees, grossPnl, netPnl, id);
    return this.getTrade(id);
  }

  async getTradingStats(userId: number): Promise<TradingStats> {
    const trades = await this.getTradesByUser(userId, { limit: 10000 });
    const closed = trades.filter(t => t.netPnl !== null);
    const winning = closed.filter(t => (t.netPnl ?? 0) > 0);
    const losing = closed.filter(t => (t.netPnl ?? 0) < 0);
    const totalPnl = closed.reduce((s, t) => s + (t.grossPnl ?? 0), 0);
    const netPnl = closed.reduce((s, t) => s + (t.netPnl ?? 0), 0);
    const avgWin = winning.length > 0 ? winning.reduce((s, t) => s + (t.netPnl ?? 0), 0) / winning.length : 0;
    const avgLoss = losing.length > 0 ? Math.abs(losing.reduce((s, t) => s + (t.netPnl ?? 0), 0)) / losing.length : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * winning.length) / (avgLoss * losing.length) : winning.length > 0 ? Infinity : 0;
    const bestTrade = closed.length > 0 ? Math.max(...closed.map(t => t.netPnl ?? 0)) : 0;
    const worstTrade = closed.length > 0 ? Math.min(...closed.map(t => t.netPnl ?? 0)) : 0;
    // Avg R:R (only trades with both entry and exit)
    const rrTrades = closed.filter(t => t.netPnl !== null && (t.netPnl ?? 0) !== 0);
    const avgRR = rrTrades.length > 0 ? rrTrades.reduce((s, t) => s + ((t.netPnl ?? 0) > 0 ? (t.netPnl ?? 0) / avgLoss : 0), 0) / rrTrades.length : 0;
    // Streak calculation (sorted by entry_time asc)
    const sorted = [...closed].sort((a, b) => a.entryTime.localeCompare(b.entryTime));
    let currentWinStreak = 0, currentLossStreak = 0, bestWinStreak = 0, streak = 0, lStreak = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const pnl = sorted[i].netPnl ?? 0;
      if (i === sorted.length - 1) {
        if (pnl > 0) { currentWinStreak = 1; } else if (pnl < 0) { currentLossStreak = 1; }
      } else {
        const prev = sorted[i + 1].netPnl ?? 0;
        if (pnl > 0 && prev > 0) currentWinStreak++;
        else if (pnl < 0 && prev < 0) currentLossStreak++;
        else break;
      }
    }
    // Best win streak (pass through all)
    streak = 0;
    for (const t of sorted) {
      if ((t.netPnl ?? 0) > 0) { streak++; if (streak > bestWinStreak) bestWinStreak = streak; }
      else streak = 0;
    }
    return {
      totalTrades: trades.length,
      winningTrades: winning.length,
      losingTrades: losing.length,
      winRate: closed.length > 0 ? (winning.length / closed.length) * 100 : 0,
      avgWin,
      avgLoss,
      profitFactor: isFinite(profitFactor) ? profitFactor : 999,
      grossPnl: totalPnl,
      netPnl,
      bestTrade,
      worstTrade,
      avgRR,
      currentWinStreak,
      currentLossStreak,
      bestWinStreak,
    };
  }

  async getEquityCurve(userId: number): Promise<{ date: string; cumulativePnl: number }[]> {
    const rows = sqlite.prepare(`
      SELECT date(entry_time) as date, SUM(net_pnl) as daily_pnl
      FROM trades
      WHERE user_id = ? AND net_pnl IS NOT NULL
      GROUP BY date(entry_time)
      ORDER BY date(entry_time) ASC
    `).all(userId) as any[];
    let cumulative = 0;
    return rows.map(r => {
      cumulative += r.daily_pnl ?? 0;
      return { date: r.date, cumulativePnl: Math.round(cumulative * 100) / 100 };
    });
  }

  async getMonthlyPnl(userId: number): Promise<{ month: string; pnl: number }[]> {
    const rows = sqlite.prepare(`
      SELECT strftime('%Y-%m', entry_time) as month, SUM(net_pnl) as pnl
      FROM trades
      WHERE user_id = ? AND net_pnl IS NOT NULL
      GROUP BY strftime('%Y-%m', entry_time)
      ORDER BY month ASC
    `).all(userId) as any[];
    return rows.map(r => ({ month: r.month, pnl: Math.round((r.pnl ?? 0) * 100) / 100 }));
  }

  async getPnlBySymbol(userId: number): Promise<{ symbol: string; pnl: number; tradeCount: number }[]> {
    const rows = sqlite.prepare(`
      SELECT symbol, SUM(net_pnl) as pnl, COUNT(*) as trade_count
      FROM trades
      WHERE user_id = ? AND net_pnl IS NOT NULL
      GROUP BY symbol
      ORDER BY pnl DESC
    `).all(userId) as any[];
    return rows.map(r => ({ symbol: r.symbol, pnl: Math.round((r.pnl ?? 0) * 100) / 100, tradeCount: r.trade_count }));
  }

  async getPnlByDayOfWeek(userId: number): Promise<{ day: string; pnl: number; tradeCount: number }[]> {
    const rows = sqlite.prepare(`
      SELECT
        CASE cast(strftime('%w', entry_time) as integer)
          WHEN 0 THEN 'Sunday'
          WHEN 1 THEN 'Monday'
          WHEN 2 THEN 'Tuesday'
          WHEN 3 THEN 'Wednesday'
          WHEN 4 THEN 'Thursday'
          WHEN 5 THEN 'Friday'
          ELSE 'Saturday'
        END as day,
        SUM(net_pnl) as pnl,
        COUNT(*) as trade_count
      FROM trades
      WHERE user_id = ? AND net_pnl IS NOT NULL
      GROUP BY strftime('%w', entry_time)
      ORDER BY cast(strftime('%w', entry_time) as integer)
    `).all(userId) as any[];
    return rows.map(r => ({ day: r.day, pnl: Math.round((r.pnl ?? 0) * 100) / 100, tradeCount: r.trade_count }));
  }

  // ── Broker Connections ────────────────────────────────────────────────────
  private mapBrokerConnection(row: any): BrokerConnection {
    return {
      id: row.id,
      userId: row.user_id,
      broker: row.broker,
      label: row.label,
      apiKey: row.api_key,
      apiSecret: row.api_secret,
      isPaper: row.is_paper,
      isActive: row.is_active,
      lastSyncAt: row.last_sync_at,
      accountId: row.account_id,
      accountInfo: row.account_info,
      createdAt: row.created_at,
    };
  }

  async createBrokerConnection(data: {
    userId: number;
    broker: string;
    label?: string | null;
    apiKey?: string | null;
    apiSecret?: string | null;
    isPaper?: number;
    accountId?: string | null;
    accountInfo?: string | null;
  }): Promise<BrokerConnection> {
    const id = `bc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sqlite.prepare(`
      INSERT INTO broker_connections (id, user_id, broker, label, api_key, api_secret, is_paper, account_id, account_info)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.userId,
      data.broker,
      data.label ?? null,
      data.apiKey ?? null,
      data.apiSecret ?? null,
      data.isPaper ?? 1,
      data.accountId ?? null,
      data.accountInfo ?? null,
    );
    return this.getBrokerConnection(id) as Promise<BrokerConnection>;
  }

  async getBrokerConnections(userId: number): Promise<BrokerConnection[]> {
    const rows = sqlite.prepare(
      `SELECT * FROM broker_connections WHERE user_id = ? ORDER BY created_at DESC`
    ).all(userId) as any[];
    return rows.map(r => this.mapBrokerConnection(r));
  }

  async getBrokerConnection(id: string): Promise<BrokerConnection | undefined> {
    const row = sqlite.prepare(`SELECT * FROM broker_connections WHERE id = ?`).get(id) as any;
    if (!row) return undefined;
    return this.mapBrokerConnection(row);
  }

  async updateBrokerConnection(id: string, data: Partial<Omit<BrokerConnection, 'id' | 'userId' | 'createdAt'>>): Promise<BrokerConnection | undefined> {
    const existing = await this.getBrokerConnection(id);
    if (!existing) return undefined;
    const fields: string[] = [];
    const values: any[] = [];
    if (data.broker !== undefined) { fields.push('broker = ?'); values.push(data.broker); }
    if (data.label !== undefined) { fields.push('label = ?'); values.push(data.label); }
    if (data.apiKey !== undefined) { fields.push('api_key = ?'); values.push(data.apiKey); }
    if (data.apiSecret !== undefined) { fields.push('api_secret = ?'); values.push(data.apiSecret); }
    if (data.isPaper !== undefined) { fields.push('is_paper = ?'); values.push(data.isPaper); }
    if (data.isActive !== undefined) { fields.push('is_active = ?'); values.push(data.isActive); }
    if (data.lastSyncAt !== undefined) { fields.push('last_sync_at = ?'); values.push(data.lastSyncAt); }
    if (data.accountId !== undefined) { fields.push('account_id = ?'); values.push(data.accountId); }
    if (data.accountInfo !== undefined) { fields.push('account_info = ?'); values.push(data.accountInfo); }
    if (fields.length === 0) return existing;
    values.push(id);
    sqlite.prepare(`UPDATE broker_connections SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getBrokerConnection(id);
  }

  async deleteBrokerConnection(id: string): Promise<void> {
    sqlite.prepare(`DELETE FROM broker_connections WHERE id = ?`).run(id);
  }

  // ── User API Keys ───────────────────────────────────────────────────────
  private _mapUserApiKey(row: any): UserApiKey {
    return {
      id: row.id,
      userId: row.user_id,
      provider: row.provider,
      apiKey: row.api_key,
      endpointUrl: row.endpoint_url,
      defaultModel: row.default_model,
      isDefault: row.is_default,
      isActive: row.is_active,
      createdAt: row.created_at,
    };
  }

  async getUserApiKeys(userId: number): Promise<UserApiKey[]> {
    const rows = sqlite.prepare('SELECT * FROM user_api_keys WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
    return rows.map(r => this._mapUserApiKey(r));
  }

  async getUserApiKey(id: string): Promise<UserApiKey | undefined> {
    const row = sqlite.prepare('SELECT * FROM user_api_keys WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this._mapUserApiKey(row);
  }

  async createUserApiKey(data: { userId: number; provider: string; apiKey?: string; endpointUrl?: string; defaultModel?: string; isDefault?: number }): Promise<UserApiKey> {
    const id = `uak_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // If setting as default, unset other defaults
    if (data.isDefault) {
      sqlite.prepare('UPDATE user_api_keys SET is_default = 0 WHERE user_id = ?').run(data.userId);
    }
    sqlite.prepare(`
      INSERT INTO user_api_keys (id, user_id, provider, api_key, endpoint_url, default_model, is_default, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(id, data.userId, data.provider, data.apiKey ?? null, data.endpointUrl ?? null, data.defaultModel ?? null, data.isDefault ?? 0);
    return this.getUserApiKey(id) as Promise<UserApiKey>;
  }

  async updateUserApiKey(id: string, data: Partial<Omit<UserApiKey, 'id' | 'userId' | 'createdAt'>>): Promise<UserApiKey | undefined> {
    const existing = await this.getUserApiKey(id);
    if (!existing) return undefined;
    // If setting as default, unset other defaults
    if (data.isDefault) {
      sqlite.prepare('UPDATE user_api_keys SET is_default = 0 WHERE user_id = ?').run(existing.userId);
    }
    const fields: string[] = [];
    const values: any[] = [];
    if (data.provider !== undefined) { fields.push('provider = ?'); values.push(data.provider); }
    if (data.apiKey !== undefined) { fields.push('api_key = ?'); values.push(data.apiKey); }
    if (data.endpointUrl !== undefined) { fields.push('endpoint_url = ?'); values.push(data.endpointUrl); }
    if (data.defaultModel !== undefined) { fields.push('default_model = ?'); values.push(data.defaultModel); }
    if (data.isDefault !== undefined) { fields.push('is_default = ?'); values.push(data.isDefault); }
    if (data.isActive !== undefined) { fields.push('is_active = ?'); values.push(data.isActive); }
    if (fields.length === 0) return existing;
    values.push(id);
    sqlite.prepare(`UPDATE user_api_keys SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getUserApiKey(id);
  }

  async deleteUserApiKey(id: string): Promise<void> {
    sqlite.prepare('DELETE FROM user_api_keys WHERE id = ?').run(id);
  }

  async getDefaultApiKey(userId: number): Promise<UserApiKey | undefined> {
    const row = sqlite.prepare('SELECT * FROM user_api_keys WHERE user_id = ? AND is_default = 1 AND is_active = 1 LIMIT 1').get(userId) as any;
    if (!row) return undefined;
    return this._mapUserApiKey(row);
  }

  // ── Account Stacks ────────────────────────────────────────────────────────
  private _mapAccountStack(row: any): AccountStack {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      leaderConnectionId: row.leader_connection_id,
      status: row.status,
      copyMode: row.copy_mode,
      sizeMultiplier: row.size_multiplier,
      createdAt: row.created_at,
    };
  }

  private _mapStackFollower(row: any): AccountStackFollower {
    return {
      id: row.id,
      stackId: row.stack_id,
      connectionId: row.connection_id,
      sizeMultiplier: row.size_multiplier,
      isActive: row.is_active,
      createdAt: row.created_at,
    };
  }

  async getAccountStacks(userId: number): Promise<AccountStack[]> {
    const rows = sqlite.prepare('SELECT * FROM account_stacks WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
    return rows.map(r => this._mapAccountStack(r));
  }

  async getAccountStack(id: string): Promise<AccountStack | undefined> {
    const row = sqlite.prepare('SELECT * FROM account_stacks WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this._mapAccountStack(row);
  }

  async createAccountStack(data: { userId: number; name: string; leaderConnectionId: string; copyMode?: string; sizeMultiplier?: number }): Promise<AccountStack> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    sqlite.prepare(`
      INSERT INTO account_stacks (id, user_id, name, leader_connection_id, copy_mode, size_multiplier)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.userId, data.name, data.leaderConnectionId, data.copyMode ?? 'mirror', data.sizeMultiplier ?? 1.0);
    return this.getAccountStack(id) as Promise<AccountStack>;
  }

  async deleteAccountStack(id: string): Promise<void> {
    sqlite.prepare('DELETE FROM account_stack_followers WHERE stack_id = ?').run(id);
    sqlite.prepare('DELETE FROM account_stacks WHERE id = ?').run(id);
  }

  async getStackFollowers(stackId: string): Promise<AccountStackFollower[]> {
    const rows = sqlite.prepare('SELECT * FROM account_stack_followers WHERE stack_id = ? ORDER BY created_at DESC').all(stackId) as any[];
    return rows.map(r => this._mapStackFollower(r));
  }

  async addStackFollower(data: { stackId: string; connectionId: string; sizeMultiplier?: number }): Promise<AccountStackFollower> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    sqlite.prepare(`
      INSERT INTO account_stack_followers (id, stack_id, connection_id, size_multiplier)
      VALUES (?, ?, ?, ?)
    `).run(id, data.stackId, data.connectionId, data.sizeMultiplier ?? 1.0);
    const row = sqlite.prepare('SELECT * FROM account_stack_followers WHERE id = ?').get(id) as any;
    return this._mapStackFollower(row);
  }

  async removeStackFollower(id: string): Promise<void> {
    sqlite.prepare('DELETE FROM account_stack_followers WHERE id = ?').run(id);
  }

  // ── Trading Bots ──────────────────────────────────────────────────────────
  private _mapTradingBot(row: any): TradingBot {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      strategyType: row.strategy_type,
      model: row.model,
      systemPrompt: row.system_prompt,
      indicators: row.indicators,
      entryRules: row.entry_rules,
      exitRules: row.exit_rules,
      riskRules: row.risk_rules,
      timeframe: row.timeframe,
      symbols: row.symbols,
      status: row.status,
      backtestResults: row.backtest_results,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getTradingBots(userId: number): Promise<TradingBot[]> {
    const rows = sqlite.prepare('SELECT * FROM trading_bots WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
    return rows.map(r => this._mapTradingBot(r));
  }

  async getTradingBot(id: string): Promise<TradingBot | undefined> {
    const row = sqlite.prepare('SELECT * FROM trading_bots WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this._mapTradingBot(row);
  }

  async createTradingBot(data: { userId: number; name: string; description?: string; strategyType?: string; model?: string; systemPrompt?: string; indicators?: string; entryRules?: string; exitRules?: string; riskRules?: string; timeframe?: string; symbols?: string; status?: string }): Promise<TradingBot> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    sqlite.prepare(`
      INSERT INTO trading_bots (id, user_id, name, description, strategy_type, model, system_prompt, indicators, entry_rules, exit_rules, risk_rules, timeframe, symbols, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.userId, data.name, data.description ?? null,
      data.strategyType ?? 'custom', data.model ?? 'claude-sonnet',
      data.systemPrompt ?? null, data.indicators ?? null,
      data.entryRules ?? null, data.exitRules ?? null, data.riskRules ?? null,
      data.timeframe ?? '5m', data.symbols ?? '["ES","NQ"]', data.status ?? 'draft'
    );
    return this.getTradingBot(id) as Promise<TradingBot>;
  }

  async updateTradingBot(id: string, data: Partial<TradingBot>): Promise<TradingBot | undefined> {
    const now = new Date().toISOString();
    const colMap: Record<string, string> = {
      name: 'name', description: 'description', strategyType: 'strategy_type',
      model: 'model', systemPrompt: 'system_prompt', indicators: 'indicators',
      entryRules: 'entry_rules', exitRules: 'exit_rules', riskRules: 'risk_rules',
      timeframe: 'timeframe', symbols: 'symbols', status: 'status',
      backtestResults: 'backtest_results',
    };
    const fields: string[] = ['updated_at = ?'];
    const values: any[] = [now];
    for (const [key, col] of Object.entries(colMap)) {
      if (key in data) { fields.push(`${col} = ?`); values.push((data as any)[key]); }
    }
    values.push(id);
    sqlite.prepare(`UPDATE trading_bots SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getTradingBot(id);
  }

  async deleteTradingBot(id: string): Promise<void> {
    sqlite.prepare('DELETE FROM trading_bots WHERE id = ?').run(id);
  }

  // ── Bot Deployments ───────────────────────────────────────────────────────
  private _mapBotDeployment(row: any): BotDeployment {
    return {
      id: row.id,
      userId: row.user_id,
      botId: row.bot_id,
      connectionId: row.connection_id,
      status: row.status,
      maxPositionSize: row.max_position_size,
      maxDailyLoss: row.max_daily_loss,
      maxTradesPerDay: row.max_trades_per_day,
      lastSignalAt: row.last_signal_at,
      totalTrades: row.total_trades,
      totalPnl: row.total_pnl,
      createdAt: row.created_at,
    };
  }

  async getBotDeployments(userId: number): Promise<BotDeployment[]> {
    const rows = sqlite.prepare('SELECT * FROM bot_deployments WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
    return rows.map(r => this._mapBotDeployment(r));
  }

  async getBotDeployment(id: string): Promise<BotDeployment | undefined> {
    const row = sqlite.prepare('SELECT * FROM bot_deployments WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this._mapBotDeployment(row);
  }

  async createBotDeployment(data: { userId: number; botId: string; connectionId: string; maxPositionSize?: number; maxDailyLoss?: number; maxTradesPerDay?: number }): Promise<BotDeployment> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    sqlite.prepare(`
      INSERT INTO bot_deployments (id, user_id, bot_id, connection_id, max_position_size, max_daily_loss, max_trades_per_day)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.userId, data.botId, data.connectionId, data.maxPositionSize ?? 1, data.maxDailyLoss ?? 500, data.maxTradesPerDay ?? 10);
    return this.getBotDeployment(id) as Promise<BotDeployment>;
  }

  async updateBotDeployment(id: string, data: Partial<BotDeployment>): Promise<BotDeployment | undefined> {
    const colMap: Record<string, string> = {
      status: 'status', maxPositionSize: 'max_position_size', maxDailyLoss: 'max_daily_loss',
      maxTradesPerDay: 'max_trades_per_day', lastSignalAt: 'last_signal_at',
      totalTrades: 'total_trades', totalPnl: 'total_pnl',
    };
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, col] of Object.entries(colMap)) {
      if (key in data) { fields.push(`${col} = ?`); values.push((data as any)[key]); }
    }
    if (fields.length === 0) return this.getBotDeployment(id);
    values.push(id);
    sqlite.prepare(`UPDATE bot_deployments SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getBotDeployment(id);
  }

  async deleteBotDeployment(id: string): Promise<void> {
    sqlite.prepare('DELETE FROM bot_deployments WHERE id = ?').run(id);
  }

  // ── Fiverr Gigs ───────────────────────────────────────────────────────────
  private _mapFiverrGig(row: any): FiverrGig {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      category: row.category,
      description: row.description,
      priceTiers: row.price_tiers,
      autoResponse: row.auto_response,
      aiModel: row.ai_model,
      isActive: row.is_active,
      totalOrders: row.total_orders,
      totalRevenue: row.total_revenue,
      createdAt: row.created_at,
    };
  }

  async getFiverrGigs(userId: number): Promise<FiverrGig[]> {
    const rows = sqlite.prepare('SELECT * FROM fiverr_gigs WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
    return rows.map(r => this._mapFiverrGig(r));
  }

  async getFiverrGig(id: string): Promise<FiverrGig | undefined> {
    const row = sqlite.prepare('SELECT * FROM fiverr_gigs WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this._mapFiverrGig(row);
  }

  async createFiverrGig(data: { userId: number; title: string; category?: string; description?: string; priceTiers?: string; autoResponse?: string; aiModel?: string }): Promise<FiverrGig> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    sqlite.prepare(`
      INSERT INTO fiverr_gigs (id, user_id, title, category, description, price_tiers, auto_response, ai_model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.userId, data.title, data.category ?? null, data.description ?? null, data.priceTiers ?? null, data.autoResponse ?? null, data.aiModel ?? 'claude-sonnet');
    return this.getFiverrGig(id) as Promise<FiverrGig>;
  }

  async updateFiverrGig(id: string, data: Partial<FiverrGig>): Promise<FiverrGig | undefined> {
    const colMap: Record<string, string> = {
      title: 'title', category: 'category', description: 'description',
      priceTiers: 'price_tiers', autoResponse: 'auto_response', aiModel: 'ai_model',
      isActive: 'is_active', totalOrders: 'total_orders', totalRevenue: 'total_revenue',
    };
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, col] of Object.entries(colMap)) {
      if (key in data) { fields.push(`${col} = ?`); values.push((data as any)[key]); }
    }
    if (fields.length === 0) return this.getFiverrGig(id);
    values.push(id);
    sqlite.prepare(`UPDATE fiverr_gigs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getFiverrGig(id);
  }

  async deleteFiverrGig(id: string): Promise<void> {
    sqlite.prepare('DELETE FROM fiverr_gigs WHERE id = ?').run(id);
  }

  // ── Fiverr Orders ─────────────────────────────────────────────────────────
  private _mapFiverrOrder(row: any): FiverrOrder {
    return {
      id: row.id,
      gigId: row.gig_id,
      userId: row.user_id,
      buyerName: row.buyer_name,
      requirements: row.requirements,
      aiDraft: row.ai_draft,
      status: row.status,
      amount: row.amount,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }

  async getFiverrOrders(userId: number): Promise<FiverrOrder[]> {
    const rows = sqlite.prepare('SELECT * FROM fiverr_orders WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
    return rows.map(r => this._mapFiverrOrder(r));
  }

  async getFiverrOrder(id: string): Promise<FiverrOrder | undefined> {
    const row = sqlite.prepare('SELECT * FROM fiverr_orders WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this._mapFiverrOrder(row);
  }

  async createFiverrOrder(data: { gigId: string; userId: number; buyerName?: string; requirements?: string; amount?: number }): Promise<FiverrOrder> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    sqlite.prepare(`
      INSERT INTO fiverr_orders (id, gig_id, user_id, buyer_name, requirements, amount)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.gigId, data.userId, data.buyerName ?? null, data.requirements ?? null, data.amount ?? 0);
    return this.getFiverrOrder(id) as Promise<FiverrOrder>;
  }

  async updateFiverrOrder(id: string, data: Partial<FiverrOrder>): Promise<FiverrOrder | undefined> {
    const colMap: Record<string, string> = {
      buyerName: 'buyer_name', requirements: 'requirements', aiDraft: 'ai_draft',
      status: 'status', amount: 'amount', completedAt: 'completed_at',
    };
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, col] of Object.entries(colMap)) {
      if (key in data) { fields.push(`${col} = ?`); values.push((data as any)[key]); }
    }
    if (fields.length === 0) return this.getFiverrOrder(id);
    values.push(id);
    sqlite.prepare(`UPDATE fiverr_orders SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getFiverrOrder(id);
  }

  // ── Fiverr Orders V2 (extended) ─────────────────────────────────────────
  private _mapFiverrOrderV2(row: any): any {
    return {
      id: row.id,
      gigId: row.gig_id,
      userId: row.user_id,
      orderId: row.order_id ?? null,
      gigTitle: row.gig_title ?? row.buyer_name ?? null,
      buyerName: row.buyer_name ?? null,
      buyerEmail: row.client_email ?? null,
      specs: row.specs ?? row.requirements ?? null,
      status: row.status ?? 'intake',
      revenue: row.revenue ?? null,
      generatedOutput: row.generated_output ?? row.ai_draft ?? row.ai_output ?? null,
      generationJobId: row.generation_job_id ?? null,
      templateId: row.template_id ?? null,
      autoGenerate: row.auto_generate ?? 0,
      dueAt: row.due_at ?? null,
      deliveredAt: row.delivered_at ?? null,
      reviewedAt: row.reviewed_at ?? null,
      reviewNote: row.review_note ?? null,
      models: row.models ?? null,
      amount: row.amount ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? null,
    };
  }

  async getFiverrOrdersV2(userId: number, status?: string): Promise<any[]> {
    let query = 'SELECT * FROM fiverr_orders WHERE user_id = ?';
    const params: any[] = [userId];
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';
    const rows = sqlite.prepare(query).all(...params) as any[];
    return rows.map(r => this._mapFiverrOrderV2(r));
  }

  async getFiverrOrderV2(id: string): Promise<any | undefined> {
    const row = sqlite.prepare('SELECT * FROM fiverr_orders WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this._mapFiverrOrderV2(row);
  }

  async createFiverrOrderV2(data: {
    userId: number; orderId?: string; gigTitle?: string; buyerName?: string;
    buyerEmail?: string; specs?: string; status?: string; revenue?: number;
    templateId?: string; autoGenerate?: boolean; dueAt?: number;
  }): Promise<any> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    const now = Date.now();
    sqlite.prepare(`
      INSERT INTO fiverr_orders (id, gig_id, user_id, buyer_name, requirements, status, amount, order_id, gig_title, client_email, specs, revenue, template_id, auto_generate, due_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `).run(
      id, 'manual', data.userId, data.buyerName ?? null, data.specs ?? null,
      data.status ?? 'intake', 0, data.orderId ?? null, data.gigTitle ?? null,
      data.buyerEmail ?? null, data.specs ?? null, data.revenue ?? null,
      data.templateId ?? null, data.autoGenerate ? 1 : 0, data.dueAt ?? null, now
    );
    return this.getFiverrOrderV2(id);
  }

  async updateFiverrOrderV2(id: string, data: Record<string, any>): Promise<any | undefined> {
    const colMap: Record<string, string> = {
      orderId: 'order_id', gigTitle: 'gig_title', buyerName: 'buyer_name',
      buyerEmail: 'client_email', specs: 'specs', status: 'status',
      revenue: 'revenue', generatedOutput: 'generated_output',
      generationJobId: 'generation_job_id', templateId: 'template_id',
      autoGenerate: 'auto_generate', dueAt: 'due_at', deliveredAt: 'delivered_at',
      reviewedAt: 'reviewed_at', reviewNote: 'review_note', amount: 'amount',
      models: 'models',
    };
    const fields: string[] = ['updated_at = ?'];
    const values: any[] = [Date.now()];
    for (const [key, col] of Object.entries(colMap)) {
      if (key in data) { fields.push(`${col} = ?`); values.push(data[key]); }
    }
    values.push(id);
    sqlite.prepare(`UPDATE fiverr_orders SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getFiverrOrderV2(id);
  }

  async deleteFiverrOrderV2(id: string): Promise<void> {
    sqlite.prepare('DELETE FROM fiverr_orders WHERE id = ?').run(id);
  }

  async getDeliveredOrdersForRevenue(userId: number, sinceTs?: number): Promise<any[]> {
    let query = "SELECT * FROM fiverr_orders WHERE user_id = ? AND status = 'delivered'";
    const params: any[] = [userId];
    if (sinceTs) {
      query += ' AND delivered_at >= ?';
      params.push(sinceTs);
    }
    query += ' ORDER BY delivered_at DESC';
    const rows = sqlite.prepare(query).all(...params) as any[];
    return rows.map(r => this._mapFiverrOrderV2(r));
  }

  // ── Gig Templates ────────────────────────────────────────────────────────
  async getGigTemplates(userId: number): Promise<GigTemplate[]> {
    return db.select().from(gigTemplates).where(eq(gigTemplates.userId, userId)).orderBy(desc(gigTemplates.updatedAt)).all();
  }

  async getGigTemplate(id: string): Promise<GigTemplate | undefined> {
    return db.select().from(gigTemplates).where(eq(gigTemplates.id, id)).get();
  }

  async createGigTemplate(data: InsertGigTemplate): Promise<GigTemplate> {
    return db.insert(gigTemplates).values(data).returning().get();
  }

  async updateGigTemplate(id: string, data: Partial<GigTemplate>): Promise<GigTemplate | undefined> {
    return db.update(gigTemplates).set({ ...data, updatedAt: Date.now() }).where(eq(gigTemplates.id, id)).returning().get();
  }

  async deleteGigTemplate(id: string): Promise<void> {
    db.delete(gigTemplates).where(eq(gigTemplates.id, id)).run();
  }

  async getAutoGenerateTemplate(userId: number): Promise<GigTemplate | undefined> {
    return db.select().from(gigTemplates).where(and(eq(gigTemplates.userId, userId), eq(gigTemplates.autoGenerate, 1))).get();
  }

  // ── Webhook Secrets ──────────────────────────────────────────────────────
  async getWebhookSecrets(userId: number): Promise<WebhookSecret[]> {
    return db.select().from(webhookSecrets).where(eq(webhookSecrets.userId, userId)).orderBy(desc(webhookSecrets.createdAt)).all();
  }

  async getWebhookSecret(id: string): Promise<WebhookSecret | undefined> {
    return db.select().from(webhookSecrets).where(eq(webhookSecrets.id, id)).get();
  }

  async getAllWebhookSecrets(): Promise<WebhookSecret[]> {
    return db.select().from(webhookSecrets).all();
  }

  async createWebhookSecret(data: { id: string; userId: number; secret: string; source?: string }): Promise<WebhookSecret> {
    return db.insert(webhookSecrets).values({
      ...data,
      source: data.source ?? 'fiverr',
      createdAt: Date.now(),
    }).returning().get();
  }

  async deleteWebhookSecret(id: string): Promise<void> {
    db.delete(webhookSecrets).where(eq(webhookSecrets.id, id)).run();
  }

  // ── Manual Income Entries ────────────────────────────────────────────────
  async getManualIncomeEntries(userId: number, sinceTs?: number): Promise<ManualIncomeEntry[]> {
    if (sinceTs) {
      return db.select().from(manualIncomeEntries)
        .where(and(eq(manualIncomeEntries.userId, userId), gte(manualIncomeEntries.date, sinceTs)))
        .orderBy(desc(manualIncomeEntries.date)).all();
    }
    return db.select().from(manualIncomeEntries).where(eq(manualIncomeEntries.userId, userId)).orderBy(desc(manualIncomeEntries.date)).all();
  }

  async createManualIncomeEntry(data: { id: string; userId: number; amount: number; description: string; platform?: string; date: number }): Promise<ManualIncomeEntry> {
    return db.insert(manualIncomeEntries).values({
      ...data,
      platform: data.platform ?? 'manual',
      createdAt: Date.now(),
    }).returning().get();
  }

  async deleteManualIncomeEntry(id: string): Promise<void> {
    db.delete(manualIncomeEntries).where(eq(manualIncomeEntries.id, id)).run();
  }

  // ── Generated Apps ────────────────────────────────────────────────────────
  private _mapGeneratedApp(row: any): GeneratedApp {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      appType: row.app_type,
      framework: row.framework,
      generatedCode: row.generated_code,
      previewUrl: row.preview_url,
      status: row.status,
      versions: row.versions ?? null,
      createdAt: row.created_at,
    };
  }

  async getGeneratedApps(userId: number): Promise<GeneratedApp[]> {
    const rows = sqlite.prepare('SELECT * FROM generated_apps WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
    return rows.map(r => this._mapGeneratedApp(r));
  }

  async getGeneratedApp(id: string): Promise<GeneratedApp | undefined> {
    const row = sqlite.prepare('SELECT * FROM generated_apps WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this._mapGeneratedApp(row);
  }

  async createGeneratedApp(data: { userId: number; name: string; description?: string; appType?: string; framework?: string }): Promise<GeneratedApp> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    sqlite.prepare(`
      INSERT INTO generated_apps (id, user_id, name, description, app_type, framework)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.userId, data.name, data.description ?? null, data.appType ?? 'web', data.framework ?? 'react');
    return this.getGeneratedApp(id) as Promise<GeneratedApp>;
  }

  async updateGeneratedApp(id: string, data: Partial<GeneratedApp>): Promise<GeneratedApp | undefined> {
    const colMap: Record<string, string> = {
      name: 'name', description: 'description', appType: 'app_type',
      framework: 'framework', generatedCode: 'generated_code',
      previewUrl: 'preview_url', status: 'status', versions: 'versions',
    };
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, col] of Object.entries(colMap)) {
      if (key in data) { fields.push(`${col} = ?`); values.push((data as any)[key]); }
    }
    if (fields.length === 0) return this.getGeneratedApp(id);
    values.push(id);
    sqlite.prepare(`UPDATE generated_apps SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getGeneratedApp(id);
  }

  async deleteGeneratedApp(id: string): Promise<void> {
    sqlite.prepare('DELETE FROM generated_apps WHERE id = ?').run(id);
  }

  // ── White Label Configs ───────────────────────────────────────────────────
  private _mapWhiteLabelConfig(row: any): WhiteLabelConfig {
    return {
      id: row.id,
      userId: row.user_id,
      brandName: row.brand_name,
      logoUrl: row.logo_url,
      primaryColor: row.primary_color,
      secondaryColor: row.secondary_color,
      customDomain: row.custom_domain,
      features: row.features,
      maxUsers: row.max_users,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  async getWhiteLabelConfigs(userId: number): Promise<WhiteLabelConfig[]> {
    const rows = sqlite.prepare('SELECT * FROM white_label_configs WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
    return rows.map(r => this._mapWhiteLabelConfig(r));
  }

  async getWhiteLabelConfig(id: string): Promise<WhiteLabelConfig | undefined> {
    const row = sqlite.prepare('SELECT * FROM white_label_configs WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this._mapWhiteLabelConfig(row);
  }

  async createWhiteLabelConfig(data: { userId: number; brandName: string; logoUrl?: string; primaryColor?: string; secondaryColor?: string; customDomain?: string; features?: string; maxUsers?: number }): Promise<WhiteLabelConfig> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    sqlite.prepare(`
      INSERT INTO white_label_configs (id, user_id, brand_name, logo_url, primary_color, secondary_color, custom_domain, features, max_users)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.userId, data.brandName, data.logoUrl ?? null, data.primaryColor ?? '#6366f1', data.secondaryColor ?? '#8b5cf6', data.customDomain ?? null, data.features ?? null, data.maxUsers ?? 10);
    return this.getWhiteLabelConfig(id) as Promise<WhiteLabelConfig>;
  }

  async updateWhiteLabelConfig(id: string, data: Partial<WhiteLabelConfig>): Promise<WhiteLabelConfig | undefined> {
    const colMap: Record<string, string> = {
      brandName: 'brand_name', logoUrl: 'logo_url', primaryColor: 'primary_color',
      secondaryColor: 'secondary_color', customDomain: 'custom_domain',
      features: 'features', maxUsers: 'max_users', status: 'status',
    };
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, col] of Object.entries(colMap)) {
      if (key in data) { fields.push(`${col} = ?`); values.push((data as any)[key]); }
    }
    if (fields.length === 0) return this.getWhiteLabelConfig(id);
    values.push(id);
    sqlite.prepare(`UPDATE white_label_configs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getWhiteLabelConfig(id);
  }

  async deleteWhiteLabelConfig(id: string): Promise<void> {
    sqlite.prepare('DELETE FROM white_label_configs WHERE id = ?').run(id);
  }

  // ── Prop Accounts ─────────────────────────────────────────────────────────
  private _mapPropAccount(row: any): PropAccount {
    return {
      id: row.id,
      userId: row.user_id,
      firm: row.firm,
      accountNumber: row.account_number,
      accountSize: row.account_size,
      phase: row.phase,
      profitTarget: row.profit_target,
      maxDrawdown: row.max_drawdown,
      dailyDrawdown: row.daily_drawdown,
      currentBalance: row.current_balance,
      currentPnl: row.current_pnl,
      status: row.status,
      credentials: row.credentials,
      createdAt: row.created_at,
    };
  }

  async getPropAccounts(userId: number): Promise<PropAccount[]> {
    const rows = sqlite.prepare('SELECT * FROM prop_accounts WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
    return rows.map(r => this._mapPropAccount(r));
  }

  async getPropAccount(id: string): Promise<PropAccount | undefined> {
    const row = sqlite.prepare('SELECT * FROM prop_accounts WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this._mapPropAccount(row);
  }

  async createPropAccount(data: { userId: number; firm: string; accountNumber?: string; accountSize?: number; phase?: string; profitTarget?: number; maxDrawdown?: number; dailyDrawdown?: number; currentBalance?: number; credentials?: string }): Promise<PropAccount> {
    const { v4: uuidv4 } = await import('uuid');
    const id = uuidv4();
    sqlite.prepare(`
      INSERT INTO prop_accounts (id, user_id, firm, account_number, account_size, phase, profit_target, max_drawdown, daily_drawdown, current_balance, credentials)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.userId, data.firm, data.accountNumber ?? null,
      data.accountSize ?? null, data.phase ?? 'evaluation',
      data.profitTarget ?? null, data.maxDrawdown ?? null, data.dailyDrawdown ?? null,
      data.currentBalance ?? null, data.credentials ?? null
    );
    return this.getPropAccount(id) as Promise<PropAccount>;
  }

  async updatePropAccount(id: string, data: Partial<PropAccount>): Promise<PropAccount | undefined> {
    const colMap: Record<string, string> = {
      firm: 'firm', accountNumber: 'account_number', accountSize: 'account_size',
      phase: 'phase', profitTarget: 'profit_target', maxDrawdown: 'max_drawdown',
      dailyDrawdown: 'daily_drawdown', currentBalance: 'current_balance',
      currentPnl: 'current_pnl', status: 'status', credentials: 'credentials',
    };
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, col] of Object.entries(colMap)) {
      if (key in data) { fields.push(`${col} = ?`); values.push((data as any)[key]); }
    }
    if (fields.length === 0) return this.getPropAccount(id);
    values.push(id);
    sqlite.prepare(`UPDATE prop_accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getPropAccount(id);
  }

  async deletePropAccount(id: string): Promise<void> {
    sqlite.prepare('DELETE FROM prop_accounts WHERE id = ?').run(id);
  }

  // ── Stack Execution Log ──────────────────────────────────────────────────
  addStackExecutionLog(entry: { id: string; stackId: string; connectionId: string; symbol: string; side: string; quantity: number; price: number; status: string; executedAt: string }): void {
    sqlite.prepare(`
      INSERT INTO stack_execution_log (id, stack_id, connection_id, symbol, side, quantity, price, status, executed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(entry.id, entry.stackId, entry.connectionId, entry.symbol, entry.side, entry.quantity, entry.price, entry.status, entry.executedAt);
  }

  getStackExecutionLogs(stackId: string): any[] {
    return sqlite.prepare('SELECT * FROM stack_execution_log WHERE stack_id = ? ORDER BY executed_at DESC LIMIT 50').all(stackId) as any[];
  }

  // ── Products ────────────────────────────────────────────────────────────────
  async getProduct(id: string): Promise<any> {
    const row = sqlite.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return { id: row.id, name: row.name, description: row.description, priceCents: row.price_cents, category: row.category, features: row.features, isActive: row.is_active, createdAt: row.created_at };
  }

  async getProducts(): Promise<any[]> {
    const rows = sqlite.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC').all() as any[];
    return rows.map(r => ({ id: r.id, name: r.name, description: r.description, priceCents: r.price_cents, category: r.category, features: r.features, isActive: r.is_active, createdAt: r.created_at }));
  }

  async getUserProduct(userId: number, productId: string): Promise<any> {
    const row = sqlite.prepare('SELECT * FROM user_products WHERE user_id = ? AND product_id = ? AND status = ?').get(userId, productId, 'active') as any;
    if (!row) return undefined;
    return { id: row.id, userId: row.user_id, productId: row.product_id, stripePaymentId: row.stripe_payment_id, priceCents: row.price_cents, status: row.status, purchasedAt: row.purchased_at, expiresAt: row.expires_at };
  }

  async getUserProducts(userId: number): Promise<any[]> {
    const rows = sqlite.prepare('SELECT * FROM user_products WHERE user_id = ? ORDER BY purchased_at DESC').all(userId) as any[];
    return rows.map(r => ({ id: r.id, userId: r.user_id, productId: r.product_id, stripePaymentId: r.stripe_payment_id, priceCents: r.price_cents, status: r.status, purchasedAt: r.purchased_at, expiresAt: r.expires_at }));
  }

  async createUserProduct(data: { userId: number; productId: string; stripePaymentId?: string; priceCents: number }): Promise<any> {
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sqlite.prepare('INSERT INTO user_products (id, user_id, product_id, stripe_payment_id, price_cents) VALUES (?, ?, ?, ?, ?)').run(id, data.userId, data.productId, data.stripePaymentId ?? null, data.priceCents);
    return this.getUserProduct(data.userId, data.productId);
  }

  // ── Workflow Presets ────────────────────────────────────────────────────────
  async getWorkflowPresets(productId?: string): Promise<any[]> {
    if (productId) {
      const rows = sqlite.prepare('SELECT * FROM workflow_presets WHERE product_id = ? ORDER BY created_at').all(productId) as any[];
      return rows.map(r => ({ id: r.id, productId: r.product_id, name: r.name, description: r.description, category: r.category, templateData: r.template_data, icon: r.icon, createdAt: r.created_at }));
    }
    const rows = sqlite.prepare('SELECT * FROM workflow_presets ORDER BY created_at').all() as any[];
    return rows.map(r => ({ id: r.id, productId: r.product_id, name: r.name, description: r.description, category: r.category, templateData: r.template_data, icon: r.icon, createdAt: r.created_at }));
  }

  async getWorkflowPreset(id: string): Promise<any> {
    const row = sqlite.prepare('SELECT * FROM workflow_presets WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return { id: row.id, productId: row.product_id, name: row.name, description: row.description, category: row.category, templateData: row.template_data, icon: row.icon, createdAt: row.created_at };
  }

  // ── Phase 1: Conversations ──────────────────────────────────────────────────

  async createConversation(data: InsertConversation): Promise<Conversation> {
    return db.insert(conversations).values(data).returning().get();
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    return db.select().from(conversations).where(eq(conversations.id, id)).get();
  }

  async getConversationsByUser(userId: number): Promise<Conversation[]> {
    return db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.updatedAt)).all();
  }

  async updateConversation(id: string, data: Partial<Conversation>): Promise<Conversation | undefined> {
    const updates: any = { ...data };
    return db.update(conversations).set(updates).where(eq(conversations.id, id)).returning().get();
  }

  // ── Phase 1: Boss Messages ──────────────────────────────────────────────────

  async createBossMessage(data: InsertBossMessage): Promise<BossMessage> {
    return db.insert(bossMessages).values(data).returning().get();
  }

  async getBossMessagesByConversation(conversationId: string): Promise<BossMessage[]> {
    return db.select().from(bossMessages).where(eq(bossMessages.conversationId, conversationId)).orderBy(bossMessages.createdAt).all();
  }

  // ── Phase 1: Agent Jobs ─────────────────────────────────────────────────────

  async createAgentJob(data: InsertAgentJob): Promise<AgentJob> {
    return db.insert(agentJobs).values(data).returning().get();
  }

  async getAgentJob(id: string): Promise<AgentJob | undefined> {
    return db.select().from(agentJobs).where(eq(agentJobs.id, id)).get();
  }

  async getAgentJobsByConversation(conversationId: string): Promise<AgentJob[]> {
    return db.select().from(agentJobs).where(eq(agentJobs.conversationId, conversationId)).orderBy(agentJobs.createdAt).all();
  }

  async getAgentJobsByStatus(conversationId: string, status: string): Promise<AgentJob[]> {
    return db.select().from(agentJobs).where(and(eq(agentJobs.conversationId, conversationId), eq(agentJobs.status, status))).all();
  }

  async getRunningJobsByUser(userId: number): Promise<AgentJob[]> {
    return db.select().from(agentJobs).where(and(eq(agentJobs.userId, userId), eq(agentJobs.status, "running"))).all();
  }

  async updateAgentJob(id: string, data: Partial<AgentJob>): Promise<AgentJob | undefined> {
    const updates: any = { ...data };
    return db.update(agentJobs).set(updates).where(eq(agentJobs.id, id)).returning().get();
  }

  async getChildJobs(parentJobId: string): Promise<AgentJob[]> {
    return db.select().from(agentJobs).where(eq(agentJobs.parentJobId, parentJobId)).orderBy(agentJobs.createdAt).all();
  }

  // Agent Configs
  async getAgentConfig(userId: number, agentType: string): Promise<AgentConfig | undefined> {
    return db.select().from(agentConfigs)
      .where(and(eq(agentConfigs.userId, userId), eq(agentConfigs.agentType, agentType)))
      .get();
  }
  async getAgentConfigs(userId: number): Promise<AgentConfig[]> {
    return db.select().from(agentConfigs).where(eq(agentConfigs.userId, userId)).all();
  }
  async upsertAgentConfig(config: InsertAgentConfig): Promise<AgentConfig> {
    const existing = await this.getAgentConfig(config.userId, config.agentType);
    if (existing) {
      return db.update(agentConfigs)
        .set({ model: config.model, models: config.models, systemPrompt: config.systemPrompt, isActive: config.isActive, updatedAt: Date.now() })
        .where(eq(agentConfigs.id, existing.id))
        .returning().get();
    }
    return db.insert(agentConfigs).values(config).returning().get();
  }

  // Workflow Executions
  async createWorkflowExecution(exec: InsertWorkflowExecution): Promise<WorkflowExecution> {
    return db.insert(workflowExecutions).values(exec).returning().get();
  }
  async getWorkflowExecution(id: string): Promise<WorkflowExecution | undefined> {
    return db.select().from(workflowExecutions).where(eq(workflowExecutions.id, id)).get();
  }
  async getWorkflowExecutions(workflowId: number): Promise<WorkflowExecution[]> {
    return db.select().from(workflowExecutions)
      .where(eq(workflowExecutions.workflowId, workflowId))
      .orderBy(desc(workflowExecutions.createdAt))
      .all();
  }
  async updateWorkflowExecution(id: string, data: Partial<WorkflowExecution>): Promise<WorkflowExecution | undefined> {
    return db.update(workflowExecutions).set(data).where(eq(workflowExecutions.id, id)).returning().get();
  }

  // Workflow Node Results
  async createWorkflowNodeResult(result: InsertWorkflowNodeResult): Promise<WorkflowNodeResult> {
    return db.insert(workflowNodeResults).values(result).returning().get();
  }
  async getWorkflowNodeResults(executionId: string): Promise<WorkflowNodeResult[]> {
    return db.select().from(workflowNodeResults)
      .where(eq(workflowNodeResults.executionId, executionId))
      .all();
  }
  async updateWorkflowNodeResult(id: string, data: Partial<WorkflowNodeResult>): Promise<WorkflowNodeResult | undefined> {
    return db.update(workflowNodeResults).set(data).where(eq(workflowNodeResults.id, id)).returning().get();
  }

  // ── Phase 3 Dashboard: Layout Persistence ────────────────────────────────
  getDashboardLayout(userId: number): any | null {
    const row = sqlite.prepare('SELECT * FROM user_dashboard_layouts WHERE user_id = ?').get(userId) as any;
    if (!row) return null;
    return { id: row.id, userId: row.user_id, layout: JSON.parse(row.layout || '[]'), updatedAt: row.updated_at };
  }

  upsertDashboardLayout(userId: number, layout: any[]): any {
    const existing = sqlite.prepare('SELECT id FROM user_dashboard_layouts WHERE user_id = ?').get(userId) as any;
    const now = Date.now();
    if (existing) {
      sqlite.prepare('UPDATE user_dashboard_layouts SET layout = ?, updated_at = ? WHERE user_id = ?').run(JSON.stringify(layout), now, userId);
      return { id: existing.id, userId, layout, updatedAt: now };
    }
    const { v4: uuidv4 } = require("uuid");
    const id = uuidv4();
    sqlite.prepare('INSERT INTO user_dashboard_layouts (id, user_id, layout, updated_at) VALUES (?, ?, ?, ?)').run(id, userId, JSON.stringify(layout), now);
    return { id, userId, layout, updatedAt: now };
  }

  // ── Phase 3 Dashboard: Activity Events ────────────────────────────────────
  getActivityEvents(userId: number, limit: number = 20): any[] {
    const rows = sqlite.prepare('SELECT * FROM activity_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit) as any[];
    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      type: r.type,
      title: r.title,
      description: r.description,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
      createdAt: r.created_at,
    }));
  }

  insertActivityEvent(event: { id: string; userId: number; type: string; title: string; description?: string; metadata?: any }): void {
    sqlite.prepare('INSERT INTO activity_events (id, user_id, type, title, description, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      event.id, event.userId, event.type, event.title,
      event.description || null,
      event.metadata ? JSON.stringify(event.metadata) : null,
      Date.now()
    );
  }

  // ── Phase 3 Dashboard: Stats Queries ──────────────────────────────────────
  getDashboardStats(userId: number): {
    activeAgents: number;
    tokensUsed7d: number;
    workflowsRun30d: number;
    revenueThisMonth: number;
    deltas: { activeAgentsDelta: number; tokensDelta: number; workflowsDelta: number; revenueDelta: number };
  } {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 86400000;
    const fourteenDaysAgo = now - 14 * 86400000;
    const thirtyDaysAgo = now - 30 * 86400000;
    const sixtyDaysAgo = now - 60 * 86400000;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthTs = startOfMonth.getTime();
    const startOfPrevMonth = new Date(startOfMonth);
    startOfPrevMonth.setMonth(startOfPrevMonth.getMonth() - 1);
    const startOfPrevMonthTs = startOfPrevMonth.getTime();

    // Active agents (running jobs)
    const activeAgents = (sqlite.prepare("SELECT COUNT(*) as c FROM agent_jobs WHERE user_id = ? AND status = 'running'").get(userId) as any)?.c || 0;
    const prevActiveAgents = (sqlite.prepare("SELECT COUNT(*) as c FROM agent_jobs WHERE user_id = ? AND status = 'complete' AND completed_at > ? AND completed_at <= ?").get(userId, fourteenDaysAgo, sevenDaysAgo) as any)?.c || 0;

    // Tokens used (7d) - from agent_jobs token_count
    const tokensUsed7d = (sqlite.prepare("SELECT COALESCE(SUM(token_count), 0) as t FROM agent_jobs WHERE user_id = ? AND created_at > ?").get(userId, sevenDaysAgo) as any)?.t || 0;
    const tokensPrev7d = (sqlite.prepare("SELECT COALESCE(SUM(token_count), 0) as t FROM agent_jobs WHERE user_id = ? AND created_at > ? AND created_at <= ?").get(userId, fourteenDaysAgo, sevenDaysAgo) as any)?.t || 0;

    // Workflows run (30d) - combine workflow_runs + workflow_executions
    const wfRuns30d = (sqlite.prepare("SELECT COUNT(*) as c FROM workflow_runs WHERE user_id = ? AND created_at > ?").get(userId, new Date(thirtyDaysAgo).toISOString()) as any)?.c || 0;
    const wfExec30d = (sqlite.prepare("SELECT COUNT(*) as c FROM workflow_executions WHERE user_id = ? AND created_at > ?").get(userId, thirtyDaysAgo) as any)?.c || 0;
    const workflowsRun30d = wfRuns30d + wfExec30d;

    const wfRunsPrev = (sqlite.prepare("SELECT COUNT(*) as c FROM workflow_runs WHERE user_id = ? AND created_at > ? AND created_at <= ?").get(userId, new Date(sixtyDaysAgo).toISOString(), new Date(thirtyDaysAgo).toISOString()) as any)?.c || 0;
    const wfExecPrev = (sqlite.prepare("SELECT COUNT(*) as c FROM workflow_executions WHERE user_id = ? AND created_at > ? AND created_at <= ?").get(userId, sixtyDaysAgo, thirtyDaysAgo) as any)?.c || 0;
    const workflowsPrev30d = wfRunsPrev + wfExecPrev;

    // Revenue this month - from fiverr_orders
    const revenueThisMonth = (sqlite.prepare("SELECT COALESCE(SUM(COALESCE(revenue, amount, 0)), 0) as r FROM fiverr_orders WHERE user_id = ? AND status = 'delivered' AND delivered_at >= ?").get(userId, startOfMonthTs) as any)?.r || 0;
    const revenuePrevMonth = (sqlite.prepare("SELECT COALESCE(SUM(COALESCE(revenue, amount, 0)), 0) as r FROM fiverr_orders WHERE user_id = ? AND status = 'delivered' AND delivered_at >= ? AND delivered_at < ?").get(userId, startOfPrevMonthTs, startOfMonthTs) as any)?.r || 0;

    // Compute deltas as percentage
    const computeDelta = (curr: number, prev: number) => {
      if (prev === 0 && curr === 0) return 0;
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    return {
      activeAgents,
      tokensUsed7d,
      workflowsRun30d,
      revenueThisMonth,
      deltas: {
        activeAgentsDelta: computeDelta(activeAgents, prevActiveAgents),
        tokensDelta: computeDelta(tokensUsed7d, tokensPrev7d),
        workflowsDelta: computeDelta(workflowsRun30d, workflowsPrev30d),
        revenueDelta: computeDelta(revenueThisMonth, revenuePrevMonth),
      },
    };
  }

  // ── Phase 3 Dashboard: Token Usage Chart Data ─────────────────────────────
  getTokenUsageByDay(userId: number, days: number = 7): { date: string; tokens: number }[] {
    const now = Date.now();
    const result: { date: string; tokens: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = now - (i + 1) * 86400000;
      const dayEnd = now - i * 86400000;
      const row = sqlite.prepare("SELECT COALESCE(SUM(token_count), 0) as t FROM agent_jobs WHERE user_id = ? AND created_at > ? AND created_at <= ?").get(userId, dayStart, dayEnd) as any;
      const date = new Date(dayEnd).toISOString().slice(0, 10);
      result.push({ date, tokens: row?.t || 0 });
    }
    return result;
  }

  // ── Phase 3 Dashboard: Workflow Run Chart Data ────────────────────────────
  getWorkflowRunsByDay(userId: number, days: number = 30): { date: string; runs: number }[] {
    const now = Date.now();
    const result: { date: string; runs: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = now - (i + 1) * 86400000;
      const dayEnd = now - i * 86400000;
      const dateStr = new Date(dayEnd).toISOString().slice(0, 10);
      const fromStr = new Date(dayStart).toISOString();
      const toStr = new Date(dayEnd).toISOString();
      const wfRuns = (sqlite.prepare("SELECT COUNT(*) as c FROM workflow_runs WHERE user_id = ? AND created_at > ? AND created_at <= ?").get(userId, fromStr, toStr) as any)?.c || 0;
      const wfExec = (sqlite.prepare("SELECT COUNT(*) as c FROM workflow_executions WHERE user_id = ? AND created_at > ? AND created_at <= ?").get(userId, dayStart, dayEnd) as any)?.c || 0;
      result.push({ date: dateStr, runs: wfRuns + wfExec });
    }
    return result;
  }

  // ── Phase 3 Dashboard: Model Usage Breakdown ──────────────────────────────
  getModelUsageBreakdown(userId: number): { model: string; tokens: number }[] {
    const rows = sqlite.prepare("SELECT COALESCE(type, 'unknown') as model, SUM(COALESCE(token_count, 0)) as tokens FROM agent_jobs WHERE user_id = ? GROUP BY type ORDER BY tokens DESC").all(userId) as any[];
    return rows.map(r => ({ model: r.model || 'unknown', tokens: r.tokens || 0 }));
  }

  // ── Phase 4: Connectors Hub ────────────────────────────────────────────────

  async getConnectorsByUser(userId: number): Promise<Connector[]> {
    return db.select().from(connectors).where(eq(connectors.userId, userId)).orderBy(desc(connectors.id)).all();
  }

  async getConnector(id: number): Promise<Connector | undefined> {
    return db.select().from(connectors).where(eq(connectors.id, id)).get();
  }

  async createConnector(data: InsertConnector): Promise<Connector> {
    const now = new Date().toISOString();
    return db.insert(connectors).values({ ...data, createdAt: now, updatedAt: now }).returning().get();
  }

  async updateConnector(id: number, data: Partial<Connector>): Promise<Connector | undefined> {
    const now = new Date().toISOString();
    return db.update(connectors).set({ ...data, updatedAt: now }).where(eq(connectors.id, id)).returning().get();
  }

  async deleteConnector(id: number): Promise<void> {
    db.delete(connectors).where(eq(connectors.id, id)).run();
  }

  // OAuth States
  async createOAuthState(data: { state: string; userId: number; provider: string; redirectUri: string; expiresAt: string }): Promise<void> {
    const now = new Date().toISOString();
    db.insert(oauthStates).values({ ...data, createdAt: now }).run();
  }

  async getOAuthState(state: string): Promise<OAuthState | undefined> {
    return db.select().from(oauthStates).where(eq(oauthStates.state, state)).get();
  }

  async deleteOAuthState(state: string): Promise<void> {
    db.delete(oauthStates).where(eq(oauthStates.state, state)).run();
  }

  // Webhook Events
  async createWebhookEvent(data: { connectorId: number; headers?: string; payload?: string; sourceIp?: string }): Promise<WebhookEvent> {
    const now = new Date().toISOString();
    return db.insert(webhookEvents).values({ ...data, createdAt: now }).returning().get();
  }

  async getWebhookEvents(connectorId: number, limit = 100): Promise<WebhookEvent[]> {
    return db.select().from(webhookEvents).where(eq(webhookEvents.connectorId, connectorId)).orderBy(desc(webhookEvents.id)).limit(limit).all();
  }
}

export const storage = new DatabaseStorage();
