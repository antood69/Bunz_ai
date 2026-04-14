# BUNZ MASTER PLAN
**Last Updated: April 14, 2026**
**Version: v0.1.0-alpha**

---

## What Is Bunz?

Bunz is an **AI Agent Orchestrator Platform**. A "Boss" AI receives tasks from the user and dispatches them to specialized worker agents (Coder, Art, Reasoning). The platform wraps this orchestration layer in a SaaS web app with a dashboard, visual workflow editor, credit-based billing, and a Workshop for downloadable mods.

**End goal:** Web SaaS → Desktop app → Fiverr income engine.

---

## Current Status

| Item | Detail |
|------|--------|
| Production URL | nexus-os-production-50a1.up.railway.app (UP, healthy) |
| GitHub | antood69/bunz (fresh repo, clean history) |
| Stack | Node.js Express + React (Vite) + SQLite (better-sqlite3 + Drizzle ORM) |
| Deploy | Railway — persistent volume at /data |
| Alpha tag | v0.1.0-alpha |

---

## Architecture

```
Client (React + Vite)
  ├── Dashboard (widgets, token tracking, active agents)
  ├── Boss Chat (SSE streaming, conversation history)
  ├── Visual Editor (workflow builder)
  ├── Workshop (mod store)
  ├── Settings (Customize, Usage, Pricing, Connectors)
  ├── Fiverr Automation (Kanban, Templates, Webhooks, Revenue, Income)
  └── Mod pages (installed from Workshop)

Server (Express + SQLite)
  ├── Auth (session + GitHub OAuth)
  ├── Boss AI (dispatch → worker agents)
  ├── Agents (Coder, Art, Reasoning — function calling)
  ├── Storage (better-sqlite3 + Drizzle ORM)
  ├── Connectors (API key + OAuth2 + Custom)
  ├── Stripe (subscriptions + credit packs)
  ├── Workers (BullMQ queues per agent type)
  ├── SSE (real-time streaming)
  └── Rate Limiter (tier-based credit enforcement)
```

---

## Pricing Tiers

| Plan | Price | Credits/Mo | Models |
|------|-------|------------|--------|
| Free | $0 | 3,000 | Fast models only |
| Starter | $24/mo | 40,000 | Mid-tier models |
| Pro | $99/mo | 200,000 | Premium models |
| Agency | $249/mo | 800,000 | All models |

**Overage packs:**
- Starter: $5 / 5K credits
- Pro: $5 / 10K credits
- Agency: $5 / 20K credits
- Free: blocked at monthly limit (no overage option)

---

## Key Decisions

- **SQLite over Postgres** — simpler, file-based, portable to desktop
- **Supabase** for auth/user data (project: aavnodvkdyzsnuyigiva, us-east-1)
- **Railway** for hosting (persistent volume at /data, 5GB, US West California)
- **Workshop mods as downloadable add-ons** — not hardcoded features; each mod is self-contained UI + backend
- **Daily soft caps + monthly hard limits** for credit enforcement
- **Custom domain**: bunz.io (DNS pending)
- **Desktop framework**: Tauri (when ready — Rust-based, smaller/faster than Electron)

---

## Git Info

| Field | Value |
|-------|-------|
| Active repo | antood69/bunz (private) |
| Archive repo | antood69/bunz-archive (full history, archived) |
| Owner email | reederb46@gmail.com |
| GitHub handle | antood69 |

---

## What's Built & Working

- Boss AI chat with conversation history persisted to DB
- Agent dispatch: Boss → Coder / Art / Reasoning with function calling
- Per-agent token tracking and configurable models/prompts
- Model registry with 50+ verified model IDs (OpenAI, Anthropic, Google, open source)
- Dashboard with live token tracking, active/inactive workflow widgets, inspect view
- Visual Editor for workflows (renamed from card view)
- Fiverr Automation module (Kanban pipeline, templates, webhooks, revenue, income tabs — UI built)
- Connectors Hub: 3 tabs (My Connections, Available, Custom), 10 connectors (5 API Key + 5 OAuth2)
- Rate limiting with tier enforcement
- Auth with GitHub OAuth (repo scope + token storage)
- Error boundaries, skeleton UI
- Onboarding tour with replay
- Export/download buttons on agent output
- Health check endpoint
- Credit system definitions: Free/Starter/Pro/Agency tiers

---

## What Was Just Fixed (Deep Clean — April 14, 2026)

- **Schema sync**: CREATE TABLE now matches Drizzle schema — added `email_verified`, `github_token`, `github_username` columns with ALTER TABLE fallbacks for existing DBs
- **Express 5 wildcard routes**: `/*` → `/*path` across all route files
- **Import cleanup**: 10 unused imports removed
- **Runtime safety**: try/catch on DB init, Redis URL fallback
- **Dead code removal**: cleaned unused handlers and stubs
- **Token tracking routes**: were hardcoded to `userId=1`, now use authenticated session user
- **SSE stream reliability**: fixed dropped connections and incomplete flushes

---

## Known Issues / Not Yet Verified

- Connector API keys/OAuth apps not registered — connectors exist in UI but won't authenticate without real credentials
- Workshop mod pages are stubs — UI shells only, no real functionality
- Overage credit purchase flow not built
- Daily soft caps defined but not enforced (only monthly limits enforced)
- File upload/download in Boss chat not built
- Desktop app not started

---

## Phases

### Phase 1: Stabilize ✅ COMPLETE

- [x] Fix Railway 502 (mkdirSync for /data)
- [x] Deep clean (schema sync, imports, runtime safety, dead code)
- [x] Fresh repo with clean git history
- [x] Express 5 wildcard route fixes
- [x] Railway deploy stable

---

### Phase 2: Core Platform Polish — CURRENT

Goal: verify the core loop works end-to-end, lock down billing basics, clean up the sidebar.

- [ ] **Verify Boss AI chat end-to-end**: send message → AI responds → saved to DB → reloads on refresh
- [ ] **Verify agent dispatch**: Boss dispatches to Coder / Art / Reasoning, output returns correctly
- [ ] **Coder agent — repo selector UI**: in-chat UI to pick which GitHub repo the Coder agent operates on
- [ ] **Credit enforcement**: enforce daily soft caps in addition to monthly hard limits
- [ ] **Overage purchase flow**: Stripe checkout for credit packs (Starter/Pro/Agency)
- [ ] **Settings consolidation**: move Customize, Usage, Pricing, Connectors into tabs inside a single Settings page
- [ ] **Sidebar cleanup**: remove Marketplace, Tools, Agents entries — keep agent system under the hood
- [ ] **Onboarding tour verification**: confirm tour triggers correctly for new users, replay works
- [ ] **File upload/download in Boss chat**: attach files to messages, download agent output files

---

### Phase 3: Connectors (Essential Set)

Goal: make all listed connectors actually functional with real credentials.

**API-key connectors (paste-and-go):**
- [ ] OpenAI
- [ ] Anthropic
- [ ] Google AI (Gemini)
- [ ] Groq
- [ ] Mistral
- [ ] OpenRouter
- [ ] Perplexity
- [ ] ElevenLabs (voice synthesis)
- [ ] Replicate (open-source models)

**OAuth2 connectors:**
- [ ] GitHub ✅ built — needs end-to-end verification with real OAuth app
- [ ] Google (Drive / Docs / Sheets / Calendar — single OAuth2 app)
- [ ] Gmail
- [ ] Notion
- [ ] Slack
- [ ] Stripe ✅ built — needs end-to-end verification
- [ ] Vercel
- [ ] Linear
- [ ] Twitter/X
- [ ] Instagram
- [ ] YouTube
- [ ] Figma
- [ ] Canva
- [ ] HubSpot

**Webhook / Custom:**
- [ ] Zapier (inbound webhook endpoint)
- [ ] Make (inbound webhook endpoint)
- [ ] Custom REST / Webhook / OAuth2 (generic builder)

---

### Phase 4: Fiverr Automation (Harden)

Goal: make the existing UI actually functional end-to-end.

- [ ] **Pipeline (Kanban)**: verify drag/drop, 4 columns (New → In Progress → Review → Delivered), approve-to-deliver gate
- [ ] **Templates**: CRUD operations, AI system prompt per template, model selection, auto-generate toggle
- [ ] **Webhooks**: generate secret, inbound endpoint handler, JSON schema documentation
- [ ] **Revenue tab**: total revenue, order count, avg order value, bar chart with date range
- [ ] **Income tab**: multi-platform entries, manual income entries, pie chart, monthly trend line, tax estimate, CSV export
- [ ] **End-to-end test**: template → new order → auto-generate → review → approve → revenue tracked

---

### Phase 5: Workshop Mods (Build & Package)

Each mod is a downloadable package from the Workshop that installs into the sidebar — self-contained UI + backend routes.

| # | Mod | Status |
|---|-----|--------|
| 1 | Fiverr Automation | Mostly done — finish in Phase 4 |
| 2 | Bot Challenge | Stub |
| 3 | Trade Journal | Stub |
| 4 | Account Stacking | Stub |
| 5 | App Generator | Stub |
| 6 | Prop Trading | Stub |
| 7 | White Label | Stub |

**Mod packaging spec:**
- Each mod = `/workshop/mods/<mod-name>/` directory
- Contains: `manifest.json`, `client/` (React pages), `server/` (Express routes), `migrations/` (SQLite schema additions)
- Workshop page fetches available mods, user downloads → mod registers itself on next server restart

---

### Phase 6: Second Brain / Knowledge Layer

- Obsidian-style linked notes + graph view
- Auto-captures all AI conversations, responses, and workflow results
- Structured storage for building a fine-tuning dataset over time
- Full-text search across all captured knowledge
- Tag, link, and organize notes manually or via AI suggestion

---

### Phase 7: Billing & Token Economy

- Stripe subscription checkout for Starter / Pro / Agency plans
- Credit pack purchase for overage (per-tier pricing)
- Usage dashboard with real-time credit tracking per user
- Invoice generation and email delivery
- Plan upgrade / downgrade flow with proration
- Webhook handler for Stripe events (payment success, failure, cancellation)

---

### Phase 8: Auditor & Analytics

- Security audit trail (who did what, when)
- User analytics dashboard (activity, agent usage, credit burn rate)
- Performance monitoring (response times, error rates)
- Error tracking integration (Sentry or equivalent)

---

### Phase 9: Customization & Themes

- Custom wallpapers, themes, accent colors
- Layout customization (sidebar position, panel sizes)
- Widget arrangement on dashboard (drag to reorder, show/hide)
- Theme export/import for sharing

---

### Phase 10: Workflow Visual Editor (Polish)

- Node-based visual workflow builder (current editor is basic — polish to production quality)
- Drag-and-drop node palette (trigger, agent, condition, transform, output)
- Conditional logic, loops, branching
- Test/preview mode with step-by-step trace
- Save/load named workflows
- Share workflows as templates

---

### Phase 11: Desktop App

- **Framework**: Tauri (Rust-based, smaller/faster than Electron — preferred)
- Package Vite frontend + Express backend into a single binary
- SQLite runs locally — no Railway needed for personal/offline use
- Auto-update mechanism (Tauri updater)
- Code signing: macOS notarization, Windows Authenticode signing
- Installers: `.dmg` (macOS), `.exe` / `.msi` (Windows), `.AppImage` (Linux)
- Sync mode: optionally connect to cloud account for multi-device use

---

### Phase 12: Launch & Revenue

**Fiverr setup:**
- [ ] Create seller account and optimize profile
- [ ] Set up gigs: AI blog writing, code fixes, social media content packs, website scaffolding, data reports
- [ ] Configure Bunz webhook to receive Fiverr order notifications

**Automation loop:**
1. Fiverr order placed → webhook fires to Bunz
2. Bunz auto-selects matching template
3. Boss AI dispatches to appropriate agent
4. Output queued for review
5. Seller approves → delivered to Fiverr buyer
6. Revenue tracked in Income tab

**Revenue targets:**
- Month 1: $500–1,000/mo
- Month 3: $1,500–3,000/mo

---

## Development Principles

1. **Fix before build** — verify what exists works before adding new features
2. **One phase at a time** — don't start Phase 3 until Phase 2 tasks are checked off
3. **Ship small** — each PR should be a single working unit, not a rewrite
4. **DB migrations only** — never manually edit the SQLite file; always go through Drizzle migrations
5. **Test the happy path first** — get the core loop working, then handle edge cases
6. **Keep mods modular** — Workshop mods must not touch core schema or core routes

---

## Quick Reference

| Thing | Value |
|-------|-------|
| Production URL | nexus-os-production-50a1.up.railway.app |
| GitHub repo | antood69/bunz |
| Supabase project | aavnodvkdyzsnuyigiva (us-east-1) |
| Railway volume | /data (5GB, US West California) |
| Custom domain | bunz.io (DNS pending) |
| Current version | v0.1.0-alpha |
| DB path | /data/bunz.db (production) |
| Health endpoint | /health |
