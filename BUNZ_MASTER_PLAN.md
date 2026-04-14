# BUNZ MASTER PLAN — April 14, 2026

## What Bunz Is
AI Agent Orchestrator Platform. One Boss AI routes tasks to specialist departments. Runs on Railway, TypeScript/Express/Vite/SQLite stack.

**Production URL:** bunz.io (Railway)
**Repo:** github.com/antood69/bunz (private)
**Local clone:** C:\Users\reede\bunz-repo

---

## CURRENT STATE — What Works ✅

### Core System
- **Boss AI** — central orchestrator, routes to departments or answers directly
- **4 Departments** — Research (Perplexity sonar-pro), Coder (Claude/GPT), Artist (gpt-image-1), Writer (Claude/GPT)
- **Intelligence Levels** — Entry (fast/cheap), Medium (balanced), Max (best quality)
- **Autonomous Department** — multi-step planning loop: Plan → Research → Write → Code → Synthesize
- **eventBus SSE** — in-memory event streaming, no more Redis drops
- **Department Pipeline UI** — live status cards showing each department working
- **GitHub Actions CI** — auto build check on every push

### Dashboard
- KPIs: Active Agents, Tokens Used (7d), Tasks Run (30d), Conversations
- Token Usage chart (7d bar chart, live)
- Model Usage pie chart (GPT-5.4, Claude-Sonnet, etc.)
- System Health (Redis, DB, Node, uptime, memory)
- Quick Actions (New Chat, Autonomous Task, AI Settings)
- Task History panel (click Tasks Run to see past jobs with delete)

### Infrastructure
- Railway deployment (auto-deploy from GitHub)
- SQLite database with volume mount at /data
- GitHub OAuth login
- Stripe billing (Pro/Agency tiers)
- BYOK API keys (encrypted, 7 providers)
- File upload/download

---

## KNOWN BUGS — Fix First 🔧

| # | Bug | File | Fix |
|---|-----|------|-----|
| 1 | Activity feed always empty | server/boss.ts | insertActivityEvent calls exist but activity_events table may not be created. Verify schema + test. |
| 2 | Active Agents KPI doesn't update live during tasks | client widgets.tsx | Reduce refetchInterval to 3000ms for agents KPI |
| 3 | Some autonomous tasks fail silently | server/departments/autonomous.ts | Check Railway logs for `[Autonomous] FAILED:`. Likely model API errors. Add retry logic. |
| 4 | Wallpaper/glass/compact mode not syncing to all pages | client AppLayout.tsx + all pages | Each page needs to inherit wallpaper container classes from AppLayout |
| 5 | "Upcoming Scheduled" widget shows dead workflow text | client widgets.tsx | Remove from DEFAULT_LAYOUT or replace with useful widget |
| 6 | Tokens show 0 in Active Agents panel | server/routes.ts active-agents endpoint | Map token_count column correctly from raw SQL |
| 7 | Boss sometimes doesn't dispatch to autonomous | server/boss.ts | Boss model sometimes dispatches to individual depts instead of autonomous. Improve system prompt. |

---

## PHASE 1 — Self-Improvement Loop (Next Session)

**Goal:** Bunz can modify its own codebase safely.

1. **Branch protection** — Coder department creates feature branches, never pushes to main
2. **PR workflow** — Coder opens PRs, CI runs build check, you approve
3. **Codebase context** — Give Coder department a `CLAUDE.md` with repo structure so it knows what files do what
4. **First self-task:** "Read server/routes.ts, identify dead code, clean it up, open a PR"

**Files to modify:**
- server/agents/coder.ts — add branch creation + PR tools
- CLAUDE.md — update with current architecture
- .github/workflows/build.yml — already done

---

## PHASE 2 — Connectors Framework

**Goal:** Plug in external services (Obsidian, Notion, Slack, etc.)

1. **Connector registry** — server/lib/connectorRegistry.ts (already exists, needs activation)
2. **Connector UI** — Settings > Connectors tab (ConnectorsPage.tsx exists)
3. **Obsidian vault connector** — write outputs to local vault via file system or Obsidian REST API
4. **Webhook connectors** — receive events from external services
5. **OAuth framework** — for services that need OAuth (Google, Notion, Slack)

**Priority connectors:**
- Obsidian (vault sync — all AI input/output logged)
- Google Drive (read/write docs)
- Notion (page creation)
- GitHub (already working via Coder department)

---

## PHASE 3 — Task Manager

**Goal:** Dedicated page for managing autonomous tasks (not buried in Boss chat).

1. **Task Manager page** — /tasks route, shows all running + recent autonomous tasks
2. **Live progress view** — click a task to see step-by-step progress with department outputs
3. **Controls** — Pause, Resume, Cancel, Retry failed steps
4. **Task queue** — queue multiple autonomous tasks, execute sequentially
5. **Task templates** — save common multi-step workflows as reusable templates

---

## PHASE 4 — Dashboard v2

**Goal:** Interactive, accurate, real-time dashboard.

1. **Fix all KPIs** — accurate live numbers, proper delta calculations
2. **Activity feed** — real events from Boss chats, department completions, errors
3. **Department performance** — per-department token usage, success rate, avg response time
4. **Cost tracker** — estimated $ spent per provider based on token usage
5. **Customization sync** — wallpaper, glass effect, compact mode applied everywhere

---

## PHASE 5 — Desktop App (Tauri)

**Goal:** Native desktop app that wraps the web UI.

1. **Tauri wrapper** — lightweight desktop app, local SQLite, system tray
2. **Local model support** — Ollama integration for offline AI
3. **File system access** — direct read/write to local files (Obsidian vault, code repos)
4. **Background tasks** — tasks keep running even when window is closed
5. **Notifications** — system notifications when autonomous tasks complete

---

## PHASE 6 — Multi-User & Teams

**Goal:** Other people can use your Bunz instance.

1. **User roles** — Owner, Admin, Member with different permissions
2. **Team workspaces** — shared conversations, task history
3. **Usage quotas** — per-user token limits
4. **Audit log** — who did what, when

---

## ARCHITECTURE REFERENCE

```
Client (Vite + React + Tailwind)
├── BossPage.tsx — main chat interface
├── Dashboard.tsx — KPIs + widgets (react-grid-layout)
├── IntelligencePicker.tsx — Entry/Medium/Max selector
├── useAgentStream.ts — SSE hook for live streaming
├── ActiveAgentsPanel.tsx — running jobs modal
└── TaskHistoryPanel.tsx — past jobs modal

Server (Express + TypeScript)
├── boss.ts — central orchestrator (routes to departments)
├── departments/
│   ├── types.ts — 4 departments, 3 intelligence levels, sub-agents
│   ├── executor.ts — runs sub-agents within a department
│   └── autonomous.ts — multi-step planning loop
├── agents/
│   ├── coder.ts — GitHub tool calling (10 tools, agentic loop)
│   ├── art.ts — image generation
│   └── reasoning.ts — (legacy, kept for compatibility)
├── lib/
│   ├── eventBus.ts — in-memory SSE with buffering/replay
│   ├── modelRouter.ts — multi-provider AI (OpenAI, Anthropic, Perplexity, Google, Groq, Mistral, OpenRouter)
│   └── crypto.ts — API key encryption
├── sse.ts — SSE endpoint handler
├── routes.ts — API routes (~1071 lines, cleaned)
└── storage.ts — SQLite via Drizzle ORM

Infrastructure
├── Railway (production hosting)
├── GitHub Actions (CI build check)
├── SQLite + volume (/data/data.db)
└── Redis (available but not critical — eventBus handles SSE)
```

---

## ENV VARS REQUIRED
ANTHROPIC_API_KEY, OPENAI_API_KEY, PERPLEXITY_API_KEY, GOOGLE_AI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY, SESSION_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, NODE_ENV=production, STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_ANNUAL, STRIPE_PRICE_AGENCY_MONTHLY, STRIPE_PRICE_AGENCY_ANNUAL

---

*Last updated: April 14, 2026 — Session with Claude Opus 4.6*
