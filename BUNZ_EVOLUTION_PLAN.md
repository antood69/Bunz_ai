# Bunz Evolution Plan — From AI Agent OS to Workflow Execution Engine

## What Bunz Actually Is Now

Bunz is already 80% of what that ChatGPT prompt describes — an AI Workflow Execution OS. Here's the mapping:

| ChatGPT Prompt Concept | Bunz Already Has | What's Missing |
|---|---|---|
| Workflow Engine (JSON jobs → steps → execution) | Workflows page with visual builder, agent chaining | Real step-by-step execution engine with branching logic, no actual job queue |
| Credit-Based Billing | Token system with tiers (Free/Starter/Pro/Agency), Stripe integration | Per-task cost differentiation (all tasks cost same), no execution time logging |
| AI Tool Layer (LLMs, scraping, APIs) | Boss (LLM chat), BYOK with 6 providers, 70+ models | No web scraping tools, no deterministic rule layer mixed with AI |
| Meme Coin Trading Module | Prop Trading page, Account Stacking, Trading Journal | No on-chain execution, no DEX integration, no signal engine, no smart money tracking |
| Fiverr Automation | Fiverr page with order management + AI generation | No real Fiverr API connection, no automated delivery pipeline |
| Modular Architecture | Separate pages/modules, feature toggles via White Label | No microservice split, no message queue, still monolith SQLite |

## PHASE 0: HOTFIXES (Do Now)

### Bug 1: Marketplace Crash — `m.data?.find is not a function`
**Root cause**: Two issues:
- Frontend sends `sort` param → backend expects `sortBy`
- Frontend sends `price` param → backend expects `priceType`  
- `categoriesQuery` expects raw array but backend returns `{ categories: [...] }`
- `listingsQuery` response parsing: `json.listings ?? json` works but TypeScript types mismatch

**Fix**: Update MarketplacePage.tsx params AND parse categories response correctly.

### Bug 2: "Create Bot" → 404
**Root cause**: Dashboard QuickAction links to `/bots` but the actual route is `/bot-challenge`.

**Fix**: Change Dashboard.tsx QuickAction href from `/bots` to `/bot-challenge`.

### Bug 3: Mobile Bottom Nav Too High + Jarvis Overlap
**Root cause**: 
- Bottom tab bar has excessive padding/margin pushing it up
- Jarvis floating widget (position: fixed, bottom-right) overlaps the "More" tab

**Fix**: 
- Reduce bottom nav spacing
- Move Jarvis widget higher when on mobile (above the tab bar)
- Make Jarvis draggable with touch events (widget mode)

### Enhancement: AI Chat Assistant Everywhere
**Problem**: Pages like App Generator only show a form (name + description + feature checkboxes). Users who don't know what they want have no guidance.

**Solution**: Add a collapsible "AI Assistant" chat panel that appears on every creation page:
- App Generator: "Describe the app you want and I'll help you spec it out"
- Bot Challenge: "Tell me your trading strategy and I'll build the bot config"
- Fiverr: "Describe the service you want to offer"
- White Label: "Tell me about your brand and I'll suggest a theme"
- Workflows: "Describe what you want to automate"

Implementation: Create a reusable `<AIChatPanel />` component that:
- Sits as a collapsible sidebar or bottom sheet on mobile
- Takes a `systemPrompt` prop for context-specific help
- Sends to `/api/jarvis/chat` with page context
- Can inject its outputs into the page's form fields
- Uses the user's selected model/provider from BYOK settings

---

## PHASE 1: WORKFLOW EXECUTION ENGINE (The Core Value)

This is what separates Bunz from "just another AI chat wrapper." Real workflow execution.

### 1.1 Job Queue System
```
Current: Workflows are visual diagrams that don't actually execute
Target: Real execution pipeline with status tracking
```

**Architecture:**
```
User Request (JSON) 
  → Job Queue (in-process Bull-like queue using better-queue or custom)
    → Step Planner (breaks job into steps)
      → Step Executor (runs each step)
        → Output Aggregator (collects results)
          → Credit Deduction + Logging
```

**New tables:**
```sql
CREATE TABLE job_queue (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  workflow_id INTEGER,
  status TEXT DEFAULT 'pending', -- pending, planning, executing, completed, failed
  input_data TEXT, -- JSON
  output_data TEXT, -- JSON
  steps_total INTEGER DEFAULT 0,
  steps_completed INTEGER DEFAULT 0,
  credits_used INTEGER DEFAULT 0,
  execution_time_ms INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE job_steps (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  step_number INTEGER,
  step_type TEXT, -- 'ai_call', 'api_call', 'conditional', 'transform', 'human_review'
  status TEXT DEFAULT 'pending',
  input_data TEXT,
  output_data TEXT,
  credits_cost INTEGER DEFAULT 0,
  execution_time_ms INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT,
  completed_at TEXT
);
```

**Step types supported:**
- `ai_call` — Send to LLM (uses BYOK keys)
- `api_call` — Hit external API (user-configured tools)
- `conditional` — if/else branching based on previous step output
- `transform` — Data manipulation (parse JSON, extract fields, format)
- `human_review` — Pause and wait for user approval
- `webhook` — Fire webhook on completion

### 1.2 Credit Cost Differentiation
```
Current: Flat token consumption
Target: Different costs per task type
```

| Task Type | Credit Cost |
|---|---|
| AI Chat (Boss) | 1 credit per message |
| Bot Generation | 10 credits |
| App Generation | 25 credits |
| Fiverr Order AI | 15 credits |
| Workflow Execution | Variable (sum of steps) |
| AI Step (in workflow) | 2 credits per call |
| API Step (in workflow) | 1 credit per call |
| Trading Signal | 5 credits |

### 1.3 Execution Logging
Every job execution gets a full audit trail:
- Input/output per step
- Credits consumed
- Execution time
- Model used
- Success/failure with error details
- Accessible from the Audit page (already exists)

---

## PHASE 2: MEME COIN TRADING ENGINE (High-Value Module)

This is the revenue driver. Real money, real execution, real risk.

### 2.1 Architecture
```
Data Ingestion Layer
  ├── Token Launch Monitor (DexScreener API, Birdeye API)
  ├── Liquidity Tracker (DEX pool monitoring)  
  ├── Social Sentiment (Twitter/X API, Telegram bot)
  └── Wallet Tracker (on-chain: Solscan, Etherscan APIs)
        ↓
Signal Engine
  ├── Rule-Based Filters (DETERMINISTIC — runs first)
  │   ├── Liquidity > $50K threshold
  │   ├── Volume spike > 3x 1hr average
  │   ├── Holder count growth > 10% in 1hr
  │   ├── Contract risk check (honeypot detection)
  │   └── Token age filter (skip > 48hrs old)
  ├── AI Sentiment Layer (OPTIONAL — runs second)
  │   ├── Social mention velocity
  │   ├── Sentiment classification (bullish/bearish/neutral)
  │   └── Influencer mention detection
  └── Combined Score → Signal (BUY / WATCH / SKIP)
        ↓
Execution Engine
  ├── DEX Integration (Jupiter for Solana, Uniswap for ETH)
  ├── Slippage controls (max 5% default, configurable)
  ├── Gas management (priority fee estimation)
  └── Order types: Market, Limit, DCA
        ↓
Risk Management
  ├── Max position size (% of portfolio)
  ├── Max daily loss limit
  ├── Auto stop-loss per position
  ├── Take-profit tiers (25% at 2x, 25% at 5x, 50% at 10x)
  ├── Time-based exits (auto-sell after 4hrs if < 1.5x)
  └── Honeypot/scam blacklist
```

### 2.2 New Tables
```sql
CREATE TABLE trading_signals (
  id TEXT PRIMARY KEY,
  token_address TEXT NOT NULL,
  chain TEXT NOT NULL, -- 'solana', 'ethereum', 'base'
  token_name TEXT,
  token_symbol TEXT,
  signal_type TEXT, -- 'buy', 'sell', 'watch'
  confidence_score REAL, -- 0-100
  rule_score REAL, -- deterministic score
  ai_score REAL, -- AI sentiment score
  liquidity_usd REAL,
  volume_24h REAL,
  holder_count INTEGER,
  social_mentions INTEGER,
  risk_level TEXT, -- 'low', 'medium', 'high', 'extreme'
  metadata TEXT, -- JSON with full analysis
  created_at TEXT
);

CREATE TABLE trading_positions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  signal_id TEXT,
  token_address TEXT NOT NULL,
  chain TEXT NOT NULL,
  side TEXT, -- 'long'
  entry_price REAL,
  current_price REAL,
  quantity REAL,
  entry_value_usd REAL,
  current_value_usd REAL,
  pnl_usd REAL,
  pnl_percent REAL,
  status TEXT, -- 'open', 'closed', 'stopped_out'
  stop_loss REAL,
  take_profit_1 REAL,
  take_profit_2 REAL,
  take_profit_3 REAL,
  exit_price REAL,
  exit_reason TEXT, -- 'take_profit', 'stop_loss', 'time_exit', 'manual'
  opened_at TEXT,
  closed_at TEXT
);

CREATE TABLE wallet_watchlist (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  wallet_address TEXT NOT NULL,
  chain TEXT NOT NULL,
  label TEXT, -- 'smart_money', 'whale', 'influencer'
  notes TEXT,
  created_at TEXT
);
```

### 2.3 Safety-First Design
- **Paper trading mode by default** — users must explicitly enable live trading
- **Wallet connection via WalletConnect** — we never hold private keys
- **Transaction simulation** before execution (Solana: simulateTransaction)
- **Rate limiting** — max 10 trades per hour per user
- **Kill switch** — owner can disable all trading globally from admin panel

---

## PHASE 3: FIVERR AUTOMATION PIPELINE

### Current State
- Order list with AI-generated deliverables
- No real connection to Fiverr or any freelance platform

### Target State
```
Gig Setup (AI-assisted)
  → Order Intake (webhook from Fiverr/custom form)
    → AI Generation Pipeline
      → Quality Check (rules + AI review)
        → Delivery (auto or manual approval)
          → Revision Handling
```

**Key additions:**
- Webhook endpoint for external order intake
- Template library for common gig types
- Auto-delivery with approval workflow
- Client communication AI (auto-replies)
- Revenue tracking dashboard

---

## PHASE 4: INFRASTRUCTURE UPGRADES

### 4.1 Database Migration Path
```
Current: SQLite (data.db) — fine for MVP
Next: PostgreSQL on Railway — needed for concurrent writes, real queries
```

Migration plan: 
1. Add Drizzle PostgreSQL driver alongside SQLite
2. Environment variable `DATABASE_URL` switches between them
3. Migrate when user count > 50

### 4.2 Queue System
```
Current: Direct execution (blocking)
Next: In-process job queue with persistence
```

For now, use a simple in-process queue (no Redis needed yet):
- `better-queue` or custom queue backed by SQLite job_queue table
- Workers process jobs sequentially per user
- Upgrade to BullMQ + Redis when scale demands it

### 4.3 Event Logging
Already have the intelligence collection system. Extend it:
- Every workflow step logs to intelligence table
- Add structured `event_type` taxonomy
- Owner dashboard shows execution analytics

---

## PHASE 5: POLISH + MONETIZATION

### 5.1 Onboarding Flow
- First-time user tutorial overlay
- Quick-start templates for each module
- "What do you want to build?" wizard that routes to the right page

### 5.2 Marketplace Revenue
- 15% platform fee on marketplace sales
- Featured listing spots ($X/week)
- Verified seller badges

### 5.3 Trading Revenue
- Paper trading: free
- Live trading: Pro tier required ($79/mo)
- Signal alerts: Starter tier ($19/mo)
- Copy trading: Agency tier ($199/mo)

---

## BUILD PRIORITY ORDER

| Priority | Task | Effort | Impact |
|---|---|---|---|
| P0 | Hotfixes (marketplace, create bot, mobile nav, Jarvis widget) | 1 session | Unblocks current users |
| P0 | AI Chat Panel on all creation pages | 1 session | Core UX improvement |
| P1 | Workflow Execution Engine (job queue + step runner) | 2-3 sessions | Core platform value |
| P1 | Credit cost differentiation | 1 session | Monetization accuracy |
| P2 | Meme Coin Signal Engine (data ingestion + rules) | 2-3 sessions | Revenue driver |
| P2 | DEX execution integration | 2 sessions | Requires wallet infra |
| P3 | Fiverr automation pipeline | 1-2 sessions | Niche but valuable |
| P3 | PostgreSQL migration | 1 session | Scale prep |
| P4 | Onboarding + templates | 1 session | Growth |

---

## RISKS (Brutally Honest)

1. **SQLite under load** — Will hit write contention with >10 concurrent users. PostgreSQL migration is inevitable.
2. **Real money trading liability** — If the bot loses money, users blame the platform. Paper trading default + disclaimers are critical.
3. **API key security** — BYOK keys stored in SQLite are encrypted... but SQLite file access = all keys exposed. Need encryption at rest.
4. **Monolith scaling** — Everything in one Express server. At 100+ users, need to split trading engine into separate process.
5. **Fiverr ToS** — Automating Fiverr deliveries may violate their terms. Position as "AI-assisted" not "automated."
6. **No auth for trading** — Current auth is cookie-based with no 2FA. Real money features need 2FA minimum.

---

## NEXT IMMEDIATE STEP

Fix the P0 hotfixes + add the AI Chat Panel, then review this plan together before starting Phase 1.
