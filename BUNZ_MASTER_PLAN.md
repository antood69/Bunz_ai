# BUNZ — Status Report & Next Steps
### Updated: April 14, 2026 | 44 commits | Built with Claude Opus 4.6

---

## What Bunz Does
AI Agent Orchestrator. Boss AI routes tasks to 4 departments (Research, Coder, Artist, Writer). Autonomous mode chains departments together for complex tasks. Runs on Railway.

**Repo:** github.com/antood69/bunz | **Local:** C:\Users\reede\bunz-repo

---

## WORKING ✅
- Boss Chat routes to departments or answers directly
- 4 departments: Research (Perplexity), Coder (Claude/GPT), Artist (gpt-image-1), Writer (Claude/GPT)
- Intelligence levels: Entry / Medium / Max
- Autonomous multi-step: Plan → Research → Write → Code → Synthesize
- Department Pipeline UI with live status cards (all 3 depts show simultaneously)
- Dashboard KPIs: Active Agents, Tokens (246K), Tasks (20+), Conversations (23+)
- Token Usage chart, Model Usage pie, System Health widget
- Task History panel (click Tasks Run KPI)
- Image generation via OpenAI Images API (generates successfully)
- GitHub Actions CI, GitHub OAuth, BYOK keys, Stripe skeleton
- eventBus SSE streaming with 15min timeout

## BROKEN ❌ — Priority Fix List

| # | Bug | Impact | Root Cause |
|---|-----|--------|------------|
| 1 | **Messages disappear** — user message and planning message vanish after task completes | HIGH | Messages are local state only. When synthesis replaces the streaming UI, local messages not saved to server are lost. Need to save user+plan messages to server immediately. |
| 2 | **Generated images don't display** — Artist dept generates image but it never appears in chat | HIGH | Image saved to disk at `/generated/img_xxx.png` but: (a) the file may not persist on Railway's ephemeral filesystem, (b) the `agent_image` SSE event may fire but client doesn't render it visibly. Need to save to /data volume or use persistent storage. |
| 3 | **Activity feed always empty** | MEDIUM | insertActivityEvent may fail silently. Needs Railway log verification. |
| 4 | **Active Agents KPI shows 0 during tasks** | MEDIUM | Jobs complete too fast for 3s polling to catch. |
| 5 | **Wallpaper/glass/compact mode partial** | LOW | CSS not propagated to all pages. |
| 6 | **"Upcoming Scheduled" widget** | LOW | References deleted workflow system. Remove from registry. |

---

## ARCHITECTURE (current)
```
Client: Vite + React + Tailwind
  BossPage.tsx (1158 lines) — main chat
  Dashboard.tsx — KPIs + widgets
  useAgentStream.ts — SSE hook

Server: Express + TypeScript
  boss.ts (490 lines) — orchestrator
  departments/ — executor.ts, autonomous.ts, types.ts
  agents/ — coder.ts (GitHub tools), art.ts (gpt-image-1)
  lib/ — eventBus.ts, modelRouter.ts (7 providers), crypto.ts
  routes.ts (952 lines), storage.ts (3247 lines)

Infra: Railway + SQLite + GitHub Actions CI
```

## INTELLIGENCE LEVELS
| Level | Boss | Research | Coder/Writer | Artist |
|-------|------|----------|-------------|--------|
| Entry | gpt-5.4-mini | gpt-5.4-mini | gpt-5.4-mini | gpt-image-1 |
| Medium | gpt-5.4 | sonar-pro | claude-sonnet-4-6 | gpt-image-1 |
| Max | claude-opus-4-6 | sonar-pro | claude-opus-4-6 | gpt-image-1 |

## ROADMAP
1. **Stabilize** — fix bugs 1-2 above (messages + images)
2. **Self-improvement loop** — Coder dept creates branches + PRs
3. **Task Manager** — dedicated /tasks page
4. **Connectors** — Obsidian vault, Google Drive, Notion
5. **Dashboard v2** — accurate real-time everything
6. **Desktop App** — Tauri + Ollama
7. **Multi-user** — roles, quotas, audit log

## ENV VARS
ANTHROPIC_API_KEY, OPENAI_API_KEY, PERPLEXITY_API_KEY, GOOGLE_AI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY, SESSION_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, NODE_ENV=production, STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET + price IDs

*44 commits. ~17,000 lines dead code removed. 4 departments online.*
