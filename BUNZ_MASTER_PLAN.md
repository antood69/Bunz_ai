# Bunz — Master Plan
## The AI Agent Orchestrator Where Vibe Coders Get Stuff Done

> Version 2.0 — Research-backed, implementation-ready
> Last updated: 2026
> Research sources: multi-agent-platforms.md, marketplace-billing-tools.md, local-ai-workflow-mobile.md, competitors-business-model.md

---

## Table of Contents

1. [What NEXUS OS Is](#1-what-nexus-os-is)
2. [Current State — Phase 1 Complete](#2-current-state--phase-1-complete)
3. [Competitive Positioning](#3-competitive-positioning)
4. [Pricing Strategy](#4-pricing-strategy)
5. [Phase 2: Token Economy & Usage Billing](#5-phase-2-token-economy--usage-billing)
6. [Phase 3: Orchestrator Core — Multi-Agent Engine](#6-phase-3-orchestrator-core--multi-agent-engine)
7. [Phase 4: Visual Workflow Editor](#7-phase-4-visual-workflow-editor)
8. [Phase 5: Public Marketplace](#8-phase-5-public-marketplace)
9. [Phase 6: Wallpaper & Customization System](#9-phase-6-wallpaper--customization-system)
10. [Phase 7: Local AI Integration](#10-phase-7-local-ai-integration)
11. [Phase 8: Mobile Responsive Layout & PWA](#11-phase-8-mobile-responsive-layout--pwa)
12. [Phase 9: Trading Journal — Full Backend](#12-phase-9-trading-journal--full-backend)
13. [Phase 10: Fiverr & Freelance Automation](#13-phase-10-fiverr--freelance-automation)
14. [Phase 11: App Generation Engine](#14-phase-11-app-generation-engine)
15. [Phase 12: Jarvis Voice Interface](#15-phase-12-jarvis-voice-interface)
16. [Phase 13: White-Label & Enterprise](#16-phase-13-white-label--enterprise)
17. [Phase 14: Prop Trading Integration](#17-phase-14-prop-trading-integration)
18. [Growth Strategy](#18-growth-strategy)
19. [Key Metrics to Track](#19-key-metrics-to-track)
20. [Design Principles](#20-design-principles)
21. [Priority Roadmap Table](#21-priority-roadmap-table)

---

## 1. What NEXUS OS Is

NEXUS OS is an AI Agent Orchestrator — a multi-agent platform where one "Boss" AI manages a fleet of specialized worker AIs. Users build workflows, launch agents, and automate complex tasks (Fiverr fulfillment, app generation, trading, content creation, data analysis) through a clean, professional UI. It is a subscription SaaS with a built-in token economy and a revenue-sharing marketplace.

The single most important sentence for product positioning: **"The agent orchestrator where builders get paid."**

Every serious competitor — Relevance AI, Flowise, Langflow, Dify, Botpress, Voiceflow — has a free content layer with zero economic incentive for creators. Relevance AI has 40,000 registered agents but pays creators nothing. n8n has 9,100 community workflows and pays nothing. The GPT Store promised revenue sharing, kept it invite-only for less than a dozen developers, and effectively became what the community called "volunteer work." There is no AI agent platform that runs a real creator economy. NEXUS OS will be the first.

The secondary position: simple enough for non-developers, powerful enough for engineers. The market failure across all competitors is a bifurcation: tools are either low-code and shallow (Botpress, Voiceflow) or powerful and developer-only (Flowise, Langflow, LangGraph). NEXUS OS bridges this gap with a Boss Agent model that hides orchestration complexity behind a clean UI while exposing full technical depth for those who want it.

**Core user archetypes:**
- Solopreneur automating their Fiverr business
- Agency building and selling AI workflows for clients
- Developer building and monetizing agents on the marketplace
- Business team deploying internal AI workflows without engineering support
- Power user running local models for free while using cloud for complex tasks

---

## 2. Current State — Phase 1 Complete

**Live URL:** https://nexus-os-production-50a1.up.railway.app
**Stack:** Express + Vite + React + Tailwind + shadcn + Drizzle ORM
**Infra:** Railway (auto-deploy), GitHub (antood69/nexus-os)
**bolt.new repo:** antood69/bolt.new (available for UI generation)

### What Is Built and Working

| Feature | Status | Notes |
|---------|--------|-------|
| Dashboard | Live | KPI cards, workflow overview, agent status, recent activity |
| Jarvis AI Assistant | Live | Floating orb, slide-up overlay, Claude API chat, Inter font |
| Workflow Management | Live | CRUD workflows, workflow detail view with agent pipeline |
| Agent Management | Live | Create/edit/delete agents, assign to workflows |
| Audit Panel | Live | Review agent outputs, approve/reject |
| Analytics Page | Live | Charts and metrics overview |
| Trading Journal | UI shell only | NO backend logic — needs Phase 9 |
| Bot Challenge Page | Live | Agent testing sandbox |
| Pricing Page | Live | Stripe-integrated, Pro $29/mo, Agency $79/mo |
| Auth | Live | Login page with session management |
| Theme System | Live | TradingView-style light/dark (just fixed — CSS survives build) |
| Settings Page | Live | Theme toggle, accessible from sidebar |
| Full REST API | Live | Workflows, agents, jobs, messages, audit reviews |
| Stripe Integration | Live | Checkout, webhooks, portal, subscription management |
| Claude API | Live | Powers Jarvis chat |
| SQLite + Drizzle ORM | Live | Storage layer |

### What Phase 1 Deliberately Left Out

Phase 1 is a foundation, not a product. The features that make NEXUS OS a real business — token billing, multi-agent orchestration, marketplace, visual editor — are all coming. The existing subscriptions ($29 Pro, $79 Agency) are placeholders. The real pricing architecture is defined in Section 4.

---

## 3. Competitive Positioning

The competitive landscape is not as crowded as it looks. Most platforms have the same core weaknesses.

### The Competition and Their Exploitable Flaws

**Relevance AI** ($19–$234/mo, Bessemer-backed at $24M Series B)
Their marketplace is a catalog, not an economy. 40,000 agents, zero creator revenue sharing. Creators have no financial incentive, so quality is random and the supply is thin. Their billing splits into "Actions" (tool runs) + "Vendor Credits" (LLM costs) — sophisticated buyers appreciate the pass-through model but most users find the dual-credit system confusing. Their learning curve is steep; the claim of "no-code" is generous. Exploit: build the revenue-sharing marketplace they deliberately chose not to build, and make the billing simpler.

**Flowise** (45,600+ GitHub stars, $35–$65/mo cloud)
Developer-only. There is no path from "I built something cool" to "I'm running a business on this." No template economy, no monetization, no business-user layer. The open-source version is excellent and has massive adoption; the cloud product is an afterthought. Exploit: wrap the power of a Flowise-style builder with a business layer — the same canvas, plus deployment, billing, marketplace, and operations.

**Langflow / DataStax** (free cloud tier, node-based pricing)
A research/prototyping tool that never graduates to production. The gap between prototype and product is left entirely to the user. Being owned by DataStax introduces vendor-lock concern for enterprise buyers who don't want to be tied to Astra DB. Exploit: be the production platform — not just the builder but the runner, the monitor, the billing system, and the distribution channel.

**Botpress** ($89–$1,495/mo)
Chatbot-first framing limits appeal. Their multi-agent orchestration story is weak. The $89 → $495 pricing jump leaves mid-market underserved. The separate AI Spend billing creates unpredictable total costs. Exploit: clean pricing with no separate AI spend bill, and a genuine multi-agent orchestration core for complex workflows.

**Voiceflow** ($60–$150/editor/mo)
Best-in-class design experience, worst-in-class operational experience. After your agent goes live, Voiceflow gives you almost nothing for monitoring, cost management, or scaling. Per-editor pricing makes team costs scale painfully. Credits can run out with no top-up option, and agents simply stop working. Exploit: match their UX polish while adding the production-grade operational layer they lack.

**AgentGPT / AutoGPT** (AgentGPT effectively dead, archived Jan 2026)
These platforms created massive early consumer demand for autonomous agents, then failed to productize it. 100,000+ users who gave up on these platforms are actively looking for something that actually works. Exploit: position as "the autonomous agent platform that actually delivers" — market directly to AgentGPT refugees.

**Dify.ai** (135,000+ GitHub stars, $59–$159/mo cloud)
Enormous developer trust but fundamentally a developer's tool. Their marketplace is in beta and entirely free — no creator monetization. They have the supply (skilled builders) but have not built the economy. Exploit: attract Dify power users with a revenue-share marketplace. Position: "Build on Dify, monetize on NEXUS OS."

**Wordware** ($199–$899/mo, mid-pivot)
Very expensive ($199/mo just for private flows). Mid-pivot to "Sauna" product means their 350,000-user builder community is getting less attention. The free tier makes all flows publicly visible — a serious privacy liability. Exploit: reach out directly to the Wordware builder community with a platform that offers revenue sharing, better privacy defaults, and continued builder-focused development.

### The White Space

The research makes the competitive opportunity explicit:

| Gap | Current State | NEXUS OS Answer |
|-----|--------------|-----------------|
| Creator economics | All platforms have free marketplaces with zero creator revenue share | 85/15 revenue split — creators keep 85% |
| Business-user UX | Every serious platform requires developer skills | Boss Agent pattern hides complexity; non-technical UX |
| Production operations | Most platforms stop at "build" | Monitoring, billing, version management, kill switches |
| Pricing transparency | Most platforms have unpredictable credit systems | Explicit per-plan token budgets, published markup rate |
| Mid-market | Cheap+simple or expensive+complex, nothing in between | $79–$99/mo Pro tier with real power |
| Agent distribution | No platform enables builders to distribute and monetize agents | Full marketplace with one-click install |

---

## 4. Pricing Strategy

### The Core Philosophy

Traditional SaaS pricing is broken for AI-native products. The fundamental variance problem: serving one user can cost $0.50/month (light usage) or $500/month (heavy usage) — a 1,000x range. This means flat-rate pricing at any level either bleeds the company on heavy users or repels light users with sticker shock. The research consensus from Bessemer Venture Partners, the Cursor/Windsurf experience, and the competitor analysis all converge on one answer: hybrid tiered pricing.

Hybrid = flat platform fee (predictable MRR) + included usage allowance (generous enough for the "aha moment") + metered overage at a transparent markup (aligns revenue with actual value).

### Pricing Tiers

| Tier | Monthly Price | Token Allowance | Key Features | Target User |
|------|--------------|-----------------|--------------|-------------|
| Free | $0 | 100K tokens | 2 workflows, 3 agents, basic templates, marketplace browsing | Evaluation, lead magnet |
| Starter | $19/mo | 1M tokens | 10 workflows, 10 agents, Jarvis, audit panel, email support | Solopreneurs, freelancers |
| Pro | $79/mo | 5M tokens | Unlimited workflows, BYOK, marketplace selling, custom agents, local AI | Power users, indie builders |
| Agency | $199/mo | 20M tokens | Multi-user (5 seats), white-label outputs, priority support, analytics API | Agencies, small teams |
| Enterprise | Custom | Custom | SSO, RBAC, audit logs, SLA, on-premise option, dedicated CSM | Organizations |

Notes on tier design:
- The Free tier must allow genuine value realization. A free tier that blocks the core workflow converts at 1–2%. One that allows 80% of the workflow converts at 8–12% (ChartMogul data from competitor research). Free users should be able to build and run a real workflow before hitting limits.
- The $19 Starter tier is an intentional Relevance AI counter — their entry-paid plan is $19/mo. Match the price point, offer more tokens and clearer billing.
- The $79 Pro tier is where BYOK (Bring Your Own Key) unlocks. This is now table stakes for sophisticated buyers, per the research findings on token markup acceptability.
- Never use the word "unlimited" unless something is genuinely unlimited. Cursor's June 2025 disaster — poorly communicated transition to usage-based billing, public apology July 4, refunds issued — is the definitive case study in what not to do. Communicate every billing change 30+ days in advance with explicit per-user impact examples.

### Token Markup

Research shows Windsurf charges a transparent 20% markup on third-party models ($3.60/1M input for Claude Sonnet vs Anthropic's $3.00 direct). This is disclosed and accepted. The research-backed sweet spot is 20–30%.

NEXUS OS approach:
- **Managed key users (Free + Starter):** 25% markup over actual API costs, published on the pricing page. We pay ~$3.00/1M for Sonnet input; we charge ~$3.75/1M. This is disclosed, not hidden.
- **BYOK users (Pro+):** Their API key, zero markup. They pay Anthropic/OpenAI directly. No NEXUS OS token billing applies.
- **Internal model routing:** Use the 4-tier model routing (see Phase 3) to protect margins. Route simple classification tasks to Haiku or local models; reserve Sonnet/Opus for tasks that genuinely need them. Users see one unified credit rate; we optimize the backend. This is exactly how Cursor's "Auto" routing works.

Publish your markup rate prominently. Transparency builds trust and reduces negotiation friction. IBRS consulting notes that executives now insist providers justify markups exceeding 2x the raw API cost — a 25% markup is well within acceptable range and easy to defend.

### Token Pack Purchases

One-time Stripe purchases for token top-ups. Never expire. Never surprise the user.

| Pack | Tokens | Price | Effective Rate |
|------|--------|-------|----------------|
| Starter Pack | 1M tokens | $4 | $4/M |
| Standard Pack | 5M tokens | $18 | $3.60/M |
| Pro Pack | 20M tokens | $65 | $3.25/M |
| Volume Pack | 100M tokens | $280 | $2.80/M |

Stripe implementation: use `price_data` with `product_data` on a one-time payment intent. No subscription update needed. Tokens credited to user account on `payment_intent.succeeded` webhook. See Phase 2 for full technical implementation.

### Marketplace Revenue Split

85% to creator, 15% to NEXUS OS. This matches Figma Community (85/15) and is competitive with Shopify App Store (85-100% depending on lifetime revenue). This is the highest split in the AI agent space — every competitor pays creators 0%. The 15% covers payment processing, fraud monitoring, tax collection/remittance, and platform infrastructure.

### Auto-Refill

Optional for all paid plans. User sets a threshold (e.g., "when I hit 10% remaining") and a refill amount (e.g., "buy 5M tokens"). Auto-charge is explicit — user enables it, sees a confirmation, can disable at any time. Never charge automatically without explicit opt-in. Always cap at a user-configurable maximum monthly spend.

---

## 5. Phase 2: Token Economy & Usage Billing

**Priority:** NOW — this is the first revenue expansion after Phase 1
**Effort:** 1–2 weeks
**Revenue impact:** Direct — every token used beyond plan limits is revenue

### What It Is and Why It Matters

Currently, NEXUS OS collects flat subscriptions but has no mechanism to charge for actual usage. If a Pro user runs complex agents all month and exceeds what $29/mo covers in API costs, NEXUS OS loses money. Token billing closes this gap and also enables the upsell path from Starter to Pro to Agency based on actual usage growth.

### Database Schema Changes

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN token_balance INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN token_plan_allowance INTEGER DEFAULT 100000;
ALTER TABLE users ADD COLUMN token_used_this_month INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN token_reset_date TIMESTAMP;
ALTER TABLE users ADD COLUMN byok_anthropic_key TEXT; -- encrypted at rest
ALTER TABLE users ADD COLUMN byok_openai_key TEXT;    -- encrypted at rest
ALTER TABLE users ADD COLUMN auto_refill_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN auto_refill_threshold_pct INTEGER DEFAULT 10;
ALTER TABLE users ADD COLUMN auto_refill_pack_id TEXT;
ALTER TABLE users ADD COLUMN monthly_spend_cap INTEGER DEFAULT 0; -- 0 = no cap

-- New table: token_transactions
CREATE TABLE token_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,          -- positive = credit, negative = debit
  type TEXT NOT NULL,               -- 'plan_allowance', 'pack_purchase', 'usage', 'refund'
  workflow_id TEXT,                 -- nullable, for usage attribution
  agent_id TEXT,                    -- nullable, for usage attribution
  model_used TEXT,                  -- e.g. 'claude-haiku', 'claude-sonnet', 'ollama'
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  markup_usd REAL DEFAULT 0,
  stripe_payment_id TEXT,           -- for pack purchases
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast user lookups and per-workflow attribution
CREATE INDEX idx_token_transactions_user_id ON token_transactions(user_id);
CREATE INDEX idx_token_transactions_workflow_id ON token_transactions(workflow_id);
CREATE INDEX idx_token_transactions_created_at ON token_transactions(created_at);
```

### Token Tracking Middleware

Every API call that invokes a model must go through a token middleware layer. This is implemented as an Express middleware wrapper around the Claude (and eventually OpenAI) client:

```javascript
// server/middleware/tokenTracker.js
export async function trackTokenUsage(userId, workflowId, agentId, modelCall) {
  const result = await modelCall();
  
  const inputTokens = result.usage?.input_tokens ?? 0;
  const outputTokens = result.usage?.output_tokens ?? 0;
  const model = result.model;
  
  // Calculate cost using internal pricing table
  const costUsd = calculateCost(model, inputTokens, outputTokens);
  const markupUsd = costUsd * MARKUP_RATE; // 0.25
  const totalCharge = costUsd + markupUsd;
  
  // Debit tokens from user balance
  await db.transaction(async (tx) => {
    await tx.run(
      `UPDATE users SET 
        token_used_this_month = token_used_this_month + ?,
        token_balance = token_balance - ?
       WHERE id = ?`,
      [inputTokens + outputTokens, Math.ceil(totalCharge * TOKEN_RATE), userId]
    );
    
    await tx.run(
      `INSERT INTO token_transactions 
        (id, user_id, amount, type, workflow_id, agent_id, model_used, input_tokens, output_tokens, cost_usd, markup_usd)
       VALUES (?, ?, ?, 'usage', ?, ?, ?, ?, ?, ?, ?)`,
      [nanoid(), userId, -Math.ceil(totalCharge * TOKEN_RATE), workflowId, agentId, model, inputTokens, outputTokens, costUsd, markupUsd]
    );
  });
  
  // Check thresholds and trigger warnings
  await checkTokenThresholds(userId);
  
  return result;
}
```

### Plan Limits and Token Allowances

| Plan | Monthly Tokens | Hard Stop Behavior |
|------|---------------|-------------------|
| Free | 100K | Hard block — must upgrade or buy pack |
| Starter | 1M | Soft warning at 80% and 95%, then block |
| Pro | 5M | Soft warning at 80% and 95%, then block (BYOK bypasses limits) |
| Agency | 20M | Soft warning at 80% and 95%, then block |

The "hard block" is intentional. Allowing automatic overage charges without explicit opt-in leads to the kind of surprise bills that destroyed Cursor's user trust in June 2025. The default must always be safe (block, warn, upgrade), with optional auto-refill for users who want uninterrupted operation.

### Warning System

Soft warnings trigger at 80% and 95% usage:
- At 80%: yellow banner in UI + optional email notification
- At 95%: orange banner with "Buy More" CTA prominently placed
- At 100%: red banner, agents stop running, all model calls return a friendly error with direct link to upgrade or buy pack

### Real-Time Token Counter UI

Every page shows a persistent token usage indicator:
- Sidebar widget: progress bar showing tokens used / total allowance
- Color transitions: green (0–79%) → yellow (80–94%) → orange (95–99%) → red (100%)
- Hover tooltip shows: used this month, remaining, reset date, purchase link
- Analytics page has full usage breakdown: daily/weekly/monthly chart, per-workflow attribution, per-agent attribution, model cost breakdown

### "Buy More" Token Pack Flow

One-click purchase from anywhere in the UI:
1. User clicks "Buy More" (from banner, sidebar, or usage page)
2. Modal shows pack options (1M / 5M / 20M / 100M)
3. User selects pack, clicks "Purchase"
4. Stripe Checkout opens (pre-populated with selected pack as line item)
5. On `checkout.session.completed` webhook: credit tokens to user account, create transaction record
6. Modal closes, token balance updates in real-time (WebSocket push or polling)

Stripe implementation for one-time purchases:
```javascript
// POST /api/tokens/purchase
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  customer: user.stripeCustomerId,
  line_items: [{
    price_data: {
      currency: 'usd',
      product_data: { 
        name: `${pack.tokenAmount.toLocaleString()} Token Pack`,
        description: `Never expires. Added immediately to your account.`
      },
      unit_amount: pack.priceUsd * 100,
    },
    quantity: 1,
  }],
  metadata: { 
    userId: user.id, 
    tokenAmount: pack.tokenAmount,
    packId: pack.id 
  },
  success_url: `${BASE_URL}/dashboard?purchase=success`,
  cancel_url: `${BASE_URL}/dashboard?purchase=cancelled`,
});
```

### BYOK (Bring Your Own Key)

Available on Pro and Agency tiers. When BYOK is enabled:
- User's API key is used for all model calls (encrypted at rest using AES-256)
- Tokens are still counted for analytics purposes but not billed
- Users see "BYOK Active" indicator in the token usage widget
- Usage still shows in analytics for workflow optimization

Encryption approach: never store keys in plaintext. Use `crypto.createCipheriv` with a server-side master key stored in Railway environment variables. The master key never lives in the database.

### Monthly Reset

A cron job runs at midnight on the first of each month:
```javascript
// Monthly token reset job
async function resetMonthlyTokens() {
  await db.run(`
    UPDATE users 
    SET token_used_this_month = 0,
        token_reset_date = DATE('now', '+1 month', 'start of month')
    WHERE subscription_status = 'active'
  `);
  
  // Credit new month's plan allowance
  await db.run(`
    UPDATE users 
    SET token_balance = token_balance + token_plan_allowance
    WHERE subscription_status = 'active'
  `);
}
```

### API Endpoints to Build

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/tokens/balance | Current balance, used, remaining, reset date |
| GET | /api/tokens/history | Transaction history with filters |
| GET | /api/tokens/analytics | Usage breakdown by workflow, agent, model |
| POST | /api/tokens/purchase | Create Stripe checkout for token pack |
| POST | /api/tokens/byok | Save/update BYOK API keys |
| GET | /api/tokens/byok/status | Check if BYOK is active and valid |
| POST | /api/tokens/auto-refill | Configure auto-refill settings |
| DELETE | /api/tokens/auto-refill | Disable auto-refill |

### Key Risks and Mitigations

**Risk:** Runaway costs if a bug causes a loop that makes unlimited model calls.
**Mitigation:** Hard per-request cap at the middleware level. If a single API call tries to consume more than 50K tokens, it is rejected regardless of user balance. This is separate from the user-level limits.

**Risk:** BYOK key leakage.
**Mitigation:** Keys are encrypted at rest, never logged, never returned in API responses (write-only from the user's perspective). Regular key rotation reminders in Settings.

**Risk:** Stripe webhook failures causing token credits not being applied.
**Mitigation:** Idempotency keys on all Stripe webhook handlers. Webhook event ID stored and checked before processing — duplicate webhooks are rejected. Dead-letter queue for failed processing.

---

## 6. Phase 3: Orchestrator Core — Multi-Agent Engine

**Priority:** NOW (parallel with Phase 2)
**Effort:** 2–3 weeks
**Revenue impact:** This is the core product value. Without it, NEXUS OS is a dashboard with a chatbot.

### What It Is and Why It Matters

The Boss Agent pattern is the most reliable approach to multi-agent coordination in production. The research is unambiguous: multi-agent systems fail at 41–86.7% rates without structured coordination (AugmentCode, 2025). The failure breakdown is: specification problems (41.8%), coordination failures (36.9%), verification gaps (21.3%). Without a well-designed orchestration core, NEXUS OS will produce bad outputs and erode user trust.

The good news: centralized orchestration (Boss Agent) limits error amplification to approximately 4.4x, compared to 17.2x for poorly coordinated "bag of agents" networks (DeepMind, 2025). The Boss Agent pattern is not just better — it is dramatically better, and it is exactly what NEXUS OS already has the right mental model for.

### Architecture Overview

```
                     User Input / Workflow Trigger
                              │
                              ▼
               ┌──────────────────────────┐
               │       BOSS AGENT         │
               │   (Claude Sonnet/Opus)   │
               │  - Task decomposition    │
               │  - Worker routing        │
               │  - Budget tracking       │
               │  - Error handling        │
               │  - HITL gate decisions   │
               │  - Output synthesis      │
               └───────────┬──────────────┘
                           │  Structured routing decisions
              ┌────────────┼────────────┬────────────┐
              ▼            ▼            ▼            ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
       │Researcher│ │  Coder   │ │  Writer  │ │  Art Gen │
       │  Worker  │ │  Worker  │ │  Worker  │ │  Worker  │
       └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
            │            │            │            │
            └────────────┴────────────┴────────────┘
                              │ Artifacts written to shared filesystem
                              ▼
               ┌──────────────────────────┐
               │    BOSS AGENT (again)    │
               │  Synthesizes final output│
               │  Runs Reviewer if needed │
               └──────────────────────────┘
                              │
                              ▼ (if HITL gate)
               ┌──────────────────────────┐
               │    HUMAN REVIEW QUEUE    │
               │  Approve / Edit / Reject │
               └──────────────────────────┘
```

### Framework Choice: LangGraph-Style Graph Orchestration

After reviewing all major frameworks (Claude Managed Agents, OpenAI Agents SDK, LangGraph, CrewAI, AutoGen, n8n, Dify.ai), the implementation approach for NEXUS OS should be **LangGraph-style graph orchestration** built in-house on top of a clean state management layer.

Reasons:
- LangGraph's graph-based model supports cycles (iterative refinement loops), which CrewAI and the OpenAI SDK do not
- The supervisor pattern from `langgraph-supervisor` library maps directly to the Boss Agent mental model
- Checkpointing to SQLite (already in use) or PostgreSQL is supported natively
- Human-in-the-loop requires a checkpointer — without it, `interrupt` calls are no-ops (per LangGraph docs)
- LangGraph is free and open source (MIT license)

The implementation does not need to import LangGraph directly — it can be a native TypeScript/JavaScript implementation of the same state graph pattern, integrated into the existing Express stack. The key patterns to replicate are:
1. Typed state schema with reducer functions (ensures concurrent updates from parallel workers don't cause data loss)
2. Checkpointing after each node (enables pause/resume and HITL gates)
3. `interrupt_before` / `interrupt_after` breakpoints for HITL
4. Conditional edges for routing logic

### Worker Agent Types

| Worker Type | Capabilities | Tools | Recommended Model |
|-------------|-------------|-------|------------------|
| Researcher | Web search, data gathering, competitive analysis, fact-finding | WebSearchTool, URLFetcher, DataExtractor | Claude Haiku (routing/search), Sonnet (synthesis) |
| Coder | Code generation, debugging, refactoring, code review | CodeExecutor, GitTool, FileTool | Claude Sonnet or Opus (correctness matters) |
| Writer | Content creation, copywriting, documentation, email drafts | TextFormatter, TemplateEngine | Claude Sonnet |
| Art Generator | Image generation for wallpapers, mockups, assets | DALL-E 3 API ($0.04–$0.12/image), Flux via FAL ($0.01–$0.04/image) | External image API |
| Reviewer | Quality checks, fact-checking, code review, output validation | All read-only tools | Claude Haiku (fast pass/fail) |
| Data Analyst | Number crunching, chart generation, statistical insights | DataProcessor, ChartBuilder, CSVParser | Claude Sonnet |
| Browser Agent | Web automation, form filling, data extraction | PlaywrightBridge, ScreenCapture | Claude Sonnet |

For Art Generator: at low volume (<1K images/month), use DALL-E 3 for simplicity and the best enterprise licensing terms. At high volume (>10K/month), self-hosted Flux/SD on an A10G GPU costs approximately $0.0002/image vs $0.04–0.12 for DALL-E 3 — a 200–600x cost reduction.

### Boss Agent Prompt Design

The Boss Agent system prompt is the primary control surface. It must be explicit about routing, budget, error handling, and HITL decisions:

```
You are the NEXUS OS Coordinator — the boss agent responsible for orchestrating all worker agents.

AVAILABLE WORKERS:
- ResearchWorker: web research, fact-finding, competitive analysis, data gathering
- CoderWorker: code generation, debugging, refactoring, code review
- WriterWorker: content creation, copywriting, documentation, email drafts
- ArtWorker: image generation from text descriptions
- ReviewerWorker: quality checks, validation, fact-checking
- AnalystWorker: data analysis, number crunching, chart generation
- BrowserWorker: web automation, form filling, data extraction

ROUTING RULES:
- Return routing decision as JSON: {"route": "WorkerName", "confidence": 0.0-1.0, "reason": "...", "subtask": "...", "parallel_with": [], "requires_approval": false}
- For multi-step tasks, route workers in logical order; use parallel_with for truly independent subtasks
- Scale effort: 1 worker for simple tasks, 2-4 for analysis, >5 only for genuinely complex multi-source tasks
- If confidence < 0.7, ask clarifying question before routing
- Mark requires_approval: true for: financial transactions, public-facing content, irreversible actions, anything touching real money

BUDGET:
- Maximum {MAX_WORKER_CALLS} worker calls per workflow run
- Write all large outputs to the shared filesystem; pass reference paths, not content
- Prefer parallel execution when workers are independent (saves time and often tokens)

ERROR HANDLING:
- If a worker fails, retry once with a more specific subtask
- If retry fails, route to a different capable worker or report partial completion to user
- Never silently drop results or fabricate outputs
```

### Routing Schema (Structured Output)

Using structured output prevents free-form routing decisions that are hard to log and debug:

```typescript
interface RoutingDecision {
  route: string;              // Worker name
  confidence: number;         // 0.0 to 1.0
  reason: string;             // Explanation (logged for debugging)
  subtask: string;            // Specific instruction for the worker
  parallel_with: string[];    // Other workers to run simultaneously
  requires_approval: boolean; // Flag for HITL gate
  max_tokens?: number;        // Optional worker-level token cap
}
```

### 4-Tier Model Routing

This is the most important margin-protection mechanism:

```
Tier 0 | Local (Ollama)     | Classification, routing decisions, summarization, text extraction
Tier 1 | Claude Haiku       | Structured tasks needing API quality, fast fact-checking
Tier 2 | Claude Sonnet      | Primary reasoning, code generation, multi-step synthesis
Tier 3 | Claude Opus        | Highest-stakes decisions, complex architecture planning, irreversible actions
```

The Boss Agent always routes at Tier 2 (Sonnet) or Tier 3 (Opus) for planning — the research confirms planning errors cascade, so the Boss is not where to cut costs. Worker agents are routed to the cheapest tier that can handle the task reliably. Classification tasks that previously cost $15/M tokens (Sonnet output) can run on local Ollama at $0.

This is the same strategy Cursor uses with "Auto" routing — route cheap tasks cheap, expensive tasks to expensive models, charge one unified credit rate. The difference: NEXUS OS will be transparent about it.

### Shared Workspace / Filesystem for Artifacts

Workers should never pass large content through conversation history. The research from Anthropic's multi-agent system is explicit: subagents write outputs directly to external storage (code, reports, data visualizations) and pass lightweight references (file paths or URLs) back to the coordinator. This prevents "game of telephone" token inflation.

Implementation:
- Shared workspace directory per workflow run: `/workspaces/{workflowRunId}/`
- Workers write files here: `research.md`, `code.py`, `analysis.json`, `output.png`
- Workers return: `{"artifact_path": "/workspaces/abc123/research.md", "summary": "Found 5 companies..."}`
- Boss Agent reads summaries, retrieves full artifacts only when needed for synthesis
- Workspace cleaned up after 24 hours (configurable retention)
- For Agency plan: persist workspaces for 30 days, browsable in UI

### Agent-to-Agent Communication

Message passing structure:

```typescript
interface HandoffPayload {
  task_id: string;             // Workflow run ID
  original_request: string;   // User's original request
  completed_steps: string[];  // What has been done so far (compressed)
  current_subtask: string;    // What this worker should do
  relevant_artifacts: string[]; // File paths from previous workers
  constraints: string[];      // Max length, format, tone, etc.
  deadline?: string;          // ISO timestamp if time-sensitive
}
```

Every handoff is logged to the database for the Audit Panel. The research finding is emphatic: "Most issues in multi-agent systems stem not from a lack of intelligence but from failures during handoffs" (AugmentCode, 2025). Explicit, compressed, isolated handoff payloads are the mitigation.

### Human-in-the-Loop (HITL) Gates

HITL is not optional for anything touching money or public outputs. The LangGraph pattern is clean:
- `interrupt_before: ["execute_action_node"]` — pause execution before this node
- State is checkpointed to SQLite with the workflow run ID
- User sees a review card in the Audit Panel: proposed action, context, Approve / Edit / Reject buttons
- On approval: `graph.invoke(Command(resume: {approved: true, edited_content: null}), config)`
- On edit: user edits the proposed output in the UI, submits edited version
- On rejection: workflow marks step as rejected with user feedback, Boss Agent adapts

HITL triggers automatically for:
- Any action that posts to a public platform (Fiverr delivery, social media post)
- Any financial transaction or payment initiation
- Any irreversible file deletion or destructive operation
- Any code execution in a non-sandbox environment
- Any action the Boss Agent flags with `requires_approval: true`

### Execution Modes

Three execution modes selectable per workflow:
1. **Sequential** — agents run one after another in defined order
2. **Parallel** — independent agents run simultaneously (requires explicit "no shared state during execution" verification)
3. **Conditional** — branching based on agent output (implemented as conditional edges in the graph)

Parallel execution using Promise.all:
```typescript
// Run independent workers in parallel
const [researchResult, analysisResult] = await Promise.all([
  runWorker('ResearchWorker', handoff_1, workflowRunId),
  runWorker('AnalystWorker', handoff_2, workflowRunId),
]);
```

### Cost Controls

Per-workflow budget caps enforced before execution starts:
- `max_worker_calls`: default 10, configurable per workflow (1–50)
- `max_tokens_per_agent`: default 50K, configurable
- `max_workflow_tokens`: hard cap on total token spend for this run
- `kill_switch`: manual stop button in workflow detail view, sends kill signal to running agents
- `timeout_seconds`: workflow is killed and marked as failed if exceeds this time

### Database Schema for Orchestrator

```sql
-- Workflow runs
CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, running, paused, completed, failed, killed
  execution_mode TEXT DEFAULT 'sequential',
  input_data TEXT,               -- JSON: user inputs
  final_output TEXT,             -- JSON: synthesized result
  total_tokens_used INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error TEXT,
  hitl_required BOOLEAN DEFAULT false,
  hitl_resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Individual agent executions within a run
CREATE TABLE agent_executions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  worker_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, running, completed, failed, skipped
  input_payload TEXT,             -- JSON: HandoffPayload
  output TEXT,                    -- Agent's response (summary only; full output in filesystem)
  artifacts TEXT,                 -- JSON array of artifact paths
  model_used TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error TEXT,
  retry_count INTEGER DEFAULT 0
);

-- Checkpoints for pause/resume and HITL
CREATE TABLE workflow_checkpoints (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  checkpoint_type TEXT,    -- 'hitl_gate', 'manual_pause', 'error_recovery'
  state_snapshot TEXT,     -- JSON: full graph state at checkpoint
  pending_action TEXT,     -- What was about to happen (for HITL review)
  resolved BOOLEAN DEFAULT false,
  resolution TEXT,         -- 'approved', 'edited', 'rejected'
  resolved_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Key Risks and Mitigations

**Risk:** Context window overflow in long-running agents.
**Mitigation:** Summarize completed phases and store in external memory before proceeding. Spawn fresh subagents with clean context windows + structured handoff summaries. Use sliding window summarization: keep recent N messages verbatim, summarize older messages.

**Risk:** Tool call loops (agent stuck in repeated calls without converging).
**Mitigation:** Hard limit of `max_tool_calls` per agent (default 20). Tool call deduplication: detect and short-circuit identical repeated calls. Exponential backoff on tool failures (not immediate retry). Per-request cost budgets with hard caps enforced at middleware.

**Risk:** Boss Agent as single point of failure.
**Mitigation:** Use high-capability model (Sonnet minimum, Opus for complex plans) for Boss. Implement plan validation step before dispatching workers: Boss produces structured plan → validator checks for completeness → then dispatch. Two-phase approach: Plan → Validate → Execute.

---

## 7. Phase 4: Visual Workflow Editor

**Priority:** NEXT (after Phase 2 + 3 are stable)
**Effort:** 2–3 weeks
**Revenue impact:** Key differentiator — this is what users see and what gets shared

### What It Is and Why It Matters

The visual workflow editor is the most visible feature in NEXUS OS. It is what appears in screenshots, demos, YouTube tutorials, and Product Hunt posts. n8n's entire brand is built around their workflow canvas. The editor must look professional, work reliably, and feel responsive — even with complex workflows.

The editor is how users build workflows without writing code. Instead of configuring agents in forms, they drag nodes onto a canvas, connect them with wires, and watch data flow between them in real time. It is the "aha moment" that converts free users to paid, and it is the feature that generates the most community content.

### Technology Choice: React Flow

Use `@xyflow/react` (React Flow). This is the definitive choice, and the research confirms it: React Flow is used by Stripe, Typeform, Retool, n8n (newer versions), and hundreds of SaaS products. It has the best documentation, the largest community, full TypeScript support, and React 12 introduced full SSR support.

Critical performance note from the research: wrap every custom node in `React.memo()`. Without this, dragging a node causes all nodes to re-render — the canvas becomes unusable above 20–30 nodes. This is not optional.

```typescript
// Every custom node MUST be wrapped in React.memo
const AgentNode = React.memo(({ data, selected }: NodeProps) => {
  return (
    <div className={`agent-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="agent-node-header">
        <AgentIcon type={data.agentType} />
        <span>{data.label}</span>
      </div>
      <div className="agent-node-status">{data.status}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
```

Installation:
```
npm install @xyflow/react
```

### Node Types

**Trigger Nodes** (green) — start execution:
- Webhook trigger (receives POST/GET from external systems)
- Schedule trigger (cron expression)
- Manual trigger (click to run button)
- Event trigger (workflow completion, new Fiverr order, etc.)

**Agent Nodes** (blue) — worker agent invocations:
- One node type per worker type (Researcher, Coder, Writer, Art Generator, Reviewer, Analyst, Browser)
- Shows agent status during execution (idle, running, success, error)
- Click to expand: view input/output, token usage, model used

**Logic Nodes** (purple):
- If/Else: conditional branching based on expression
- Switch: multi-branch routing on a value
- Merge: combine multiple branches back into one
- Delay: pause execution for N seconds/minutes
- Loop: iterate over an array, running downstream for each item

**Integration Nodes** (orange):
- HTTP Request: call any REST API
- Database Query: SELECT/INSERT/UPDATE
- File Operations: read/write/transform files
- Email Send: SendGrid integration
- Slack Message: post to channel
- Webhook Callback: trigger an outbound webhook

**Output Nodes** (teal):
- Return to User: sends result back to the UI
- Save to File: persist output to shared workspace
- Post to Platform: Fiverr delivery, social media, etc.
- Trigger Workflow: chain to another workflow

### Color-Coded Connection Types (ComfyUI Pattern)

The research highlights ComfyUI's transparent data flow design as a gold standard: wires show actual data types by color, making it immediately obvious what flows where. Adopt the same principle:

| Wire Color | Data Type |
|-----------|-----------|
| White | Execution control (when to run) |
| Blue | Text/string data |
| Green | Structured JSON |
| Orange | File/artifact reference |
| Red | Error/exception |
| Purple | Boolean condition |

Only compatible types can connect. Attempting to connect incompatible types shows a tooltip: "Cannot connect JSON output to text input — add a Transform node."

### Workflow Controls

These controls are non-negotiable. The research identifies pause/resume as a cross-editor pattern used by Temporal.io, Kestra, ServiceNow, HighLevel, and n8n:

- **Run** — start workflow execution
- **Pause** — freeze mid-execution; state is checkpointed to SQLite; animated nodes freeze with a "paused" glow
- **Resume** — continue from checkpoint
- **Stop** — kill workflow; emit kill signal; mark as stopped; offer rollback if configured
- **Step-by-step mode** — advance one node at a time; useful for debugging; each step requires a manual "advance" click

Pause/Resume implementation:
```typescript
// Signal-based pause (same pattern as Temporal.io)
interface WorkflowRunControl {
  runId: string;
  signal: 'pause' | 'resume' | 'stop' | 'step';
}

// Workflow engine checks this flag before each node execution
async function shouldContinue(runId: string): Promise<'continue' | 'pause' | 'stop'> {
  const run = await db.get('SELECT control_signal FROM workflow_runs WHERE id = ?', runId);
  return run.control_signal ?? 'continue';
}
```

### Real-Time Execution Visualization

This is what makes the editor feel alive and professional:
- **Animated edges during execution:** SVG dashoffset animation on the path stroke, indicating data flow direction and rate
- **Node status colors:** idle (gray border), running (blue pulsing glow), success (green), error (red)
- **Token counter on each node:** small badge showing tokens consumed by this execution
- **Data preview panels:** hover over a node's output handle to see the last output JSON in a tooltip
- **Execution timeline:** bottom panel showing gantt-style view of node execution durations

Implementation of animated edges in React Flow:
```typescript
const AnimatedEdge = React.memo(({ id, ...props }: EdgeProps) => {
  const { data } = props;
  const isRunning = data?.status === 'running';
  
  return (
    <BaseEdge
      {...props}
      style={{
        strokeDasharray: isRunning ? '8 4' : undefined,
        animation: isRunning ? 'dash 1s linear infinite' : undefined,
        stroke: getEdgeColor(data?.dataType),
      }}
    />
  );
});
```

### Template System

Templates are the viral growth mechanism. Notion's template gallery is their #1 source of new user acquisition. Every template page is a landing page indexed by Google.

Template types:
- **Platform pre-built:** shipped with NEXUS OS, maintained by the team (Fiverr automation, content pipeline, code review, competitive analysis, newsletter writer, etc.)
- **User-saved:** any user can save their workflow as a personal template
- **Marketplace templates:** when Phase 5 is live, community templates appear here with one-click install

Template implementation:
- Templates are stored as JSON (workflow graph state: nodes, edges, configuration)
- Export: `GET /api/workflows/{id}/export-template` → returns JSON blob
- Import: `POST /api/workflows/import-template` → creates new workflow from JSON
- Public gallery: all published templates are SEO-indexed pages
- "Use Template" button creates a copy in the user's workspace — they don't edit the original

### Version History

Every workflow save creates a version snapshot. Diffs are shown between versions. One-click restore to any prior version:

```sql
CREATE TABLE workflow_versions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  graph_state TEXT NOT NULL,     -- JSON: full node/edge state
  label TEXT,                    -- Optional user-defined label
  created_by TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Diff view: compare two versions side by side. Added nodes highlighted green, removed nodes red, modified nodes yellow. Implemented using a simple JSON diff library (`jsondiffpatch` or similar).

### Undo/Redo

Session-scoped history stack. Each change to the canvas is a command object:
```typescript
interface CanvasCommand {
  type: 'add_node' | 'delete_node' | 'move_node' | 'add_edge' | 'delete_edge' | 'update_config';
  before: Partial<GraphState>;
  after: Partial<GraphState>;
}

// Use useReducer for undo/redo state management
const [history, dispatch] = useReducer(historyReducer, { past: [], present: initialState, future: [] });
```

Keyboard shortcuts: `Ctrl+Z` / `Cmd+Z` (undo), `Ctrl+Y` / `Cmd+Shift+Z` (redo). History resets on page refresh. Version History (persistent snapshots) is separate from session undo/redo.

### Database Schema Changes

```sql
-- Add to workflows table
ALTER TABLE workflows ADD COLUMN canvas_state TEXT; -- JSON: React Flow state
ALTER TABLE workflows ADD COLUMN is_template BOOLEAN DEFAULT false;
ALTER TABLE workflows ADD COLUMN template_category TEXT;
ALTER TABLE workflows ADD COLUMN template_description TEXT;
ALTER TABLE workflows ADD COLUMN is_public BOOLEAN DEFAULT false;
ALTER TABLE workflows ADD COLUMN fork_count INTEGER DEFAULT 0;
ALTER TABLE workflows ADD COLUMN use_count INTEGER DEFAULT 0;
```

### API Endpoints to Build

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/workflows/{id}/canvas | Get canvas state (nodes, edges, config) |
| PUT | /api/workflows/{id}/canvas | Save canvas state (auto-version) |
| GET | /api/workflows/{id}/versions | List version history |
| GET | /api/workflows/{id}/versions/{versionId} | Get specific version |
| POST | /api/workflows/{id}/restore/{versionId} | Restore to version |
| POST | /api/workflows/{id}/export-template | Export as template JSON |
| POST | /api/workflows/import-template | Create workflow from template JSON |
| GET | /api/templates | List public templates |
| POST | /api/workflows/{id}/run | Start execution |
| POST | /api/workflows/runs/{runId}/control | Pause/resume/stop |
| GET | /api/workflows/runs/{runId}/status | Real-time execution status (WebSocket preferred) |

---

## 8. Phase 5: Public Marketplace

**Priority:** NEXT (can begin scaffolding while Phase 3/4 are in progress)
**Effort:** 2–3 weeks for MVP
**Revenue impact:** This is the biggest long-term competitive moat

### What It Is and Why It Matters

Every competitor has a free content layer. Zero percent revenue sharing to creators. This is not an oversight — it is a deliberate choice to acquire content cheaply and treat creators as free supply.

NEXUS OS will be the first AI agent platform where creators earn real money. The research analysis is clear: this is the unactivated marketplace network effect. A revenue-sharing marketplace:
- Attracts the best builders (economic incentive — they go where the money is)
- Drives quality (competition and reviews — creators have skin in the game)
- Creates organic marketing (creators promote their own listings)
- Generates network effects (more quality agents → more users → more creators)
- Builds a moat that no open-source project can replicate (you can fork code but you cannot fork a creator economy)

The 85/15 revenue split matches Figma Community and aligns with Shopify App Store. It is the most creator-friendly split in the AI space. Figma had a creator make $33K+ on a single plugin using this model.

### Marketplace Categories

| Category | What's Sold | Price Range |
|----------|------------|-------------|
| Workflow Templates | Pre-built automations (Fiverr pipeline, content factory, code review, etc.) | Free – $49 |
| Custom AI Agents | Specialized agents with custom system prompts, tools, knowledge bases | $5 – $99/mo |
| Tool Plugins | Custom integrations for any API, database, or service | Free – $29 |
| Prompt Packs | Curated prompt libraries for specific use cases | $5 – $29 |
| Theme Packs | Wallpapers, color schemes, layout presets | Free – $9 |

### Seller Experience

Every seller gets a dedicated storefront with:
- Listing management: create, edit, publish, unpublish
- Version management: push updates, buyers notified of major updates
- Analytics dashboard: sales volume, revenue, install counts, ratings distribution, geographic breakdown
- Revenue withdrawals: available 30 business days after sale, weekly maximum, sent via Stripe Connect
- Seller verification badges: "Verified Creator" after identity verification; "Top Creator" for sustained quality/sales

Seller analytics are a competitive moat. The research is emphatic: "Seller analytics are consistently the #1 complaint on every platform." GPT Store's analytics were "rough estimates" capped at 10,000 chats. Epic's Fab was "basic as can be" for years. NEXUS OS will ship world-class seller analytics from day one.

Stripe Connect for payouts:
```javascript
// Create connected account for seller
const account = await stripe.accounts.create({
  type: 'express',
  email: seller.email,
  capabilities: { transfers: { requested: true } }
});

// Pay out to seller after platform fee
const transfer = await stripe.transfers.create({
  amount: Math.floor(saleAmount * 0.85 * 100), // 85% to seller
  currency: 'usd',
  destination: seller.stripeAccountId,
  transfer_group: `purchase_${purchaseId}`,
});
```

### Buyer Experience

Discovery must be transparent and ungameable. The GPT Store's opaque ranking algorithm was gamed immediately — a top-ranked GPT was revealed as a lead-gen app that cross-promoted itself inside 11 other GPTs. Adopt a transparent ranking formula: recency × quality (rating) × popularity (installs) × freshness (last updated).

**Browsing:** Category pages, trending (last 7 days), top-rated (all time), newest
**Search:** Full-text search with filters: price range (free / paid / all), category, minimum rating, verified sellers only
**One-click install:** Purchased item appears directly in workspace. For free items: no checkout. For paid: Stripe Checkout, then auto-install on success.
**Reviews and ratings:** 1–5 stars + written review. Reviews require a verified purchase. Minimum 24-hour hold before review can be posted (prevents immediate brigade attacks).
**"Try before you buy":** Free trial mode for paid agents. User can run the agent with limited inputs (e.g., 3 trial runs) before purchasing. Trial runs are counted against free tier token allowance.

### Custom AI Builder

Deep AI customization that goes beyond basic agent creation:

**What users can configure:**
- System prompt / personality (full control with character limit guide)
- Which tools the agent can access (granular per-tool permission)
- Model selection: Claude Haiku / Sonnet / Opus, or local Ollama models
- Temperature (0.0–1.0), max tokens, response style (concise / detailed / structured)
- Knowledge base / RAG: upload documents the agent references (PDF, MD, TXT, DOCX)
- Custom avatar (upload image or use AI-generated)
- Custom name and short description

**Fork and Modify:** Any marketplace agent can be cloned to the user's workspace and modified. The original creator is credited ("Forked from [CreatorName]'s [AgentName]"). Forked agents are independent — changes to the fork do not affect the original.

**Agent Combos:** Chain multiple custom agents into a workflow and sell the complete package. Example: a "Cold Email Factory" that combines a Researcher agent (finds prospect info) + a Writer agent (drafts personalized email) + a Reviewer agent (checks tone and accuracy) sold as one SKU.

### Custom Tool SDK (Bring Your Own Tools)

The research finding from the marketplace SDK analysis: "Authentication abstraction is the biggest developer value-add." Zapier's entire value proposition is "we handle all OAuth flows." The NEXUS OS Tool SDK must handle authentication so tool developers don't have to.

**Tool registration format (JSON Schema-based):**

```json
{
  "name": "Airtable Record Creator",
  "description": "Creates a record in an Airtable base. Use when the user wants to log data to Airtable.",
  "version": "1.0.0",
  "author": "your-user-id",
  "endpoint": "https://your-api.com/airtable/create",
  "auth": {
    "type": "oauth2",
    "provider": "airtable",
    "scopes": ["data.records:write"]
  },
  "input_schema": {
    "type": "object",
    "properties": {
      "base_id": { "type": "string", "description": "Airtable Base ID" },
      "table_name": { "type": "string" },
      "fields": { "type": "object" }
    },
    "required": ["base_id", "table_name", "fields"]
  },
  "output_schema": {
    "type": "object",
    "properties": {
      "record_id": { "type": "string" },
      "created_at": { "type": "string" }
    }
  }
}
```

**Supported tool types:**
- REST API endpoints (HTTPS, GET/POST/PUT/DELETE, any headers)
- Webhooks (tool receives a payload, NEXUS OS is the caller)
- Python/JS scripts (run in a sandboxed container — Docker-based with strict resource limits)
- Database connectors (PostgreSQL, MySQL, Supabase — read-only or configurable)
- Browser automation scripts (Playwright, headless Chrome via cloud provider)
- Other AI models (OpenAI, Gemini, Mistral, local Ollama models)

**OAuth integration:** NEXUS OS implements a central OAuth broker. When a tool requires OAuth:
1. User connects their account once ("Connect Airtable" button)
2. OAuth token stored securely in NEXUS OS credentials vault
3. All tool calls using that connection automatically inject the token
4. User never manages tokens manually

**Tool Marketplace:** Custom tools can be published to the marketplace as "Tool Plugins." Other users install the plugin and connect their own account. The tool creator earns 85% of any sale price, same as agents and templates.

### Growth Strategy: Supply-Side First

The research is unambiguous: 90% of two-sided marketplaces that fail cite supply generation as the primary issue. Uber hired drivers by the hour. Airbnb organized host meetups city-by-city. Etsy's founder recruited vendors face-to-face at craft fairs.

**Phase 1 (0–6 months): Manually seed supply**
- Reach out directly to Dify power users, Flowise builders, Wordware creators, AgentGPT refugees
- Pay 50–100 creators to build the first showcase agents (own the quality bar)
- White-glove onboarding: get each creator to their first successful sale
- Goal: 100 high-quality, diverse agents before opening marketplace publicly

**Phase 2 (6–12 months): Creator economics flywheel**
- Guaranteed minimum earnings for top creators' first 3 months (investment in creator retention)
- Creator dashboard with real-time analytics
- Featured Creator program: weekly spotlights, blog interviews
- Creator accelerator: office hours, priority feature access

**Phase 3 (12–24 months): Self-sustaining**
- Creator competition creates quality pressure
- User reviews create social proof that drives creator marketing
- SEO: each marketplace listing is an indexed page for specific agent use cases

### Database Schema for Marketplace

```sql
CREATE TABLE marketplace_listings (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  listing_type TEXT NOT NULL,  -- 'workflow', 'agent', 'tool', 'prompt_pack', 'theme'
  price_usd REAL DEFAULT 0,    -- 0 = free
  price_type TEXT DEFAULT 'one_time', -- 'one_time', 'monthly', 'free'
  content_ref TEXT NOT NULL,   -- JSON or reference to workflow/agent definition
  version TEXT DEFAULT '1.0.0',
  is_published BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  install_count INTEGER DEFAULT 0,
  rating_avg REAL DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  preview_images TEXT,         -- JSON array of image URLs
  tags TEXT,                   -- JSON array
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE marketplace_purchases (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  platform_fee_usd REAL NOT NULL,
  seller_payout_usd REAL NOT NULL,
  stripe_payment_id TEXT,
  stripe_transfer_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE marketplace_reviews (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  purchase_id TEXT NOT NULL,
  rating INTEGER NOT NULL,     -- 1-5
  review_text TEXT,
  is_verified_purchase BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE custom_tools (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  tool_spec TEXT NOT NULL,     -- JSON: full tool definition including schema
  auth_type TEXT,              -- 'none', 'api_key', 'oauth2', 'basic'
  is_published BOOLEAN DEFAULT false,
  listing_id TEXT,             -- nullable: if published to marketplace
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 9. Phase 6: Wallpaper & Customization System

**Priority:** SOON (after Phase 3/4 are stable)
**Effort:** 3–5 days
**Revenue impact:** Retention driver, Opera GX-style "this is my space" identity

### What It Is and Why It Matters

Opera GX's wallpaper system is the prime reference: three modes (static, animated video, live interactive), user uploads, curated gallery, and settings that feel deeply personal. This feature does not directly generate revenue but it dramatically increases retention. When a platform feels like yours — your wallpaper, your accent color, your layout — you don't switch to a competitor. The switching cost is the loss of a personalized environment.

This is also a Phase 5 marketplace category (Theme Packs) that can generate direct revenue.

### Wallpaper Architecture

```css
/* The layered architecture */

/* Layer 0: Wallpaper (fixed, behind everything) */
.nexus-wallpaper-layer {
  position: fixed;
  inset: 0;
  z-index: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

/* Layer 1: Dark/light tint overlay for readability */
.nexus-tint-layer {
  position: fixed;
  inset: 0;
  z-index: 1;
  background: rgba(0, 0, 0, var(--wallpaper-tint-opacity, 0.4));
}

/* Layer 2: Glassmorphism panels */
.panel, .card, .sidebar, .header {
  background: rgba(var(--panel-bg-rgb), var(--panel-bg-opacity, 0.08));
  backdrop-filter: blur(var(--glass-blur, 12px));
  -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
  border: 1px solid rgba(255, 255, 255, var(--glass-border-opacity, 0.15));
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
```

The glassmorphism rules from the research: blur radius 10–30px (12px is the standard), background opacity 0.05–0.25, border at 1px solid rgba(255,255,255,0.2). Always maintain WCAG 4.5:1 contrast ratio for text. Use `@supports (backdrop-filter: blur(10px))` for progressive enhancement — browsers without support get a higher-opacity solid background as fallback.

### Video/Animated Backgrounds

```html
<!-- Video wallpaper implementation -->
<div class="nexus-wallpaper-layer">
  <video 
    autoplay 
    muted 
    loop 
    playsinline
    class="video-wallpaper"
  >
    <source src="{wallpaperUrl}" type="video/webm">
  </video>
</div>
```

Video format: WebM for best compression. Always `muted` (autoplay requires muted in most browsers). Pause video when browser tab is inactive to save CPU:
```javascript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) videoEl.pause();
  else videoEl.play();
});
```

For GIF wallpapers: convert to WebM server-side on upload (ffmpeg) for better performance. A 10MB GIF can become a 1MB WebM.

### AI Wallpaper Generation

User types a description → AI generates a wallpaper → user previews → user applies.

Implementation:

```javascript
// POST /api/wallpaper/generate
async function generateWallpaper(userId, prompt) {
  // Enhance prompt for wallpaper context
  const enhancedPrompt = await enhanceWallpaperPrompt(prompt); // local Haiku call
  
  // Generate image
  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: enhancedPrompt,
    n: 1,
    size: "1792x1024",  // landscape wallpaper format
    quality: "hd",
    style: "vivid",
    response_format: "url"
  });
  
  // Download and store in user's wallpaper storage
  const imageUrl = await downloadAndStore(response.data[0].url, userId);
  
  // Deduct tokens (or bill separately if over free limit)
  await chargeWallpaperGeneration(userId);
  
  return { imageUrl, previewUrl: imageUrl };
}
```

Pricing for AI wallpaper generation:
- DALL-E 3 HD at 1792x1024: $0.12/image
- Charge users 500 tokens per generation (about $0.10 equivalent) — small enough to be generous, covers cost
- Free tier gets 2 generations/month. Paid tiers get 10–50/month depending on plan.
- For high volume: self-hosted Flux via FAL at ~$0.01–0.04/image reduces costs significantly

### Curated Gallery

Ship with 20–30 high-quality wallpapers in categories:
- Abstract / geometric
- Dark cyberpunk / neon
- Minimal / clean
- Space / cosmic
- Nature / landscape
- Animated (looping video)

These are pre-generated using DALL-E 3 or Flux and stored in a CDN. They are the default options for new users — zero generation cost at runtime.

### Custom Accent Colors

User can select or input a custom accent color (hex, HSL, or color picker). The accent color is applied via CSS custom properties:

```javascript
document.documentElement.style.setProperty('--accent', userColor);
document.documentElement.style.setProperty('--accent-hover', shadeColor(userColor, -10));
document.documentElement.style.setProperty('--accent-active', shadeColor(userColor, -20));
```

Auto-detect accent color from wallpaper: extract dominant color from the wallpaper image using a canvas sampling algorithm (no external library needed — sample 50 pixels, find median non-neutral color). Offer this as "Auto" accent with option to override.

### Database Schema

```sql
ALTER TABLE users ADD COLUMN wallpaper_type TEXT DEFAULT 'preset'; -- 'preset', 'upload', 'generated', 'none'
ALTER TABLE users ADD COLUMN wallpaper_url TEXT;
ALTER TABLE users ADD COLUMN wallpaper_tint_opacity REAL DEFAULT 0.4;
ALTER TABLE users ADD COLUMN glass_blur INTEGER DEFAULT 12;
ALTER TABLE users ADD COLUMN accent_color TEXT DEFAULT '#6366f1';
ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'dark'; -- kept from Phase 1
ALTER TABLE users ADD COLUMN layout_density TEXT DEFAULT 'comfortable'; -- 'compact', 'comfortable'

CREATE TABLE user_wallpapers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT,
  url TEXT NOT NULL,
  type TEXT NOT NULL, -- 'upload', 'generated', 'preset'
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 10. Phase 7: Local AI Integration

**Priority:** SOON (high value for power users and enterprise)
**Effort:** 1–2 weeks
**Revenue impact:** Power user magnet, enterprise differentiator, reduces our API costs via smart routing

### What It Is and Why It Matters

Local AI integration gives users three operating modes:
1. **API Mode (default):** Uses NEXUS OS managed endpoints; tokens tracked and billed per Phase 2
2. **Local Mode:** User connects their own running local model server; tokens tracked for analytics but not billed
3. **Hybrid Mode:** Smart routing — simple tasks go to local models (free), complex tasks go to cloud (billed)

This is the feature that attracts privacy-conscious enterprise users, power users who want zero marginal cost, and developers who want to run open-source models. Claude Code uses exactly this architecture: local for simple routing and summarization, cloud for reasoning.

### Multi-Server Detection

The detection runs automatically when the user opens Settings → AI Configuration. It probes all known local server endpoints in parallel with a 1.5-second timeout:

```javascript
const LOCAL_AI_SERVERS = [
  { name: 'Ollama',    url: 'http://localhost:11434/api/version', port: 11434, apiPath: '/api/chat' },
  { name: 'LM Studio', url: 'http://localhost:1234/v1/models',   port: 1234,  apiPath: '/v1/chat/completions' },
  { name: 'Jan',       url: 'http://localhost:1337/v1/models',   port: 1337,  apiPath: '/v1/chat/completions' },
];

async function detectLocalAI() {
  const results = await Promise.allSettled(
    LOCAL_AI_SERVERS.map(s => 
      fetch(s.url, { signal: AbortSignal.timeout(1500) })
    )
  );
  
  return LOCAL_AI_SERVERS
    .filter((_, i) => results[i].status === 'fulfilled')
    .map(s => ({ ...s, detected: true }));
}
```

### CORS Handling

The research identifies CORS as the main integration hurdle: browsers block cross-origin requests from web apps to localhost. Solutions in priority order:

**For production deployment (nexus-os-production-50a1.up.railway.app):**
The web app runs on a remote origin, so direct browser-to-localhost requests are blocked regardless of CORS settings. Solution: an Express proxy endpoint on the NEXUS OS server that forwards to the user's local model:
```javascript
// Users configure their local server's external-facing IP or use a reverse tunnel (ngrok, Cloudflare Tunnel)
// This is documented clearly in the setup guide
```

**For self-hosted / local development:**
Configure Ollama CORS: `OLLAMA_ORIGINS=https://nexus-os-production-50a1.up.railway.app ollama serve`
Or use the Vite dev proxy during development.

**User setup guide:** The Settings → Local AI page includes a step-by-step setup guide:
1. Install Ollama (link)
2. Run `OLLAMA_ORIGINS=https://nexus-os-production-50a1.up.railway.app ollama serve` (copy button)
3. Pull a model: `ollama pull llama3.2` (copy button)
4. Click "Detect Local Servers" in NEXUS OS
5. Select which tasks to route locally

### Hybrid Mode Routing Logic

The 4-tier routing from the research:

```
Tier 0 (Local/Ollama)   → Classification, routing, summarization, extraction, keyword tagging
Tier 1 (Claude Haiku)   → Structured tasks needing API quality, sentiment analysis, short answers
Tier 2 (Claude Sonnet)  → Primary reasoning, code generation, multi-step synthesis, long-form writing
Tier 3 (Claude Opus)    → Highest-stakes decisions, complex architecture, irreversible actions
```

The routing decision is made by the task complexity classifier running on Tier 0 (local, free):

```typescript
interface TaskClassification {
  complexity: 'simple' | 'medium' | 'complex' | 'critical';
  requires_web_knowledge: boolean;
  is_code_task: boolean;
  token_estimate: number;
}

async function classifyAndRoute(task: string, localServers: LocalServer[]): Promise<ModelTier> {
  if (localServers.length > 0) {
    // Use local model to classify task (free)
    const classification = await callLocalModel(task, 'classify_task');
    
    if (classification.complexity === 'simple' && !classification.requires_web_knowledge) {
      return { tier: 0, model: localServers[0].modelName, billed: false };
    }
  }
  
  // Escalate to cloud based on complexity
  if (classification.complexity === 'critical') return { tier: 3, model: 'claude-opus-4-5', billed: true };
  if (classification.complexity === 'complex') return { tier: 2, model: 'claude-sonnet-4-5', billed: true };
  return { tier: 1, model: 'claude-haiku-4-5', billed: true };
}
```

### Token Tracking for Local Models

Local tokens are tracked for analytics but not charged. This is important for:
- Workflow optimization (users can see what they would have paid without local AI)
- Showing the "savings dashboard": "You've saved $47.20 this month by routing to local models"
- Usage analytics still work correctly even with local routing

### Hardware Requirements Reference

Show this in the Local AI settings page so users understand what they need:

| Model Size | Min VRAM | Recommended VRAM | Inference Speed |
|-----------|---------|-----------------|----------------|
| 1B–3B | 2–4 GB | 6 GB | 50–200+ tok/s |
| 7B–8B | 6–8 GB (Q4) | 12–16 GB | 20–80 tok/s |
| 13B–15B | 10–12 GB (Q4) | 16–24 GB | 10–40 tok/s |
| 30B–34B | 20–24 GB (Q4) | 32–48 GB | 5–20 tok/s |
| 70B | 40–48 GB (Q4) | 80 GB | 1–10 tok/s |

Minimum useful local setup: 8 GB VRAM + 16 GB RAM (runs 7B models well). Sweet spot (2025): 12–16 GB VRAM.

Apple Silicon note: M-series unified memory is excellent for local AI. An M4 Ultra (192 GB) can run 70B models natively. Best price-to-performance for local AI work.

### Claude Code-Style Features

For power users and developers, Phase 7 also includes:
- **Terminal in browser:** iframe-wrapped web terminal (using xterm.js + node-pty on the backend) for running commands against the shared workspace
- **File tree explorer:** sidebar file browser for the shared workspace, with inline editing
- **Git integration:** show git status, stage files, write commit messages (AI-assisted), push to GitHub — all from within NEXUS OS
- **Code execution sandbox:** safe containerized environment for running code generated by the Coder worker

---

## 11. Phase 8: Mobile Responsive Layout & PWA

**Priority:** NEXT (can be built in parallel with Phase 3/4)
**Effort:** 1 week
**Revenue impact:** Doubles the accessible user base; monitoring workflows while away from desk is a genuine use case

### What It Is and Why It Matters

The majority of daily active use of NEXUS OS will be on desktop — building workflows, configuring agents, reviewing marketplace listings. But users need mobile access for monitoring running workflows, receiving HITL notifications, reviewing agent outputs, and quick Jarvis queries.

The industry standard, confirmed by the research on n8n, Retool, and Appsmith: on mobile, provide read-only monitoring + execution control (start/stop/proceed/approve HITL). Do not attempt to make the full workflow editor canvas work on mobile — it is impractical on small screens and all major competitors agree. n8n's mobile experience is "monitor and trigger" only. Retool built a completely separate mobile app product. Appsmith uses intent-based auto-layouts but doesn't offer a mobile-quality canvas editor.

### Mobile Layout

Auto-detect via `useMediaQuery` hook (breakpoint: 640px). Below 640px, switch to mobile layout:

```typescript
// Custom hook for responsive detection
function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}
```

**Navigation:** Replace sidebar with bottom tab bar (5 tabs maximum). All tab targets must be minimum 48×48dp (Android) / 44×44pt (iOS). Active state: icon + label + accent color. Hide on downward scroll, reveal on upward scroll to maximize content space.

Bottom tabs:
1. Dashboard (home icon) — KPI cards, recent activity
2. Workflows (lightning icon) — workflow list, run/stop controls
3. Agents (robot icon) — agent status, recent outputs
4. Jarvis (orb icon) — full-screen chat, becomes the FAB when scrolling
5. More (hamburger) — analytics, marketplace, settings, token usage

**Tailwind implementation:**
```jsx
{/* Desktop sidebar */}
<aside className="hidden md:flex flex-col w-64 bg-sidebar">
  <SidebarNavigation />
</aside>

{/* Mobile bottom nav */}
<nav className="flex md:hidden fixed bottom-0 left-0 right-0 h-16 bg-panel border-t z-50">
  <MobileTabBar tabs={mobileTabs} />
</nav>
```

**Jarvis as FAB:** On mobile, Jarvis becomes a floating action button (the animated orb, 56×56dp) in the bottom-right corner. Tapping expands to a full-screen chat overlay. This preserves the Jarvis identity while conforming to mobile UX norms.

**Workflow editor on mobile:** Read-only monitoring mode. Users can see the canvas, see running nodes highlighted in their status colors, receive HITL notifications, and tap to approve/reject. They cannot drag nodes or edit connections. A banner at the top says "Switch to desktop to edit this workflow." This is exactly what n8n, Retool, and Appsmith do.

### Tablet Layout

640–1024px breakpoint: collapsible sidebar. The sidebar slides in from the left and can be dismissed with a tap outside. Split-view is available for the workflow editor: left panel shows the canvas in a compressed view, right panel shows node configuration.

```jsx
{/* Tablet: collapsible sidebar */}
<div className={`
  md:relative md:translate-x-0
  fixed inset-y-0 left-0 w-64 z-50 transition-transform duration-300
  ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
`}>
  <SidebarNavigation />
</div>
```

### PWA Implementation

**Web App Manifest:**
```json
{
  "name": "NEXUS OS",
  "short_name": "NEXUS",
  "description": "AI Agent Orchestrator",
  "start_url": "/dashboard",
  "display": "standalone",
  "theme_color": "#0f0f17",
  "background_color": "#0f0f17",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "screenshots": [
    { "src": "/screenshot-mobile.png", "sizes": "390x844", "type": "image/png", "form_factor": "narrow" }
  ]
}
```

**Service Worker (using Workbox pattern):**
```javascript
// sw.js — cache-first for assets, network-first for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname.startsWith('/api/')) {
    // Network-first for API calls
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first for static assets (JS, CSS, fonts, images)
    event.respondWith(
      caches.match(event.request)
        .then(cached => cached || fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open('nexus-v1').then(cache => cache.put(event.request, clone));
          return response;
        }))
    );
  }
});
```

**Push Notifications (VAPID):**
Used for workflow completion events, HITL approval requests, token threshold warnings.

```javascript
// Subscribe user to push
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: VAPID_PUBLIC_KEY
});

// Server sends push via web-push library
const webpush = require('web-push');
webpush.setVapidDetails('mailto:your@email.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

await webpush.sendNotification(subscription, JSON.stringify({
  title: 'Workflow Complete',
  body: 'Your "Content Pipeline" workflow finished. 3 tasks completed.',
  icon: '/icon-192.png',
  data: { workflowRunId: 'abc123', url: '/workflows/abc123/runs/xyz' }
}));
```

iOS caveat: push notifications only work after the PWA is installed to the home screen (iOS 16.4+). Before install, show a custom "Add to Home Screen" prompt with instructions. After install, push notifications work normally.

**Install Prompt:**
```javascript
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Show install button after user has accomplished something valuable
  // (e.g., after their first workflow completes successfully)
  showInstallBanner();
});
```

Show the install prompt contextually — not on page load, but at the moment of maximum value (workflow just completed, user is feeling good about the product).

### Capacitor.js for Future App Store Distribution

The antood69/bolt.new repo is available if needed. If NEXUS OS needs App Store presence (App Store + Google Play), Capacitor.js is the right choice over React Native — the team is web-first, Capacitor wraps the existing web app in a native shell with access to native APIs, and the effort to ship is far lower than React Native.

Timeline: PWA first (free, instant distribution), Capacitor only if App Store listing becomes a sales requirement (typically for enterprise) or if mobile DAU warrants the investment.

---

## 12. Phase 9: Trading Journal — Full Backend

**Priority:** LATER (UI shell exists, needs backend)
**Effort:** 1–2 weeks
**Revenue impact:** Differentiator for the prop trading / freelancer audience, feeds into Phase 14

### Current State

The Trading Journal page exists as a UI shell with no backend logic. The forms, tables, and chart components are rendered but nothing is persisted and no calculations are performed.

### What Needs to Be Built

**Trade logging:**
- Manual entry: symbol, direction (long/short), entry price, exit price, quantity, date/time, notes, tags
- Import: CSV import from common broker formats (Alpaca, TD Ameritrade CSV export)
- P&L calculation: automatic gross and net P&L per trade (entry price - exit price) × quantity

**Performance analytics:**
- Win rate: (winning trades / total trades) × 100%
- Average R:R (risk-reward ratio): average winning trade size / average losing trade size
- Profit factor: gross profit / gross loss
- Max drawdown: largest peak-to-trough decline
- Sharpe ratio (simplified): average daily return / standard deviation of daily returns
- Streak tracking: current/best win streak, current/best loss streak
- Performance by: time of day, day of week, symbol, strategy tag

**Charts (using Recharts, already in the tech stack):**
- Equity curve (cumulative P&L over time)
- Monthly P&L heatmap
- Win/loss distribution histogram
- P&L by symbol bar chart

### Database Schema

```sql
CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,       -- 'long', 'short'
  entry_price REAL NOT NULL,
  exit_price REAL,               -- null if open position
  quantity REAL NOT NULL,
  entry_time TIMESTAMP NOT NULL,
  exit_time TIMESTAMP,
  gross_pnl REAL,               -- calculated on close
  fees REAL DEFAULT 0,
  net_pnl REAL,                  -- gross_pnl - fees
  strategy_tag TEXT,
  notes TEXT,
  screenshot_url TEXT,           -- optional trade screenshot
  import_source TEXT,            -- 'manual', 'csv_import', 'broker_api'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE trading_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  gross_pnl REAL DEFAULT 0,
  net_pnl REAL DEFAULT 0,
  notes TEXT
);
```

---

## 13. Phase 10: Fiverr & Freelance Automation

**Priority:** LATER
**Effort:** 2–3 weeks
**Revenue impact:** Direct income generation for users, demonstrates the platform's core value proposition

### Overview

This is the feature that turns NEXUS OS from "an AI tool" into "an income generator." When a user can point NEXUS OS at their Fiverr gigs, watch it accept orders, produce deliverables, and collect money — with a HITL gate for final review — that is the single most powerful demo possible.

### Architecture

```
Fiverr Order Detected
      │
      ▼ (webhook or polling)
Order Type Classifier (Tier 1 — Haiku)
      │
      ▼
Boss Agent creates execution plan
      │
      ├──► Research Worker (gathers context)
      ├──► Writer/Coder/Art Worker (produces deliverable)
      └──► Reviewer Worker (quality check)
            │
            ▼
      ┌─────────────────┐
      │  HITL Gate      │
      │  User reviews   │
      │  before delivery│
      └─────────────────┘
            │
            ▼ (approved)
Auto-deliver via Fiverr API / manual trigger
```

### Fiverr Integration

Fiverr does not offer a public order webhook API for sellers. Current approach:
1. Browser extension (user installs) that monitors Fiverr inbox and relays new orders to NEXUS OS via a webhook
2. Manual "new order" button where user pastes order details and NEXUS OS takes over
3. When Fiverr releases a public API (they have a developer program), integrate directly

### Gig Templates

Pre-built workflow templates for common gig types:
- Logo description → Art Generator → image files → ZIP delivery
- Blog post topic → Researcher + Writer → markdown document → PDF conversion
- Code task description → Coder + Reviewer → code files + documentation → ZIP delivery
- Data entry (spreadsheet) → Data Analyst → formatted output → CSV/Excel file

### Income Tracking

Fiverr earnings feed into the Trading Journal analytics system. A unified "Income" section shows:
- Earnings per gig type over time
- Comparison: AI-assisted vs. manual (time savings)
- Platform breakdown: Fiverr vs. Upwork vs. Freelancer

---

## 14. Phase 11: App Generation Engine

**Priority:** LATER
**Effort:** 3–4 weeks
**Revenue impact:** Viral feature — generates shareable demos that attract new users

### Overview

"Describe an app, NEXUS OS builds it." User describes what they want in natural language → Boss Agent plans the architecture → Coder + Art Generator + Reviewer build it → one-click deploy to Vercel/Railway.

This competes directly with Replit Agent, v0 by Vercel, Bolt.new, and Lovable. The differentiator: NEXUS OS's multi-agent architecture produces higher quality than single-agent builders because a dedicated Reviewer agent catches errors before delivery.

### Supported Output Types

- React web apps (JSX + Tailwind CSS)
- Landing pages (HTML/CSS only, fastest to generate)
- API backends (Express.js with documented endpoints)
- Full-stack apps (React frontend + Express backend + SQLite storage)

### Iteration Loop

Generate → User reviews in preview iframe → User provides natural language feedback → Boss Agent routes edits to appropriate worker → Preview updates. This loop continues until the user is satisfied.

### One-Click Deploy

```javascript
// Deploy to Railway via GraphQL mutation
async function deployToRailway(projectFiles) {
  const response = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${RAILWAY_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `mutation deployFromFiles($projectId: String!, $files: [FileInput!]!) {
        deploymentCreate(input: { projectId: $projectId, files: $files }) { id status }
      }`,
      variables: { projectId: newProject.id, files: projectFiles }
    })
  });
}
```

---

## 15. Phase 12: Jarvis Voice Interface

**Priority:** LATER
**Effort:** 1–2 weeks
**Revenue impact:** UX upgrade, power user feature, differentiator for demos

### What to Build

- **Speech-to-text:** Web Speech API (free, built into Chrome/Firefox) for basic; Whisper API ($0.006/minute) for accuracy
- **Text-to-speech:** ElevenLabs API (~$0.18/1K characters) for a unique Jarvis voice; or Web Speech API `speechSynthesis` for free
- **Voice commands:** Map natural language to actions: "Launch workflow [name]", "How many tokens have I used?", "Show me my earnings this week", "Pause all running agents"
- **Wake word:** "Hey Jarvis" — implemented using porcupine-web (free for personal use) or a simple keyword detection model running locally via Ollama

### Integration with Existing Jarvis

The floating orb already exists. Add a microphone button to the Jarvis overlay. When activated:
1. Jarvis orb animation changes to "listening" mode (pulsing differently)
2. Speech is transcribed in real-time (shown as text in the chat input)
3. On silence detection (500ms gap), send to Claude API
4. Response is spoken back by ElevenLabs (Jarvis voice)

---

## 16. Phase 13: White-Label & Enterprise

**Priority:** LATER (after product-market fit is proven)
**Effort:** 4–6 weeks
**Revenue impact:** Highest per-customer revenue — enterprise licenses are $10K–$100K+/year

### What to Build

**White-Label Package:**
- Custom branding: logo, colors, domain (CNAME support)
- Remove all NEXUS OS branding from the product
- Custom pricing tiers (they set their own prices for their end users)
- Dedicated instance (their own Railway project) or shared multi-tenant with isolated data

**Enterprise Features:**
- SSO: SAML 2.0 and OAuth 2.0 with popular providers (Okta, Azure AD, Google Workspace)
- RBAC: role definitions, permission matrices, team hierarchies
- Audit logs: immutable event log of all user actions (who did what, when, from where)
- SLA: 99.9% uptime guarantee with status page, incident notifications
- On-premise deployment option: Docker Compose or Kubernetes helm chart with full documentation

**Revenue Model:**
- Monthly license: $2,000–$10,000/month depending on seats and features
- Per-seat pricing: $50–200/seat/month for additional seats above base
- One-time setup fee: $5,000–$25,000 for custom onboarding and integration support

### Positioning

Enterprise deals are closed by sales, not self-service. The enterprise features need to be clearly documented but the buying experience requires a human. Build a "Contact Sales" flow that captures requirements and routes to a human response within 24 hours.

---

## 17. Phase 14: Prop Trading Integration

**Priority:** LATER (after Trading Journal Phase 9 is complete and validated)
**Effort:** 4–6 weeks
**Revenue impact:** Premium niche feature, potential for a dedicated high-value user segment

### What to Build

**Trading Agents:**
Specialized agents that analyze market data, apply strategy logic, and (optionally) execute trades. Strategy types: trend following, mean reversion, momentum, arbitrage. All strategies run through a backtesting engine before any live execution.

**Paper Trading Mode:**
All new trading agents start in paper mode. Agents simulate trades against live market data but no real orders are placed. Users see virtual P&L, verify strategy performance, then explicitly enable live trading with a confirmation flow.

**Broker Integration:**
- Interactive Brokers: via TWS API or IBKR Web API (real money, professional)
- Alpaca: REST API for commission-free stock trading (US equities)
- Both integrations behind a HITL gate: no trade executes without either (a) user approval or (b) explicit full-auto mode with configured risk limits

**Risk Management (non-negotiable before any live trading):**
- Maximum position size per symbol (% of account)
- Maximum drawdown limit (auto-disable trading if exceeded)
- Daily loss limit (auto-disable if exceeded)
- Maximum concurrent positions
- Emergency stop button (kills all open positions immediately)

**Strategy Marketplace:**
Trading strategies (as workflow templates) can be published to the marketplace. Buyers can paper-trade a strategy before purchasing. The same 85/15 revenue split applies.

---

## 18. Growth Strategy

### Template-Driven Viral Loops (Notion Model)

Notion's template gallery is their #1 source of new user acquisition. 95% of their growth has been organic, driven by templates that are shareable and SEO-indexed. Every NEXUS OS workflow template is a public URL with a title, description, category, and "Use this template" button. Users who find a template via Google or social media arrive at a landing page that immediately demonstrates value — they can see the workflow, understand what it does, and start a free trial to use it.

Action: Make every public template SEO-friendly. Auto-generate meta descriptions from the workflow's first node and agent list. Submit the template gallery to Google Search Console. Target long-tail keywords like "automate fiverr content writing workflow" and "AI agent for cold email research."

### Champions Program (Figma Model)

Figma's Designer Advocates are not paid influencers — they are power users who get early access, recognition, and direct access to the product team. They create content about Figma because they are genuinely invested in its success.

Action: Identify the top 20 builders in the first month. Invite them to a private Discord channel. Give them a "NEXUS OS Champion" badge, early access to new features, and direct input on the roadmap. They will create YouTube videos, blog posts, and tweets about NEXUS OS without being paid for it.

### Supply-Side Seeding for Marketplace

As detailed in Phase 5: hand-recruit 50–100 creators before opening the marketplace publicly. Pay them to build the first showcase content. Own the quality bar. The GPT Store's failure was largely attributable to opening too early with too little quality control — "junk GPTs flooding the store" destroyed discovery.

### Affiliate Program (20–30% Recurring)

The research benchmark for SaaS affiliate programs: 20–30% recurring commission for the lifetime of the referred customer. This is the number that motivates serious affiliate investment. A 20% commission on a $79/month Pro subscriber is $15.80/month recurring — a content creator who sends 100 signups earns $1,580/month passive.

Affiliate tiers:
- Standard: 20% recurring for 24 months
- Champion: 30% recurring for lifetime (requires 10+ active referrals)
- Agency: 25% recurring + white-label option at discounted rate

Cookie duration: 90 days (AI SaaS has longer consideration periods than B2C products).

High-impact affiliate categories: no-code/automation YouTubers (1K–100K followers, highly qualified audience), AI newsletter writers (direct B2B access), automation agencies (they deploy platforms for clients), Reddit/Discord moderators in AI/no-code communities.

### Public Roadmap (Community-Led Product)

Notion's CRO calls this "the third wave of growth" — the community tells the company what to build next. A public roadmap with upvoting:
- Users submit feature requests
- Other users upvote
- Product decisions reference vote counts
- When a community-requested feature ships, credit the user who suggested it
- Post "We shipped [feature]! Requested by [user]" — they share it

Platforms: Canny, Featurebase, or a custom implementation. Public roadmap is a growth tool, not just a project management tool.

### Retention: Agents That Deliver Value to Your Inbox

The highest-retention mechanism is proactive value delivery. When agents run on a schedule and deliver results to users' inboxes — a morning briefing, a weekly competitive analysis, a daily Fiverr order summary — users see value even when they're not thinking about the platform. The agent appears in their email every morning. That is the core retention loop:

1. User builds an agent that solves a real recurring problem
2. Agent runs on schedule (no user needed)
3. User receives results (email digest, Slack message, push notification)
4. User sees value → shares with colleague → colleague joins
5. Repeat

### Discord Community

Launch Discord on the same day the product launches publicly. Founding members get a special role badge. Structure:
- `#announcements` — product updates, new features
- `#showcase` — share workflows you've built
- `#marketplace` — listings, creator feedback, buyer questions
- `#help` — support, Q&A
- `#roadmap-feedback` — feature requests and discussion
- `#champions-lounge` — private channel for top contributors

Weekly events: "Workflow Wednesday" (featured workflow breakdown), "Creator Spotlight" (interview with a marketplace seller), "Office Hours" (founder answers questions live).

---

## 19. Key Metrics to Track

### North Star Metrics

| Metric | Definition | Benchmark | Target |
|--------|-----------|-----------|--------|
| Weekly Active Workflows | Workflows with at least 1 run in past 7 days | N/A | Growing week over week |
| Agent Actions Completed | Total successful agent task completions per month | N/A | Growing month over month |
| Creator Revenue | Total paid out to marketplace sellers | $0 (benchmark: none exist) | First $10K paid in Month 6 |

### Conversion Metrics (from ChartMogul benchmarks in research)

| Metric | Benchmark | What's "Great" |
|--------|-----------|----------------|
| Freemium-to-paid conversion | 3–5% | 8–12% |
| AI-native product conversion | 6–8% | 15–20% |
| Opt-in free trial (no CC required) | ~18% | > 20% |
| Opt-out free trial (CC required) | ~49% | > 50% |
| Free trial to paid (post-trial) | 25–40% | > 50% |

### Billing Metrics

| Metric | Target |
|--------|--------|
| Token pack attach rate (% of paid users who buy a pack) | > 15% in Month 3 |
| Average token pack size | > $18 (Standard pack) |
| BYOK adoption on Pro tier | > 30% |
| Auto-refill opt-in rate | > 20% of paid users |
| Gross margin (after token costs) | 60–75% |

### Multi-Agent Reliability (from research benchmarks)

| Metric | Warning Threshold | Target |
|--------|------------------|--------|
| Workflow completion rate | < 85% | > 95% |
| Boss agent routing accuracy | < 90% | > 97% |
| HITL gate trigger rate | > 30% of runs | < 10% (high HITL = high uncertainty) |
| Context window overflow rate | > 5% | < 1% |
| Tool call loop detection | > 2% | < 0.5% |

### Marketplace Metrics

| Metric | Target |
|--------|--------|
| Active listings | 100 by Month 6 |
| Seller retention (month 2+) | > 60% |
| Paid listing conversion rate | > 3% of views |
| Creator revenue per active creator | > $200/month |

---

## 20. Design Principles

### TradingView Clean

The reference is TradingView: a professional platform that handles extreme information density without feeling overwhelming. Clean typography, clear data hierarchy, purposeful color use (color is information, not decoration), consistent spacing. Neither "gamer aesthetic" (neon everywhere, gradients on gradients) nor "enterprise boring" (gray everything, 8px fonts).

Typeface: Inter (already in use for Jarvis) for all UI text. Code: JetBrains Mono for code blocks, terminal output, and API examples.

Color system:
- Primary background: `#0f0f17` (dark) / `#f8f8fc` (light)
- Panel background: `#15151f` (dark) / `#ffffff` (light)
- Border: `rgba(255,255,255,0.08)` (dark) / `rgba(0,0,0,0.08)` (light)
- Accent: User-customizable (default `#6366f1` indigo)
- Status: green (`#22c55e`), yellow (`#f59e0b`), orange (`#f97316`), red (`#ef4444`)

### Appeal to People, Not Just Developers

The onboarding flow must work for a Fiverr seller with zero programming knowledge. The first workflow they build should be completable in under 5 minutes. Default templates must have clear, plain-English names ("Automate My Fiverr Orders", "Write a Blog Post", "Research My Competition"). Every error message must explain what went wrong and what to do — never show a raw stack trace to end users.

Friendly copy: "Your agents are thinking..." not "Executing workflow graph nodes". "Tokens are your AI fuel" not "API request credits". "Jarvis is ready" not "Assistant initialized".

### Transparent Billing

Users always know:
- How many tokens they have used today, this week, this month
- How many tokens remain
- When their plan resets
- Exactly how much each workflow run cost (shown in workflow run details)
- The markup rate (published on the pricing page: "We charge 25% over raw API costs")
- When auto-refill will trigger and what it will cost

No surprise charges. No auto-upgrades. No billing changes without 30+ days notice with explicit per-user impact examples. The Cursor June 2025 disaster is the template for what never to do.

### Power Under Simplicity

The visual workflow editor hides an extremely complex multi-agent orchestration engine. Users who just want to "run my workflow" see a run button and status indicators. Users who want to debug see per-agent logs, token counts, execution timelines, and handoff payloads. Power is always accessible — it is just not forced on users who don't need it.

The progressive disclosure principle: surface the simplest version first. Add complexity on demand (expand button, "Advanced" toggle, Debug Mode switch).

### Works Everywhere

Desktop first (keyboard shortcuts, multi-panel layouts, drag-and-drop). Mobile second (monitoring, notifications, Jarvis chat). PWA for install-to-home-screen. Offline: cached dashboard and workflow data loads without network (new runs require connectivity). Accessible: WCAG 2.1 AA minimum — contrast ratios enforced, screen reader labels on all interactive elements.

---

## 21. Priority Roadmap Table

| Priority | Phase | Estimated Effort | Revenue Impact | Dependencies |
|----------|-------|-----------------|----------------|--------------|
| NOW | Phase 2: Token Economy | 1–2 weeks | Direct — monetizes all API usage beyond flat sub | Phase 1 (Stripe) |
| NOW | Phase 3: Orchestrator Core | 2–3 weeks | Core product value — this IS the product | Phase 2 (token tracking) |
| NEXT | Phase 4: Visual Workflow Editor | 2–3 weeks | Key differentiator — drives virality via screenshots/demos | Phase 3 (engine to visualize) |
| NEXT | Phase 8: Mobile Responsive + PWA | 1 week | Doubles accessible users; enables push notifications for HITL | Phase 3 (HITL gates to notify) |
| NEXT | Phase 5: Public Marketplace | 2–3 weeks (MVP) | Platform revenue + network effects + creator flywheel | Phase 4 (templates to sell) |
| SOON | Phase 6: Wallpaper System | 3–5 days | Retention and identity; Phase 5 marketplace category | Phase 1 (CSS system) |
| SOON | Phase 7: Local AI Integration | 1–2 weeks | Power user magnet; margin protection via smart routing | Phase 3 (routing layer) |
| LATER | Phase 9: Trading Journal Backend | 1–2 weeks | Completes existing UI shell; feeds Phase 14 | Phase 1 (UI shell) |
| LATER | Phase 10: Fiverr Automation | 2–3 weeks | Direct income generation for users; best demo feature | Phase 3 + 4 |
| LATER | Phase 11: App Generation Engine | 3–4 weeks | Viral feature; competes with Replit/v0/Bolt | Phase 3 (Coder worker) |
| LATER | Phase 12: Jarvis Voice Interface | 1–2 weeks | UX upgrade; power user feature | Phase 1 (Jarvis orb) |
| LATER | Phase 13: White-Label + Enterprise | 4–6 weeks | Highest per-customer revenue | Full product maturity |
| LATER | Phase 14: Prop Trading | 4–6 weeks | Premium niche; requires Phase 9 validated first | Phase 9 (Trading Journal) |

### The Critical Path

The dependencies form a clear critical path:

**Phase 1** (done) → **Phase 2** (token billing) → **Phase 3** (orchestration engine) → **Phase 4** (visual editor) → **Phase 5** (marketplace)

This is the path to a platform with genuine network effects and a defensible moat. Every phase along this path builds on the previous one and makes the next one more valuable.

Phase 2 without Phase 3 is just billing infrastructure.
Phase 3 without Phase 4 is a powerful engine with no steering wheel.
Phase 4 without Phase 5 is a polished builder with no distribution.
Phase 5 completes the loop: creators build on Phase 4, sell through Phase 5, and the marketplace funds better execution through Phase 3 with more token revenue from Phase 2.

Everything else — mobile, local AI, voice, trading, white-label — is either retention optimization or expansion into new markets. Important, but not the core loop.

---

## Appendix A: Research References

All claims in this document are backed by the four research files. Key sources:

**Multi-agent failure statistics:**
- AugmentCode (2025): 41–86.7% failure rate without structured coordination
- DeepMind (2025): error amplification up to 17.2x without coordination, limited to 4.4x with centralized orchestration
- Galileo (2025): 4 agents = 6 failure points; 10 agents = 45 failure points

**Marketplace revenue splits:**
- Figma Community: 85/15 (Figma Help Center)
- Shopify App Store: 85-100% depending on lifetime revenue (Shopify Developer Docs)
- GPT Store: 0% effectively (WIRED analysis, OpenAI Community)
- Fab (Epic): 88/12 (Epic announcement)

**Token billing benchmarks:**
- Windsurf: 20% markup on third-party models, explicitly disclosed (Verdent AI, Eesel analysis)
- Cursor June 2025: lesson in what not to do — surprise billing change, public apology, refunds issued (Cursor blog, Vantage analysis)
- Recommendation: 20–30% markup, transparent, with BYOK on mid-tier+ (IBRS, Stripe, market consensus)

**Free-to-paid conversion:**
- ChartMogul: 3–5% freemium-to-paid is "good"; 8–12% is "great" for AI-native
- First Page Sage: opt-in trial (no CC) ~18%, opt-out trial (CC required) ~49%

**Competitive positioning:**
- Relevance AI: 40,000 agents, zero creator revenue sharing (TechCrunch, company pricing page)
- Dify.ai: 135,000 GitHub stars, marketplace in beta, no creator monetization (Skywork review)
- AgentGPT: archived January 28, 2026 (GitHub)
- Wordware: mid-pivot to "Sauna" product, 350K builder community underserved (Sacra analysis)

**Local AI integration:**
- Ollama: CORS requires OLLAMA_ORIGINS env var (singlequote.blog)
- Local server detection: probe 3 servers in parallel with 1.5s timeout (research patterns)
- LM Studio: port 1234, supports both OpenAI and Anthropic compatible APIs (LM Studio docs)
- Jan: port 1337, MCP support (Jan.ai docs)

**Visual workflow editor:**
- React Flow: used by Stripe, Typeform, Retool — dominant choice (React Flow docs)
- Critical performance: wrap all custom nodes in React.memo() (Synergycodes webbook)
- ComfyUI: color-coded connection types as UX gold standard (stable-diffusion-art.com)

**Mobile/PWA:**
- iOS 16.4+: push notifications require home screen install (Apple docs via appinstitute.com)
- n8n, Retool, Appsmith all use "monitor and trigger" mobile, not full editing (community sources)
- Capacitor vs PWA: PWA first, Capacitor for app store distribution if needed (nextnative.dev)

---

## Appendix B: Cross-Phase Enhancements

These six features are woven across multiple phases and should be implemented alongside the phase they most naturally belong to.

### B.1 Free Tier (Implement with Phase 2)

Add a free plan alongside Pro and Agency. Research shows 6-8% of free users convert to paid on AI-native products (ChartMogul). Users who deploy one working agent convert at 3-5x the baseline rate.

| Plan | Price | Monthly Token Allowance | Limits |
|------|-------|------------------------|--------|
| Free | $0 | 50K tokens | 2 workflows, 3 agents, no BYOK, marketplace browse only |
| Starter | $19/mo | 500K tokens | 10 workflows, 10 agents, BYOK |
| Pro | $79/mo | 2M tokens | Unlimited workflows/agents, BYOK, API access |
| Agency | $199/mo | 10M tokens | Everything + white-label, team seats, priority support |

Free tier cost: estimated $5-10/month per active free user in API spend. This is the growth engine — worth it.

The free tier must allow users to reach the "aha moment" before hitting limits. A free tier that blocks the core workflow converts at 1-2%. One that allows 80% of the workflow converts at 8-12%.

### B.2 Referral Credits (Implement with Phase 2)

"Invite a friend, both get 500K tokens free."

- Referral link generated per user in Settings
- When referred user signs up and creates first agent, both accounts credited
- Track referral chain in database: `referrals` table (referrer_id, referred_id, status, credited_at)
- Cap at 10 referrals per month to prevent abuse
- Cost: ~$1-3 per referral in API spend, but CAC on organic referrals is near zero

### B.3 Agent Analytics Dashboard (Implement with Phase 3)

Show users exactly how much value their agents deliver:

- Tasks completed per agent per day/week/month
- Estimated time saved (based on task type benchmarks)
- Token spend per agent with cost breakdown
- Success/failure rate per agent
- "Your agents completed 47 tasks this week, saving ~12 hours"

This is the retention driver. Users who see quantified ROI churn at half the rate. No extra API cost — built on data already tracked by the orchestrator.

### B.4 Weekly Email Digest (Implement with Phase 3)

Automated weekly email every Monday morning:

- "Here's what your agents did this week"
- Tasks completed, tokens used, estimated time saved
- Top-performing agent highlight
- Suggested optimizations ("Agent X failed 3 times — consider adjusting its tools")
- CTA: "View full analytics" link back to dashboard

Research finding: platforms where agents deliver results to users' inboxes create the highest daily return rate. Users get value without thinking about the platform.

Stack: Resend or SendGrid ($0 for first 100 emails/day). Cron job runs Sunday night, sends Monday 8am user-local-time.

### B.5 Starter Templates on Sign-Up (Implement with Phase 4)

New users should never see an empty dashboard. Pre-load 3-5 starter workflows:

1. "Research Assistant" — takes a topic, researches it, returns a summary
2. "Content Writer" — takes a brief, generates a blog post draft
3. "Code Reviewer" — paste code, get a review with suggestions
4. "Email Drafter" — describe what you need, get a professional email
5. "Data Analyzer" — upload a CSV, get insights and charts

Each template is one-click activate. User sees it working within 2 minutes of signing up.

Research: reducing time-to-first-agent to under 5 minutes is the highest-impact conversion tactic.

### B.6 API Access for Developers (Implement with Phase 3)

Pro+ users can hit NEXUS OS via REST API:

```
POST /api/v1/workflows/:id/execute
Authorization: Bearer <user_api_key>

{"input": "Research the latest trends in AI agents"}
```

- API key management in Settings (generate, revoke, rotate)
- Rate limiting per plan tier
- Webhook callbacks for async workflow completion
- Opens up developer audience, CI/CD integrations, and programmatic usage
- Tokens consumed via API count against the user's plan allowance

---

## Appendix C: Technical Stack Reference

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React + Vite + TypeScript | Already in use |
| UI Components | shadcn/ui + Tailwind CSS | Already in use |
| Workflow Canvas | @xyflow/react (React Flow) | Phase 4 addition |
| Backend | Express.js | Already in use |
| Database | SQLite + Drizzle ORM | Phase 13: migrate to PostgreSQL for enterprise |
| AI (primary) | Claude API (Anthropic) | Already in use for Jarvis |
| AI (local) | Ollama / LM Studio / Jan | Phase 7 addition |
| Image Generation | DALL-E 3 (low volume), Flux via FAL (high volume) | Phase 3/6 addition |
| Payments | Stripe (checkout, webhooks, Connect, subscriptions) | Already in use; Phase 2 adds one-time purchases; Phase 5 adds Connect |
| File Storage | Local filesystem → S3/R2 for production | Phase 3 shared workspace |
| Push Notifications | VAPID web push + FCM | Phase 8 addition |
| Text-to-Speech | ElevenLabs API | Phase 12 addition |
| Speech-to-Text | Web Speech API / Whisper | Phase 12 addition |
| Deployment | Railway | Already in use |
| CI/CD | GitHub Actions | Already in use |
| Terminal | xterm.js + node-pty | Phase 7 Claude Code features |

---

*End of NEXUS OS Master Plan. Total phases: 14. Estimated time to marketplace MVP: 8–12 weeks from Phase 2 start.*
