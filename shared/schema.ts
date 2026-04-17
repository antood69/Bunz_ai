import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Workflows — the top-level orchestration unit
export const workflows = sqliteTable("workflows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"), // draft | active | paused | completed
  priority: text("priority").notNull().default("medium"), // low | medium | high | critical
  canvasState: text("canvas_state"), // JSON: React Flow nodes + edges
  isTemplate: integer("is_template").default(0), // 0 | 1
  templateCategory: text("template_category"),
  templateDescription: text("template_description"),
  isPublic: integer("is_public").default(0), // 0 | 1
  forkCount: integer("fork_count").default(0),
  useCount: integer("use_count").default(0),
  createdAt: text("created_at").notNull().default(""),
});

export const insertWorkflowSchema = createInsertSchema(workflows).omit({ id: true, createdAt: true, forkCount: true, useCount: true });
export type InsertWorkflow = z.infer<typeof insertWorkflowSchema>;
export type Workflow = typeof workflows.$inferSelect;

// Agents — AI workers assigned to workflows
export const agents = sqliteTable("agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  role: text("role").notNull(), // writer | coder | auditor | researcher | designer
  model: text("model").notNull().default("claude-sonnet"), // claude-sonnet | claude-opus | gpt-4o | perplexity
  workflowId: integer("workflow_id"),
  status: text("status").notNull().default("idle"), // idle | working | paused | error
  systemPrompt: text("system_prompt"),
  createdAt: text("created_at").notNull().default(""),
});

export const insertAgentSchema = createInsertSchema(agents).omit({ id: true, createdAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agents.$inferSelect;

// Jobs — individual tasks within a workflow
export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workflowId: integer("workflow_id").notNull(),
  agentId: integer("agent_id"),
  title: text("title").notNull(),
  status: text("status").notNull().default("queued"), // queued | running | completed | failed
  result: text("result"),
  createdAt: text("created_at").notNull().default(""),
});

export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

// Messages — chat messages per agent
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id").notNull(),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  createdAt: text("created_at").notNull().default(""),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Audit reviews — code/content reviews by auditor agents
export const auditReviews = sqliteTable("audit_reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull(),
  agentId: integer("agent_id").notNull(),
  verdict: text("verdict").notNull(), // pass | fail | warning
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(""),
});

export const insertAuditReviewSchema = createInsertSchema(auditReviews).omit({ id: true, createdAt: true });
export type InsertAuditReview = z.infer<typeof insertAuditReviewSchema>;
export type AuditReview = typeof auditReviews.$inferSelect;

// Users table (full auth system)
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // null for OAuth-only users
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  authProvider: text("auth_provider").notNull().default("email"), // email | google | github
  providerId: text("provider_id"), // OAuth provider user ID
  role: text("role").notNull().default("user"), // user | admin | owner
  emailVerified: integer("email_verified").notNull().default(0), // 0 | 1
  tier: text("tier").notNull().default("free"), // free | starter | pro | agency
  stripeCustomerId: text("stripe_customer_id"),
  subscriptionId: text("subscription_id"),
  lastLoginAt: text("last_login_at"),
  githubToken: text("github_token"),
  githubUsername: text("github_username"),
  createdAt: text("created_at").notNull().default(""),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Sessions table
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // UUID session token
  userId: integer("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(""),
});
export type Session = typeof sessions.$inferSelect;

// Owner Intelligence — collects all user generations for the owner's AI training
export const ownerIntelligence = sqliteTable("owner_intelligence", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  userEmail: text("user_email"),
  eventType: text("event_type").notNull(), // agent_chat | jarvis | workflow_run | generation
  model: text("model"),
  inputData: text("input_data"), // JSON: what the user sent
  outputData: text("output_data"), // JSON: what the AI returned
  tokensUsed: integer("tokens_used").default(0),
  quality: text("quality"), // good | bad | neutral — can be tagged later
  tags: text("tags"), // JSON array for categorization
  metadata: text("metadata"), // JSON: any extra context
  createdAt: text("created_at").notNull().default(""),
});
export type OwnerIntelligence = typeof ownerIntelligence.$inferSelect;

// Email Verification Tokens
export const emailVerifications = sqliteTable("email_verifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  verified: integer("verified").notNull().default(0), // 0 | 1
  createdAt: text("created_at").notNull().default(""),
});
export type EmailVerification = typeof emailVerifications.$inferSelect;

// In-App Notifications
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // login_alert | verification | workflow_complete | system | welcome
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"), // optional deep link within the app
  read: integer("read").notNull().default(0), // 0 | 1
  createdAt: text("created_at").notNull().default(""),
});
export type Notification = typeof notifications.$inferSelect;

// Agent Traces — full observability for every AI operation
export const agentTraces = sqliteTable("agent_traces", {
  id: text("id").primaryKey(), // UUID
  userId: integer("user_id").notNull(),
  source: text("source").notNull(), // "boss" | "editor" | "pipeline" | "bot"
  sourceId: text("source_id"), // pipeline run ID, bot ID, conversation ID
  sourceName: text("source_name"), // pipeline name, bot name, etc
  department: text("department"), // research | writer | coder | artist | boss
  model: text("model"), // actual model used
  provider: text("provider"), // openai | anthropic | google | perplexity
  inputPrompt: text("input_prompt"), // truncated to 1000 chars
  outputPreview: text("output_preview"), // truncated to 500 chars
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  totalTokens: integer("total_tokens").default(0),
  costUsd: text("cost_usd"), // estimated cost in USD (as string for precision)
  durationMs: integer("duration_ms").default(0),
  status: text("status").notNull().default("success"), // success | error | timeout
  error: text("error"), // error message if failed
  metadata: text("metadata"), // JSON: tools used, sub-agents, images generated, etc
  parentTraceId: text("parent_trace_id"), // for nested traces (boss -> department)
  createdAt: integer("created_at").notNull(),
});
export type AgentTrace = typeof agentTraces.$inferSelect;

// API Keys — for SDK access
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(), // hashed API key
  keyPrefix: text("key_prefix").notNull(), // first 8 chars for display
  scopes: text("scopes").default("all"), // JSON: ["workflows", "bots", "chat"]
  lastUsedAt: integer("last_used_at"),
  usageCount: integer("usage_count").default(0),
  expiresAt: integer("expires_at"),
  isActive: integer("is_active").default(1),
  createdAt: integer("created_at").notNull(),
});
export type ApiKey = typeof apiKeys.$inferSelect;

// Workspaces — team isolation and RBAC
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(), // URL-safe unique name
  description: text("description"),
  ownerId: integer("owner_id").notNull(),
  plan: text("plan").default("free"), // free | team | enterprise
  settings: text("settings"), // JSON: theme, limits, features
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export type Workspace = typeof workspaces.$inferSelect;

export const workspaceMembers = sqliteTable("workspace_members", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull().default("viewer"), // "admin" | "builder" | "viewer"
  joinedAt: integer("joined_at").notNull(),
});
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;

// Evaluation Test Suites — regression testing for AI workflows
export const evalSuites = sqliteTable("eval_suites", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  pipelineId: text("pipeline_id"), // which workflow this tests
  testCases: text("test_cases").notNull(), // JSON: Array<{ input, expectedOutput, assertions }>
  lastRunAt: integer("last_run_at"),
  lastRunStatus: text("last_run_status"), // "pass" | "fail" | "partial"
  lastRunResults: text("last_run_results"), // JSON: per-case pass/fail/output
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export type EvalSuite = typeof evalSuites.$inferSelect;

// Artifact Gallery — stored generated artifacts for browsing/reuse
export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  type: text("type").notNull(), // "html" | "svg" | "code" | "image" | "document"
  content: text("content").notNull(), // the artifact content
  language: text("language"), // for code artifacts: "python", "typescript", etc
  thumbnail: text("thumbnail"), // base64 or URL preview
  sourceType: text("source_type"), // "boss" | "editor" | "pipeline"
  sourceId: text("source_id"), // conversation/pipeline ID
  tags: text("tags"), // JSON array of tags
  isFavorite: integer("is_favorite").default(0),
  isPublic: integer("is_public").default(0),
  viewCount: integer("view_count").default(0),
  createdAt: integer("created_at").notNull(),
});
export type Artifact = typeof artifacts.$inferSelect;

// Agent Memory — 3-tier memory system (episodic + shared knowledge)
export const agentMemory = sqliteTable("agent_memory", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tier: text("tier").notNull(), // "episodic" | "knowledge" | "preference"
  department: text("department"), // which department created/uses this memory
  category: text("category"), // user-defined or auto-categorized
  content: text("content").notNull(), // the actual memory content
  embedding: text("embedding"), // future: vector embedding for similarity search
  source: text("source"), // what created this: "boss_chat", "pipeline", "bot", "manual"
  sourceId: text("source_id"), // conversation/pipeline/bot ID
  relevance: integer("relevance").default(50), // 0-100 relevance score (decays over time)
  accessCount: integer("access_count").default(0), // how many times recalled
  lastAccessedAt: integer("last_accessed_at"),
  metadata: text("metadata"), // JSON: tags, outcome, quality rating, etc
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export type AgentMemoryEntry = typeof agentMemory.$inferSelect;

// Escalations — agent watchdog escalation records
export const escalations = sqliteTable("escalations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull(),
  agentId: integer("agent_id"),
  level: integer("level").notNull().default(1), // 1=self-resolve, 2=reviewer, 3=boss
  reason: text("reason").notNull(), // "loop_detected" | "step_budget" | "low_confidence"
  context: text("context"), // JSON dump of last N steps
  status: text("status").notNull().default("pending"), // pending | resolved | archived
  resolution: text("resolution"),
  createdAt: text("created_at").notNull().default(""),
});
export const insertEscalationSchema = createInsertSchema(escalations).omit({ id: true, createdAt: true });
export type InsertEscalation = z.infer<typeof insertEscalationSchema>;
export type Escalation = typeof escalations.$inferSelect;

// Trade Journal — AI-powered post-trade analysis
export const tradeJournal = sqliteTable("trade_journal", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  firm: text("firm").notNull(), // "apex" | "topstep" | "ftmo" | "tradeday" etc
  instrument: text("instrument").notNull(), // "ES", "NQ", "EUR/USD" etc
  direction: text("direction").notNull(), // "long" | "short"
  entryPrice: text("entry_price").notNull(),
  exitPrice: text("exit_price"),
  pnl: text("pnl"), // can be null until closed
  riskReward: text("risk_reward"),
  entryReason: text("entry_reason"), // user notes
  aiAnalysis: text("ai_analysis"), // AI-generated post-trade analysis
  tags: text("tags"), // JSON array of tags
  status: text("status").notNull().default("open"), // open | closed
  openedAt: text("opened_at").notNull().default(""),
  closedAt: text("closed_at"),
  createdAt: text("created_at").notNull().default(""),
});
export const insertTradeJournalSchema = createInsertSchema(tradeJournal).omit({ id: true, createdAt: true });
export type InsertTradeJournal = z.infer<typeof insertTradeJournalSchema>;
export type TradeJournalEntry = typeof tradeJournal.$inferSelect;

// Bot Challenges — simulated prop firm challenge runs
export const botChallenges = sqliteTable("bot_challenges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  firm: text("firm").notNull(), // simulated firm
  accountSize: integer("account_size").notNull().default(100000),
  profitTarget: text("profit_target").notNull(), // percentage e.g. "10"
  maxDrawdown: text("max_drawdown").notNull(), // percentage e.g. "10"
  dailyDrawdown: text("daily_drawdown").notNull(), // percentage e.g. "5"
  consistencyRule: text("consistency_rule"), // e.g. "no single day > 30% of profits"
  status: text("status").notNull().default("running"), // running | passed | failed
  currentPnl: text("current_pnl").default("0"),
  peakBalance: text("peak_balance"),
  botConfig: text("bot_config"), // JSON of bot strategy settings
  startedAt: text("started_at").notNull().default(""),
  endedAt: text("ended_at"),
  createdAt: text("created_at").notNull().default(""),
});
export const insertBotChallengeSchema = createInsertSchema(botChallenges).omit({ id: true, createdAt: true });
export type InsertBotChallenge = z.infer<typeof insertBotChallengeSchema>;
export type BotChallenge = typeof botChallenges.$inferSelect;

// Token Usage — tracks every AI call's token consumption
export const tokenUsage = sqliteTable("token_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  model: text("model").notNull(), // claude-sonnet | claude-opus | gpt-4o | perplexity
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  endpoint: text("endpoint"), // "agent_chat" | "jarvis" etc
  createdAt: text("created_at").notNull().default(""),
});
export const insertTokenUsageSchema = createInsertSchema(tokenUsage).omit({ id: true, createdAt: true });
export type InsertTokenUsage = z.infer<typeof insertTokenUsageSchema>;
export type TokenUsageRecord = typeof tokenUsage.$inferSelect;

// ── Marketplace ─────────────────────────────────────────────────────────────

// MarketplaceListing — items published to the public marketplace
export type MarketplaceListing = {
  id: string;
  sellerId: number;
  title: string;
  description: string;
  shortDescription: string | null;
  category: "workflow" | "agent" | "tool" | "prompt_pack" | "theme";
  listingType: string;
  priceUsd: number; // 0 = free
  priceType: "one_time" | "monthly" | "free";
  contentRef: string | null; // JSON
  version: string;
  isPublished: number; // 0 | 1
  isVerified: number; // 0 | 1
  installCount: number;
  ratingAvg: number;
  ratingCount: number;
  previewImages: string | null; // JSON array
  tags: string | null; // JSON array
  createdAt: string;
  updatedAt: string;
};

// MarketplacePurchase — records of purchases / installs
export type MarketplacePurchase = {
  id: string;
  listingId: string;
  buyerId: number;
  sellerId: number;
  amountUsd: number;
  platformFeeUsd: number;
  sellerPayoutUsd: number;
  stripePaymentId: string | null;
  stripeTransferId: string | null;
  createdAt: string;
};

// MarketplaceReview — buyer reviews for a listing
export type MarketplaceReview = {
  id: string;
  listingId: string;
  buyerId: number;
  purchaseId: string;
  rating: number; // 1-5
  reviewText: string | null;
  isVerifiedPurchase: number; // 0 | 1
  createdAt: string;
};

// Token Packs — purchased add-on token bundles
export const tokenPacks = sqliteTable("token_packs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  tokens: integer("tokens").notNull(),
  price: integer("price").notNull(), // cents
  stripePaymentId: text("stripe_payment_id"),
  status: text("status").notNull().default("active"), // active | depleted
  tokensRemaining: integer("tokens_remaining").notNull(),
  purchasedAt: text("purchased_at").notNull().default(""),
  createdAt: text("created_at").notNull().default(""),
});
export const insertTokenPackSchema = createInsertSchema(tokenPacks).omit({ id: true, createdAt: true });
export type InsertTokenPack = z.infer<typeof insertTokenPackSchema>;
export type TokenPack = typeof tokenPacks.$inferSelect;

// User Plans — tracks subscription period token allowances
export const userPlans = sqliteTable("user_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  tier: text("tier").notNull().default("free"), // free | starter | pro | agency
  monthlyTokens: integer("monthly_tokens").notNull().default(3000),
  tokensUsed: integer("tokens_used").notNull().default(0),
  periodStart: text("period_start").notNull().default(""),
  periodEnd: text("period_end").notNull().default(""),
  createdAt: text("created_at").notNull().default(""),
});
export const insertUserPlanSchema = createInsertSchema(userPlans).omit({ id: true, createdAt: true });
export type InsertUserPlan = z.infer<typeof insertUserPlanSchema>;
export type UserPlan = typeof userPlans.$inferSelect;

// Workflow Runs — individual execution instances of a workflow
export const workflowRuns = sqliteTable("workflow_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workflowId: integer("workflow_id").notNull(),
  userId: integer("user_id").notNull().default(1),
  status: text("status").notNull().default("pending"), // pending | running | paused | completed | failed | killed
  executionMode: text("execution_mode").notNull().default("boss"), // boss | sequential | parallel
  inputData: text("input_data"), // JSON: user prompt / trigger data
  finalOutput: text("final_output"), // JSON: synthesized result
  totalTokensUsed: integer("total_tokens_used").notNull().default(0),
  error: text("error"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(""),
});
export const insertWorkflowRunSchema = createInsertSchema(workflowRuns).omit({ id: true, createdAt: true });
export type InsertWorkflowRun = z.infer<typeof insertWorkflowRunSchema>;
export type WorkflowRun = typeof workflowRuns.$inferSelect;

// Agent Executions — individual agent task executions within a workflow run
export const agentExecutions = sqliteTable("agent_executions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull(),
  agentId: integer("agent_id"),
  workerType: text("worker_type").notNull(), // boss | researcher | coder | writer | reviewer | analyst
  status: text("status").notNull().default("pending"), // pending | running | completed | failed | skipped
  inputPayload: text("input_payload"), // JSON: task description
  output: text("output"), // Agent's response text
  modelUsed: text("model_used"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  error: text("error"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(""),
});
export const insertAgentExecutionSchema = createInsertSchema(agentExecutions).omit({ id: true, createdAt: true });
export type InsertAgentExecution = z.infer<typeof insertAgentExecutionSchema>;
export type AgentExecution = typeof agentExecutions.$inferSelect;

// ── Phase 1: Boss AI Engine tables ──────────────────────────────────────────

// Conversations — Boss chat conversation threads
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(), // UUID
  userId: integer("user_id").notNull(),
  title: text("title").notNull().default("New conversation"),
  model: text("model").default("claude-sonnet"),
  source: text("source").default("boss"), // "boss" | "editor"
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

// Boss Messages — messages within a Boss conversation
export const bossMessages = sqliteTable("boss_messages", {
  id: text("id").primaryKey(), // UUID
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(), // user | assistant | system | tool
  content: text("content").notNull(),
  tokenCount: integer("token_count").default(0),
  model: text("model"),
  type: text("type").default("text"), // text | image
  imageUrl: text("image_url"),
  createdAt: integer("created_at").notNull(),
});
export type BossMessage = typeof bossMessages.$inferSelect;
export type InsertBossMessage = typeof bossMessages.$inferInsert;

// Agent Jobs — BullMQ job tracking
export const agentJobs = sqliteTable("agent_jobs", {
  id: text("id").primaryKey(), // UUID
  conversationId: text("conversation_id").notNull(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // boss | researcher | coder | writer | analyst | reviewer | artgen | browser
  status: text("status").notNull().default("pending"), // pending | running | complete | failed
  input: text("input"), // JSON
  output: text("output"), // JSON
  tokenCount: integer("token_count").default(0),
  durationMs: integer("duration_ms"),
  parentJobId: text("parent_job_id"),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
});
export type AgentJob = typeof agentJobs.$inferSelect;
export type InsertAgentJob = typeof agentJobs.$inferInsert;

// Workflow Versions — version history for the canvas editor
export const workflowVersions = sqliteTable("workflow_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workflowId: integer("workflow_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  graphState: text("graph_state").notNull(), // JSON: full node/edge state snapshot
  label: text("label"), // optional user label
  createdAt: text("created_at").notNull().default(""),
});
export const insertWorkflowVersionSchema = createInsertSchema(workflowVersions).omit({ id: true, createdAt: true });
export type InsertWorkflowVersion = z.infer<typeof insertWorkflowVersionSchema>;
export type WorkflowVersion = typeof workflowVersions.$inferSelect;

// ── Phase 2: User API Keys (BYOK with encryption) ─────────────────────────────

export const userApiKeys = sqliteTable("user_api_keys", {
  id: text("id").primaryKey(), // UUID
  userId: integer("user_id").notNull(),
  provider: text("provider").notNull(), // anthropic | openai | google | perplexity | openrouter | mistral | groq | ollama
  encryptedKey: text("encrypted_key"), // AES-256-GCM encrypted: iv:authTag:ciphertext
  label: text("label"), // user-friendly label
  endpointUrl: text("endpoint_url"), // for Ollama/custom endpoints
  defaultModel: text("default_model"),
  isDefault: integer("is_default").default(0), // 0 | 1
  isActive: integer("is_active").default(1), // 0 | 1
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});
export const insertUserApiKeySchema = createInsertSchema(userApiKeys).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserApiKey = z.infer<typeof insertUserApiKeySchema>;
export type UserApiKey = typeof userApiKeys.$inferSelect;

// ── Phase 3: Fiverr Automation ──────────────────────────────────────────────

// Gig Templates — reusable AI generation templates for different gig types
export const gigTemplates = sqliteTable("gig_templates", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(),
  outputFormat: text("output_format").default("markdown"), // markdown | code | document | design_brief
  defaultModel: text("default_model"),
  estimatedTokens: integer("estimated_tokens"),
  turnaroundHours: integer("turnaround_hours"),
  autoGenerate: integer("auto_generate").default(0), // 0 | 1
  workflowId: integer("workflow_id"), // optional: run this workflow instead of direct AI generation
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export type GigTemplate = typeof gigTemplates.$inferSelect;
export type InsertGigTemplate = typeof gigTemplates.$inferInsert;

// Webhook Secrets — HMAC verification for incoming webhooks
export const webhookSecrets = sqliteTable("webhook_secrets", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  secret: text("secret").notNull(),
  source: text("source").default("fiverr"),
  createdAt: integer("created_at").notNull(),
});
export type WebhookSecret = typeof webhookSecrets.$inferSelect;

// Manual Income Entries — non-Fiverr income tracking
export const manualIncomeEntries = sqliteTable("manual_income_entries", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: integer("amount").notNull(), // cents
  description: text("description").notNull(),
  platform: text("platform").default("manual"), // fiverr | upwork | freelancer | manual
  date: integer("date").notNull(), // unix timestamp
  createdAt: integer("created_at").notNull(),
});
export type ManualIncomeEntry = typeof manualIncomeEntries.$inferSelect;

// ── Phase 4: Agent Configs — per-user model/prompt customization per worker ──

export const agentConfigs = sqliteTable("agent_configs", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  agentType: text("agent_type").notNull(), // researcher|coder|writer|analyst|reviewer|artgen|browser
  model: text("model"), // legacy single model — kept for backward compat
  models: text("models"), // JSON array of model IDs e.g. ["claude-sonnet-4-6","gpt-5.4-mini"]
  systemPrompt: text("system_prompt"),
  isActive: integer("is_active").default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export type AgentConfig = typeof agentConfigs.$inferSelect;
export type InsertAgentConfig = typeof agentConfigs.$inferInsert;

// ── Phase 4: Workflow Executions — execution instances for visual workflows ──

export const workflowExecutions = sqliteTable("workflow_executions", {
  id: text("id").primaryKey(),
  workflowId: integer("workflow_id").notNull(),
  userId: integer("user_id").notNull(),
  status: text("status").notNull().default("pending"), // pending|running|completed|failed|killed
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at").notNull(),
});
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type InsertWorkflowExecution = typeof workflowExecutions.$inferInsert;

export const workflowNodeResults = sqliteTable("workflow_node_results", {
  id: text("id").primaryKey(),
  executionId: text("execution_id").notNull(),
  nodeId: text("node_id").notNull(),
  agentType: text("agent_type"),
  input: text("input"),
  output: text("output"),
  tokenCount: integer("token_count").default(0),
  durationMs: integer("duration_ms"),
  status: text("status").notNull().default("pending"), // pending|running|done|failed
  createdAt: integer("created_at").notNull(),
});
export type WorkflowNodeResult = typeof workflowNodeResults.$inferSelect;
export type InsertWorkflowNodeResult = typeof workflowNodeResults.$inferInsert;

// ── Phase 4: Connectors Hub ────────────────────────────────────────────────

// Connectors — external service connections (API keys, OAuth2, REST, webhooks)
export const connectors = sqliteTable("connectors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // 'api_key' | 'oauth2' | 'rest' | 'webhook'
  provider: text("provider").notNull(), // 'openai' | 'anthropic' | 'github' | 'slack' | 'stripe' | 'google' | 'notion' | 'hubspot' | 'discord' | 'dropbox' | 'custom_rest' | 'custom_webhook' | 'custom_oauth2'
  name: text("name").notNull(),
  config: text("config").notNull(), // encrypted JSON
  status: text("status").notNull().default("connected"), // 'connected' | 'disconnected' | 'error'
  lastUsedAt: text("last_used_at"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});
export const insertConnectorSchema = createInsertSchema(connectors).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertConnector = z.infer<typeof insertConnectorSchema>;
export type Connector = typeof connectors.$inferSelect;

// OAuth States — CSRF protection for OAuth2 flows
export const oauthStates = sqliteTable("oauth_states", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  state: text("state").notNull().unique(),
  userId: integer("user_id").notNull(),
  provider: text("provider").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  createdAt: text("created_at").notNull().default(""),
  expiresAt: text("expires_at").notNull(),
});
export type OAuthState = typeof oauthStates.$inferSelect;

// Webhook Events — inbound webhook event log
export const webhookEvents = sqliteTable("webhook_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  connectorId: integer("connector_id").notNull(),
  headers: text("headers"), // JSON
  payload: text("payload"), // JSON
  sourceIp: text("source_ip"),
  processedAt: text("processed_at"),
  createdAt: text("created_at").notNull().default(""),
});
export type WebhookEvent = typeof webhookEvents.$inferSelect;
