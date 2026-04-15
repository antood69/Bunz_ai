# Bunz AI

AI Agent Orchestrator Platform. Boss AI routes tasks to specialist departments, manages workflows, runs autonomous bots, and builds a knowledge base in your Obsidian vault.

## Architecture

```
Boss AI (Orchestrator)
  |
  +-- Research Dept (Perplexity, web research)
  +-- Coder Dept (Claude/GPT, GitHub tools)
  +-- Writer Dept (Claude/GPT, content creation)
  +-- Artist Dept (gpt-image-1, image generation)
  +-- Workflows (multi-step pipelines)
  +-- Bots (persistent autonomous agents)
```

**Stack:** React + Tailwind (client), Express + TypeScript (server), SQLite (database), Vite (build)

## Features

- **Boss Chat** — central AI that routes to 4 departments or answers directly
- **Intelligence Levels** — Entry / Medium / Max with different models per tier
- **Code Editor** — Monaco-based IDE with local + GitHub file access, AI assistant panel
- **Task Manager** — monitor all agent jobs with filters, search, and stats
- **Workflows** — multi-step automation pipelines with AI architect assistant
- **Bots** — persistent autonomous agents with decision loops, memory, and logging
- **Dashboard** — real-time KPIs, token charts, department performance, cost estimation
- **Connectors** — Obsidian vault, Google Drive, Notion, GitHub, Slack, Stripe
- **RAG** — Boss searches your Obsidian vault for context before every response
- **Auto-save** — all outputs organized by department in your Obsidian vault
- **Image Generation** — Artist department with gpt-image-1, images display inline
- **Notifications** — in-app alerts for task/pipeline completions

## Setup

```bash
# Install dependencies
npm install

# Copy environment template and add your keys
cp .env.example .env

# Start development (two terminals)
npm run dev          # API server on :3000
npm run dev:client   # Vite client on :5173
```

## Environment Variables

```
# Required
ANTHROPIC_API_KEY=     # Claude models
OPENAI_API_KEY=        # GPT + image generation
SESSION_SECRET=        # Session encryption

# Optional
PERPLEXITY_API_KEY=    # Research department
GOOGLE_AI_API_KEY=     # Gemini models
GROQ_API_KEY=          # Fast inference
MISTRAL_API_KEY=       # Mistral models
OPENROUTER_API_KEY=    # Multi-provider routing
GITHUB_CLIENT_ID=      # GitHub OAuth
GITHUB_CLIENT_SECRET=  # GitHub OAuth
REDIS_URL=             # Session store (falls back to memory)
STRIPE_SECRET_KEY=     # Payments (optional)
```

## Project Structure

```
client/             # React + Tailwind frontend
  src/pages/        # Dashboard, BossPage, Editor, Tasks, Workflows, Bots, Settings
  src/components/   # AppLayout, MobileTabBar, dashboard widgets
server/             # Express + TypeScript backend
  boss.ts           # Boss AI orchestrator
  departments/      # executor, autonomous, types
  agents/           # coder (GitHub tools), art (image gen)
  lib/              # eventBus, modelRouter, connectorRegistry, crypto
  pipelines.ts      # Workflow engine with SSE progress
  bots.ts           # Bot engine with decision loops
shared/             # Schema definitions
workflows/          # Department operating instructions (WAT framework)
tools/              # Python scripts for deterministic execution
.tmp/               # Temporary processing files
```

## Intelligence Tiers

| Level | Boss | Research | Coder/Writer | Artist |
|-------|------|----------|-------------|--------|
| Entry | gpt-5.4-mini | gpt-5.4-mini | gpt-5.4-mini | gpt-image-1 |
| Medium | gpt-5.4 | sonar-pro | claude-sonnet-4-6 | gpt-image-1 |
| Max | claude-opus-4-6 | sonar-pro | claude-opus-4-6 | gpt-image-1 |

## Deployment

Built for Railway. Set environment variables in Railway dashboard, connect the repo, and deploy.

```bash
npm run build    # Build for production
npm start        # Start production server
```
