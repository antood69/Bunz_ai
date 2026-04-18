# Cortal Platform — Capability Inventory

> Internal reference for engineering and positioning. Last updated: 2026-04-17.

## Architecture: WAT Framework (Workflows, Agents, Tools)

Cortal separates concerns: probabilistic AI handles reasoning (Agents), deterministic code handles execution (Tools), and Workflows define the instructions. This makes the system reliable at scale.

---

## Capability Matrix

### FULLY BUILT

| Capability | Files | Description |
|---|---|---|
| **5 AI Departments** | `server/departments/types.ts` | Research, Coder, Artist, Writer, Reader — each with 4-5 sub-agents |
| **26 Sub-Agents** | `server/departments/types.ts` | Lead + support agents per department with role-specific prompts |
| **3 Intelligence Tiers** | `server/departments/types.ts` | Entry (fast/cheap), Medium (balanced), Max (highest quality) |
| **Boss AI Routing** | `server/boss.ts` | Central orchestrator — routes to departments or answers directly |
| **Cross-Department Context** | `server/boss.ts` | Producer→consumer chains: research/reader output feeds into writer/coder |
| **Slash Commands** | `server/boss.ts` | /research, /chart, /design, /swarm, /build, /human — auto-detected from natural language |
| **Deep Research** | `server/boss.ts` | Multi-query decomposition → parallel research → synthesis with citations |
| **Agent Swarm** | `server/boss.ts` | Parallel multi-department execution with live progress |
| **Build Project** | `server/boss.ts` | Research → parallel writer+coder+artist → packaged deliverable |
| **Autonomous Mode** | `server/departments/autonomous.ts` | Multi-step planning loop: Goal → Plan → Execute → Evaluate → Repeat |
| **Workflow Canvas** | `server/pipelines.ts`, `client/src/components/WorkflowCanvas.tsx` | Visual node editor with drag-and-drop, AI Decision nodes, Approval Gates |
| **AI Decision Nodes** | `server/pipelines.ts` | LLM evaluates conditions and branches yes/no |
| **Approval Gates** | `server/pipelines.ts` | Pauses pipeline for human review before continuing |
| **NL→Workflow Generation** | `server/pipelines.ts` | Natural language description generates full pipeline JSON |
| **3-Tier Agent Memory** | `server/memory.ts` | Episodic, Knowledge, Preference tiers with decay and proactive connections |
| **Memory Palace** | `server/memory.ts` | Finds non-obvious connections between memories |
| **Agent Traces** | `server/traces.ts` | Per-operation traces with model, tokens, duration, cost estimation |
| **Trace Viewer** | `client/src/pages/TracesPage.tsx` | Filters, search, timeline, analytics tabs |
| **MCP Server** | `server/mcp.ts` | Exposes Cortal tools via Model Context Protocol |
| **MCP Client** | `server/mcp.ts` | Connects to external MCP servers, discovers and calls tools |
| **Evaluation Framework** | `server/evals.ts` | Test suites with input/assertions, AI judge evaluates pass/fail |
| **RBAC Workspaces** | `server/workspaces.ts` | Admin/builder/viewer roles with workspace permissions |
| **SDK + API Keys** | `server/sdk.ts` | cortal_sk_ prefixed keys, REST API for departments, chat, pipelines, traces |
| **Connectors** | `server/connectors.ts` | Obsidian, GitHub, Google (OAuth), Notion, Slack, Discord, Zapier |
| **Structured JSON Outputs** | `server/lib/modelRouter.ts` | jsonMode forces JSON responses with schema validation |
| **Department Retry/Fallback** | `server/departments/executor.ts` | Auto-retry with cheaper model on failure |
| **Bots (Autonomous Agents)** | `server/bots.ts` | Scheduled bots with templates (Daily Briefing, Email Triager, etc.) |
| **Webhook Triggers** | `server/bots.ts` | POST endpoint triggers bot runs externally |
| **Clone Me (Digital Twin)** | `server/clone.ts` | 8-question interview → AI generates personality system prompt |
| **Artifact Gallery** | `server/artifacts.ts` | Saves HTML/SVG/code artifacts with favorites and previews |
| **Voice Chat** | `client/src/pages/BossPage.tsx` | Web Speech API (STT) + SpeechSynthesis (TTS) |
| **Screen Viewer (Bun Bun)** | `client/src/components/JarvisMode.tsx` | Screen Capture API → AI vision analysis |
| **Cross-Device Sync** | `server/ws.ts` | WebSocket per-user connection tracking, live sync across devices |
| **The Pulse** | `server/pulse.ts`, `client/src/pages/PulsePage.tsx` | Personalized AI landing page with dynamic cards and quick actions |
| **Global Search** | `client/src/components/GlobalSearch.tsx` | Cmd+K search across conversations, workflows, bots |
| **Onboarding Tour** | `client/src/components/OnboardingTour.tsx` | First-time user guidance |
| **Theme System** | `client/src/contexts/ThemeContext.tsx` | Dark/light themes, wallpapers, custom colors |
| **Token Tracking** | `server/storage.ts` | Per-model token usage with daily/weekly breakdowns |
| **Graceful Shutdown** | `server/index.ts` | SIGTERM handler stops bots, closes WS, drains HTTP |
| **Auth Rate Limiting** | `server/auth.ts` | 10 attempts per 15min window per IP |
| **Security Headers** | `server/index.ts` | X-Content-Type-Options, X-Frame-Options, XSS Protection |
| **gzip Compression** | `server/index.ts` | All HTTP responses compressed |
| **Path Traversal Protection** | `server/routes.ts` | Local file access disabled in production |

### PARTIALLY BUILT (working but needs depth)

| Capability | Status | What's Missing |
|---|---|---|
| **Evals** | Basic AI judge | Scoring rubrics, benchmark library, regression comparison |
| **Workspaces** | RBAC exists | No workspace-scoped memory, no workspace admin UI |
| **MCP** | Server + client work | No auto-discovery, limited tool catalog |
| **Bots** | Run on schedule | No conditional triggers, no inter-bot communication |
| **Workshop/Marketplace** | CRUD exists | No payment flow, no ratings, no version management |

### NOT BUILT

| Capability | Priority | Notes |
|---|---|---|
| **Streaming responses** | High | Boss direct answers don't stream tokens to client |
| **Workflow analytics** | Medium | No per-workflow success rate, avg duration, cost tracking |
| **Department versioning** | Medium | Can't A/B test prompt versions |
| **Inter-department handoff protocol** | Low | Formal handoff with typed contracts between depts |
| **Multi-tenant data isolation** | Low | Workspaces share same DB with user_id filter |

---

## Competitive Differentiation

### vs. CrewAI
- Cortal: Full platform with UI, not just a Python library
- Cortal: Visual workflow canvas, not code-only
- Cortal: Built-in memory, traces, evals — CrewAI requires external setup
- Cortal: Multi-provider model routing with fallback chains

### vs. Dify
- Cortal: Department-based architecture (specialized teams vs. generic agents)
- Cortal: Sub-agent cascade within departments (lead → support → reviewer)
- Cortal: Auto-detection of user intent (no need to pick the right workflow)
- Cortal: Cross-department context sharing (research feeds into writer)

### vs. n8n
- Cortal: AI-native (departments, memory, routing) — not bolted onto an automation tool
- Cortal: Natural language task decomposition — not manual node wiring for every flow
- Cortal: Agent memory persists across sessions

### vs. Lindy AI
- Cortal: Open architecture with SDK + MCP — not a closed platform
- Cortal: Visual workflow canvas with AI decision nodes
- Cortal: Full observability traces — not black-box execution
- Cortal: Self-hosted option (Railway) — data never leaves your infra

### What Makes Cortal Unique
1. **Department model** — Specialized AI teams with sub-agent cascades, not generic "agents"
2. **Auto-routing** — Natural language → right department without user configuration
3. **Cross-department context** — Producer→consumer chains share results automatically
4. **WAT framework** — Clear separation of Workflows, Agents, Tools for reliability
5. **Full-stack platform** — UI + API + SDK + MCP in one deployable unit
