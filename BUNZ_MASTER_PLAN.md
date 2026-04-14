# BUNZ — Definitive Master Plan
### Last updated: April 14, 2026 | 32 commits | Built in one session with Claude Opus 4.6

---

## What Bunz Is

An AI Agent Orchestrator. You tell The Boss what you want, it routes to specialist departments (Research, Coder, Artist, Writer), streams live progress, and synthesizes results. For complex tasks, the Autonomous department chains departments together: plan → execute → evaluate → deliver.

**Stack:** TypeScript, Express, Vite, React, Tailwind, SQLite, Railway
**Repo:** github.com/antood69/bunz (private)  
**Local:** C:\Users\reede\bunz-repo  
**CI:** GitHub Actions auto-build on every push

---

## Honest Status — What Actually Works

### ✅ Fully Working
- Boss AI routes simple questions directly (no dispatch)
- Research department (Perplexity sonar-pro) — returns web research
- Writer department (Claude/GPT) — generates content
- Coder department (Claude/GPT) — writes code with GitHub tool access
- Intelligence picker: Entry / Medium / Max in the UI
- Dispatch parser with brace-counting (handles nested JSON)
- Planning messages ("I'll get the Research team on this...")
- Department Pipeline UI — live status cards for each department
- Multi-department display (Research + Writer + Coder cards all visible)
- eventBus SSE streaming (replaced Redis pub/sub, no more drops)
- SSE reconnect on page return + 15-minute timeout
- Dashboard KPIs: Tokens Used, Tasks Run, Conversations (real DB queries)
- Model Usage pie chart, Token Usage bar chart
- System Health widget (Redis, DB, Node, uptime, memory)
- Task History panel (click Tasks Run KPI to see past jobs)
- Delete jobs from Task History
- GitHub Actions CI build check
- GitHub OAuth login
- BYOK encrypted API keys (7 providers)
- File upload to chat
- Stripe billing skeleton (Pro/Agency tiers)

### ⚠️ Works But Has Issues
- **Autonomous department** — plans correctly, shows all 3 dept cards, BUT sometimes fails mid-execution (likely API rate limits or model errors). Error is now logged to Railway console and saved to DB.
- **Active Agents KPI** — shows running count but doesn't refresh fast enough during tasks
- **Dashboard layout** — grid works but old saved layouts may reference deleted widgets

### ❌ Not Working / Needs Fix
- **Activity feed** — always empty (events may not be inserting or table missing)
- **Boss stops when navigating away** — SSE drops, results save to DB but don't show on return (refetch was removed due to duplication bug)
- **Wallpaper/glass/compact mode** — only applies to some pages, not global
- **"Upcoming Scheduled" widget** — references deleted workflow system
- **Artist department** — untested (image generation via gpt-image-1)
- **Delete button in Active Agents panel** — endpoint works but UI may not refresh


---

## Dead Code Still in Repo

| File/Dir | Status | Action |
|----------|--------|--------|
| server/queues/ | Empty dir | Delete |
| server/workers/ | Empty dir | Delete |
| server/agents/reasoning.ts | Legacy, not used by departments | Delete or repurpose |
| client/src/components/ModelSelector.tsx | Replaced by IntelligencePicker | Delete |
| client/src/pages/WorkflowsPage.tsx | Routes removed, still imported nowhere | Delete |
| client/src/pages/WorkflowDetailPage.tsx | Routes removed | Delete |
| client/src/pages/WorkshopPage.tsx | Routes removed | Delete |
| client/src/pages/AnalyticsPage.tsx | Stub, not routed | Delete |
| client/src/pages/CustomizationPage.tsx | Merged into Settings | Delete |
| client/src/components/WorkflowCanvas.tsx | Visual editor removed | Delete |
| client/src/components/WorkflowAIChat.tsx | Visual editor removed | Delete |
| client/src/components/NodePalette.tsx | Visual editor removed | Delete |
| client/src/lib/marketplace-types.ts | Marketplace removed | Delete |
| server/connectors.ts | Connector framework (keep for Phase 2) | Keep |
| server/email.ts | Email sending (keep) | Keep |
| storage.ts (~3247 lines) | Has dead table schemas for fiverr, trading, etc. | Clean later |

---

## Bug Tracker — Priority Order

| # | Bug | Severity | Root Cause | Fix |
|---|-----|----------|------------|-----|
| 1 | Autonomous tasks sometimes fail silently | HIGH | API model errors (rate limits, auth). Boss dispatches but autonomous executor crashes. | Add retry logic in autonomous.ts. Check Railway logs for `[Autonomous] FAILED:`. |
| 2 | Activity feed always shows "No activity yet" | MEDIUM | `insertActivityEvent` was added to boss.ts but activity_events table may not exist in schema. | Verify table exists in storage.ts schema migration. |
| 3 | Active Agents shows 0 even when task is running | MEDIUM | refetchInterval too slow (30s). Job status changes to "complete" quickly. | Set refetchInterval to 3000ms for agents KPI. |
| 4 | Boss results lost when navigating away mid-task | MEDIUM | SSE drops on navigate. Refetch was causing double messages so it was removed. | Re-add refetch with proper deduplication (match by content hash, not ID). |
| 5 | Wallpaper/glass/compact mode only works on some pages | LOW | CSS classes not propagated to all page containers. | Audit all pages, ensure they inherit from AppLayout's wallpaper context. |
| 6 | "Upcoming Scheduled" widget references dead feature | LOW | Widget still in registry, references deleted workflow cron system. | Remove from WIDGET_REGISTRY and DEFAULT_LAYOUT. |
| 7 | Token counts show 0 in task history | LOW | Raw SQL column names (snake_case) vs ORM names (camelCase) mismatch. | Fix column mapping in active-agents endpoint. |


---

## Roadmap — In Priority Order

### PHASE 1: Stabilize (1 session)
**Goal:** Everything that exists works reliably.

- [ ] Fix activity feed (verify table schema, test insertion)
- [ ] Fix autonomous retry on API failures
- [ ] Fix Active Agents live refresh (3s interval)
- [ ] Re-add message refetch with proper dedup
- [ ] Remove Upcoming Scheduled widget
- [ ] Delete all dead code files listed above
- [ ] Test Artist department (image generation)
- [ ] Verify all 4 departments work individually + autonomous chains them

### PHASE 2: Self-Improvement Loop (1 session)
**Goal:** Bunz modifies its own codebase through PRs you approve.

- [ ] Update CLAUDE.md with current file map
- [ ] Add branch creation to Coder department tools
- [ ] Add PR creation to Coder department tools
- [ ] Add branch protection rule on GitHub (require CI pass + 1 approval)
- [ ] Test: "Read boss.ts and improve the error handling, open a PR"
- [ ] Test: "Add retry logic to autonomous.ts, open a PR"

### PHASE 3: Task Manager Page (1-2 sessions)
**Goal:** Dedicated /tasks page for autonomous work management.

- [ ] New route: /tasks
- [ ] List view: all autonomous tasks with status, progress, department breakdown
- [ ] Detail view: click a task to see step-by-step outputs from each department
- [ ] Controls: Cancel running task, Retry failed task
- [ ] Task queue: submit multiple tasks, execute sequentially
- [ ] Background indicator: small badge on sidebar showing running tasks

### PHASE 4: Connectors (2-3 sessions)
**Goal:** Plug external services into the department pipeline.

- [ ] Connector settings UI (already partially built: ConnectorsPage.tsx)
- [ ] Obsidian vault: write all AI outputs to a local/synced vault as markdown
- [ ] Google Drive: read/write docs as department input/output
- [ ] Notion: create/update pages from department outputs
- [ ] Webhook receiver: trigger autonomous tasks from external events
- [ ] MCP server: expose Bunz departments as MCP tools for other AI systems

### PHASE 5: Dashboard v2 (1-2 sessions)
**Goal:** Actually useful, interactive command center.

- [ ] Fix all KPI accuracy
- [ ] Live activity feed with event types (chat, dispatch, complete, error)
- [ ] Department performance cards (tokens/task, success rate, avg time)
- [ ] Cost tracker (estimated $ per provider from token usage)
- [ ] Global wallpaper/theme sync
- [ ] Compact mode that actually works
- [ ] Remove all dead widgets

### PHASE 6: Desktop App — Tauri (2-3 sessions)
**Goal:** Native app with local model support.

- [ ] Tauri wrapper around the web UI
- [ ] Local SQLite (no Railway dependency for personal use)
- [ ] Ollama integration for offline AI
- [ ] File system access for Obsidian vault and code repos
- [ ] System tray with task notifications
- [ ] Background autonomous tasks that survive window close

### PHASE 7: Multi-User (2-3 sessions)
**Goal:** Other people can use the platform.

- [ ] User roles: Owner, Admin, Member
- [ ] Per-user token budgets and rate limits
- [ ] Team workspaces with shared conversations
- [ ] Audit log: who ran what, when, how many tokens
- [ ] Public signup with Stripe-gated tiers


---

## Architecture Reference

```
bunz-repo/
├── .github/workflows/build.yml    — CI: auto build check
├── BUNZ_MASTER_PLAN.md            — this file
├── CLAUDE.md                      — codebase context for AI
│
├── client/src/
│   ├── App.tsx                    — routes: /, /boss, /settings, /admin
│   ├── pages/
│   │   ├── BossPage.tsx           — main chat (1072 lines, core UI)
│   │   ├── Dashboard.tsx          — KPI grid (react-grid-layout)
│   │   ├── SettingsPage.tsx       — tabs: general, appearance, connectors, usage, pricing, ai-preferences
│   │   └── AdminPage.tsx          — owner panel
│   ├── components/
│   │   ├── AppLayout.tsx          — sidebar (Dashboard, Chat, Settings)
│   │   ├── IntelligencePicker.tsx — Entry/Medium/Max buttons
│   │   ├── dashboard/
│   │   │   ├── widgets.tsx        — all dashboard widget components
│   │   │   ├── ActiveAgentsPanel.tsx — running jobs modal
│   │   │   └── TaskHistoryPanel.tsx  — past jobs modal
│   │   └── ui/                    — shadcn components
│   └── hooks/
│       └── useAgentStream.ts      — SSE hook for live department streaming
│
├── server/
│   ├── boss.ts                    — THE BRAIN: routes to departments or answers directly (423 lines)
│   ├── departments/
│   │   ├── types.ts               — 4 depts, 3 levels, sub-agent definitions
│   │   ├── executor.ts            — runs sub-agents within a department
│   │   └── autonomous.ts          — multi-step planning loop (207 lines)
│   ├── agents/
│   │   ├── coder.ts               — GitHub tool calling (10 tools, agentic loop, 15 rounds max)
│   │   └── art.ts                 — image generation via gpt-image-1
│   ├── lib/
│   │   ├── eventBus.ts            — in-memory SSE with buffering/replay (replaces Redis pub/sub)
│   │   ├── modelRouter.ts         — 7-provider AI router with fallback chains
│   │   ├── crypto.ts              — AES encryption for BYOK keys
│   │   ├── modelDefaults.ts       — default models per worker type
│   │   └── rateLimiter.ts         — token budget enforcement
│   ├── sse.ts                     — SSE endpoint (15min timeout, heartbeat, replay)
│   ├── routes.ts                  — API routes (952 lines, cleaned from 3250)
│   ├── storage.ts                 — SQLite via Drizzle ORM (3247 lines)
│   ├── auth.ts                    — GitHub OAuth + session management
│   └── stripe.ts                  — billing routes
│
└── script/build.ts                — Vite (client) + esbuild (server) → dist/index.cjs
```

## Intelligence Levels

| Level | Boss Model | Research | Coder/Writer | Artist | Cost |
|-------|-----------|----------|-------------|--------|------|
| Entry | gpt-5.4-mini | gpt-5.4-mini | gpt-5.4-mini | gpt-image-1 | 1x |
| Medium | gpt-5.4 | sonar-pro | claude-sonnet-4-6 | gpt-image-1 | 3x |
| Max | claude-opus-4-6 | sonar-pro | claude-opus-4-6 | gpt-image-1 | 8x |

## Department Sub-Agents

| Department | Lead (always) | Support (moderate) | Specialist (complex) |
|-----------|--------------|-------------------|---------------------|
| Research | Lead Researcher | Analyst | Fact-Checker |
| Coder | Lead Developer | Junior Dev (tests) | Code Reviewer |
| Artist | Lead Artist | Style Director | — |
| Writer | Lead Writer | Copywriter | Editor |

## Environment Variables
```
ANTHROPIC_API_KEY, OPENAI_API_KEY, PERPLEXITY_API_KEY, GOOGLE_AI_API_KEY,
GROQ_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY, SESSION_SECRET,
GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, NODE_ENV=production,
STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET,
STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_ANNUAL,
STRIPE_PRICE_AGENCY_MONTHLY, STRIPE_PRICE_AGENCY_ANNUAL
```

---
*Built April 14, 2026. 32 commits. ~13,000 lines of dead code removed. 4 departments online.*
