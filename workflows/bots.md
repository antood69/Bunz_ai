# Cortal Bot Framework — Architecture

Bots are persistent, autonomous agents that differ from workflows in key ways:

## Bots vs Workflows

| | Workflows | Bots |
|---|---|---|
| **Lifecycle** | Run once, finish | Run continuously |
| **Trigger** | Manual/cron/webhook | Event-driven + always-on |
| **State** | Stateless (each run is fresh) | Stateful (remembers context) |
| **Decision-making** | Fixed steps | AI-driven adaptive logic |
| **Complexity** | Linear pipeline | Branching, loops, conditions |
| **Example** | "Research X, write report" | "Monitor market, trade when conditions met" |

## Bot Architecture

Each bot has:
- **Identity**: name, description, icon, category
- **Brain**: system prompt + decision model that defines personality and expertise
- **Memory**: persistent state (JSON) that survives restarts
- **Triggers**: events that wake the bot (timer, webhook, data change, user message)
- **Tools**: actions the bot can take (connectors, departments, custom functions)
- **Rules**: constraints and guardrails (max spend, confirmation required, etc.)

## Bot Lifecycle

1. **Created** — user defines bot via UI or AI assistant
2. **Configured** — set triggers, tools, rules, brain prompt
3. **Started** — bot enters active loop
4. **Running** — bot monitors triggers, makes decisions, executes actions
5. **Paused** — user pauses bot, state preserved
6. **Stopped** — bot deactivated

## Event Loop

```
while (bot.status === "running") {
  event = await waitForTrigger(bot.triggers)
  context = loadState(bot.memory) + event.data
  decision = await bot.brain.decide(context)
  
  if (decision.action) {
    result = await executeAction(decision.action, decision.params)
    updateState(bot.memory, result)
    logActivity(bot, decision, result)
  }
  
  if (decision.notify) {
    notifyUser(decision.message)
  }
}
```

## Example Bots

**Futures Trading Bot:**
- Brain: "You are a prop firm trader specializing in orderflow and auction theory"
- Triggers: price data webhooks, timer (every 30s), daily review (8pm)
- Tools: exchange API connector, position manager, risk calculator
- Rules: max 2% drawdown per day, max 3 concurrent positions, must confirm >$1000 trades
- Memory: open positions, daily P&L, trade history, market context

**Content Pipeline Bot:**
- Brain: "You manage a content pipeline for Fiverr gigs"
- Triggers: new order webhook, daily check, delivery deadline
- Tools: Research dept, Writer dept, email connector
- Memory: active orders, client preferences, delivery history

**Code Guardian Bot:**
- Brain: "You monitor the GitHub repo for issues and auto-fix simple bugs"
- Triggers: GitHub webhook (new issue), daily scan
- Tools: Coder dept, GitHub connector
- Rules: only auto-fix labeled "good-first-issue", create PR not push to main
