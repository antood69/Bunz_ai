/**
 * Coder Agent — Agentic coding agent with real GitHub tool access.
 *
 * When a GitHub token + repo are provided, the Coder can:
 *  - Browse the repo file tree
 *  - Read file contents
 *  - Write/update files
 *  - Create branches
 *  - Commit multiple files atomically
 *  - Create pull requests
 *  - Search code
 *
 * Uses OpenAI function calling in an agentic loop — the LLM decides which
 * tools to call, executes them, feeds results back, and continues until done.
 *
 * Falls back to plain chat (no tools) when no GitHub context is provided.
 */

import { modelRouter } from "../lib/modelRouter";
import type { ChatResult } from "../lib/modelRouter";
import * as gh from "../lib/github";

export const CODER_DEFAULT_MODEL = "claude-sonnet-4-6";
export const CODER_FALLBACK_MODEL = "gpt-5.4";
export const CODER_TIMEOUT_MS = 120_000; // 2 min for tool-use loops
export const MAX_TOOL_ROUNDS = 15;       // prevent infinite loops

export const CODER_SYSTEM_PROMPT = `You are the Coder agent for Bunz. You specialize in programming and technical tasks.

Rules:
- Always wrap code in appropriate markdown code blocks with language tags
- Be precise and production-ready
- Include brief explanations of your approach
- If debugging, explain the root cause and fix`;

export const CODER_SYSTEM_PROMPT_WITH_TOOLS = `You are the Coder agent for Bunz — an AI coding agent with REAL access to GitHub repositories.

You can browse files, read code, write changes, create branches, commit, and open pull requests. You are not a chatbot pretending to code — you actually modify real repositories.

WORKFLOW for code tasks:
1. First, browse the repo tree to understand the structure
2. Read the relevant files you need to understand or modify
3. Plan your changes
4. Create a feature branch (use descriptive names like "fix/login-bug" or "feat/add-pagination")
5. Write your changes to files on that branch
6. Commit all changes atomically with a clear commit message
7. Create a pull request with a description of what you changed and why

Rules:
- Always read files before modifying them — never guess at existing content
- Use atomic multi-file commits when changing multiple files
- Write clean, well-commented, production-ready code
- Explain what you're doing at each step
- If you encounter errors, explain and recover
- Wrap code snippets in markdown code blocks with language tags`;

// ── Tool Definitions (OpenAI function calling format) ───────────────────────

const CODER_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_repo_tree",
      description: "Get the full file tree of the repository. Returns all file paths. Use this first to understand the project structure.",
      parameters: {
        type: "object",
        properties: {
          branch: { type: "string", description: "Branch name (optional, defaults to default branch)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_directory",
      description: "List files and directories at a specific path in the repo.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path (empty string for root)" },
          ref: { type: "string", description: "Branch or commit ref (optional)" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read the contents of a file in the repository.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to repo root" },
          ref: { type: "string", description: "Branch or commit ref (optional)" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Create or update a single file in the repo. For creating new files, omit sha. For updating existing files, include the sha from read_file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to repo root" },
          content: { type: "string", description: "Full file content to write" },
          message: { type: "string", description: "Commit message" },
          branch: { type: "string", description: "Branch to write to (optional)" },
          sha: { type: "string", description: "SHA of the file being replaced (required for updates, omit for new files)" },
        },
        required: ["path", "content", "message"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "commit_multiple_files",
      description: "Commit multiple file changes atomically in a single commit. Use this when you need to modify several files together.",
      parameters: {
        type: "object",
        properties: {
          branch: { type: "string", description: "Branch to commit to" },
          message: { type: "string", description: "Commit message" },
          files: {
            type: "array",
            description: "Array of file changes",
            items: {
              type: "object",
              properties: {
                path: { type: "string", description: "File path" },
                content: { type: "string", description: "Full file content" },
              },
              required: ["path", "content"],
            },
          },
        },
        required: ["branch", "message", "files"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_branch",
      description: "Create a new branch from the current HEAD of the default branch.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "New branch name (e.g. 'feat/add-login' or 'fix/header-bug')" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_pull_request",
      description: "Create a pull request to merge changes from a feature branch into the base branch.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "PR title" },
          head: { type: "string", description: "Source branch (the one with your changes)" },
          base: { type: "string", description: "Target branch (usually 'main')" },
          body: { type: "string", description: "PR description (markdown)" },
        },
        required: ["title", "head", "base"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_code",
      description: "Search for code patterns within the repository.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (code pattern, function name, etc.)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_branches",
      description: "List all branches in the repository.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_pull_requests",
      description: "List pull requests in the repository.",
      parameters: {
        type: "object",
        properties: {
          state: { type: "string", enum: ["open", "closed", "all"], description: "Filter by PR state (default: open)" },
        },
      },
    },
  },
];

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface CoderInput {
  task: string;
  context?: string;
  model?: string;
  signal?: AbortSignal;
  /** GitHub context — when provided, enables real repo tools */
  github?: {
    token: string;
    repo: string;      // "owner/repo"
  };
  /** Callback for streaming progress to the user */
  onProgress?: (event: string, data: any) => void;
}

export interface AgentOutput {
  content: string;
  usage: ChatResult["usage"];
  agentType: "coder";
  /** Commits made during execution */
  commits?: Array<{ sha: string; message: string; url: string }>;
  /** PRs created during execution */
  pullRequests?: Array<{ number: number; url: string; title: string }>;
}

// ── Tool Executor ───────────────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  args: any,
  token: string,
  repo: string,
): Promise<string> {
  try {
    switch (toolName) {
      case "list_repo_tree": {
        const tree = await gh.getRepoTree(token, repo, args.branch);
        // Truncate for very large repos
        const maxFiles = 500;
        const truncated = tree.length > maxFiles;
        const items = tree.slice(0, maxFiles);
        let result = items.map(f => `${f.path} (${f.size}b)`).join("\n");
        if (truncated) result += `\n\n... and ${tree.length - maxFiles} more files (use list_directory for specific paths)`;
        return result;
      }
      case "list_directory": {
        const files = await gh.listFiles(token, repo, args.path, args.ref);
        return files.map(f => `${f.type === "dir" ? "📁" : "📄"} ${f.name} ${f.type === "file" ? `(${f.size}b)` : ""}`).join("\n");
      }
      case "read_file": {
        const file = await gh.readFile(token, repo, args.path, args.ref);
        // Truncate very large files
        const maxChars = 50000;
        let content = file.content;
        if (content.length > maxChars) {
          content = content.slice(0, maxChars) + "\n\n... [truncated — file is " + file.size + " bytes]";
        }
        return `File: ${file.path} (sha: ${file.sha})\n\n${content}`;
      }
      case "write_file": {
        const result = await gh.writeFile(token, repo, args.path, args.content, args.message, args.branch, args.sha);
        return `✅ File written: ${args.path}\nCommit: ${result.sha}\nURL: ${result.html_url}`;
      }
      case "commit_multiple_files": {
        const result = await gh.commitMultipleFiles(token, repo, args.branch, args.message, args.files);
        return `✅ Committed ${args.files.length} files\nCommit: ${result.sha}\nURL: ${result.html_url}\nMessage: ${result.message}`;
      }
      case "create_branch": {
        const branch = await gh.createBranch(token, repo, args.name);
        return `✅ Branch created: ${branch.name} (sha: ${branch.sha})`;
      }
      case "create_pull_request": {
        const pr = await gh.createPullRequest(token, repo, args.title, args.head, args.base, args.body);
        return `✅ Pull request #${pr.number} created\nTitle: ${pr.title}\nURL: ${pr.html_url}`;
      }
      case "search_code": {
        const results = await gh.searchCode(token, repo, args.query);
        if (results.length === 0) return "No results found.";
        return results.map(r => {
          const matches = r.text_matches?.map(m => `  > ${m.fragment}`).join("\n") || "";
          return `${r.path}\n${matches}`;
        }).join("\n\n");
      }
      case "list_branches": {
        const branches = await gh.listBranches(token, repo);
        return branches.map(b => `${b.name} (${b.sha.slice(0, 7)})`).join("\n");
      }
      case "list_pull_requests": {
        const prs = await gh.listPullRequests(token, repo, args.state || "open");
        if (prs.length === 0) return "No pull requests found.";
        return prs.map(pr => `#${pr.number} [${pr.state}] ${pr.title}\n  ${pr.html_url}`).join("\n\n");
      }
      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (err: any) {
    return `❌ Error: ${err.message}`;
  }
}

// ── Agentic Loop (with tools) ───────────────────────────────────────────────

async function runCoderWithTools(input: CoderInput): Promise<AgentOutput> {
  const { github, signal, onProgress } = input;
  if (!github) throw new Error("GitHub context required for tool mode");

  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const model = input.model || "gpt-4.1";  // Need a model that supports tool calling well

  const systemPrompt = CODER_SYSTEM_PROMPT_WITH_TOOLS +
    `\n\nYou are working on repository: ${github.repo}`;

  const userMessage = input.context
    ? `${input.task}\n\nContext:\n${input.context}`
    : input.task;

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const commits: Array<{ sha: string; message: string; url: string }> = [];
  const pullRequests: Array<{ number: number; url: string; title: string }> = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const response = await client.chat.completions.create({
      model,
      messages,
      tools: CODER_TOOLS,
      tool_choice: "auto",
      max_completion_tokens: 4096,
    }, { signal });

    const choice = response.choices[0];
    totalPromptTokens += response.usage?.prompt_tokens ?? 0;
    totalCompletionTokens += response.usage?.completion_tokens ?? 0;

    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    // If no tool calls, the agent is done
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return {
        content: assistantMessage.content || "Task completed.",
        usage: {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
          model,
          provider: "openai",
        },
        agentType: "coder",
        commits,
        pullRequests,
      };
    }

    // Execute all tool calls
    for (const toolCall of assistantMessage.tool_calls) {
      const fnName = toolCall.function.name;
      let args: any;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
      }

      onProgress?.("tool_call", {
        tool: fnName,
        args: fnName === "write_file" || fnName === "commit_multiple_files"
          ? { ...args, content: undefined, files: args.files?.map((f: any) => ({ path: f.path })) }
          : args,
      });

      const result = await executeTool(fnName, args, github.token, github.repo);

      // Track commits and PRs
      if (fnName === "write_file" || fnName === "commit_multiple_files") {
        const shaMatch = result.match(/Commit: ([a-f0-9]+)/);
        const urlMatch = result.match(/URL: (https:\/\/[^\n]+)/);
        if (shaMatch) {
          commits.push({
            sha: shaMatch[1],
            message: args.message,
            url: urlMatch?.[1] || "",
          });
        }
      }
      if (fnName === "create_pull_request") {
        const numMatch = result.match(/#(\d+)/);
        const urlMatch = result.match(/URL: (https:\/\/[^\n]+)/);
        if (numMatch) {
          pullRequests.push({
            number: parseInt(numMatch[1]),
            url: urlMatch?.[1] || "",
            title: args.title,
          });
        }
      }

      onProgress?.("tool_result", { tool: fnName, preview: result.slice(0, 200) });

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
  }

  // Hit max rounds — return whatever we have
  const lastAssistant = messages.filter(m => m.role === "assistant").pop();
  return {
    content: (lastAssistant?.content || "Reached maximum tool-use rounds.") +
      "\n\n⚠️ Hit the tool-use limit. The task may not be fully complete.",
    usage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      model,
      provider: "openai",
    },
    agentType: "coder",
    commits,
    pullRequests,
  };
}

// ── Plain Chat (no tools — fallback) ────────────────────────────────────────

async function runCoderPlainChat(input: CoderInput): Promise<AgentOutput> {
  const model = input.model || CODER_DEFAULT_MODEL;
  const prompt = input.context
    ? `${input.task}\n\nContext:\n${input.context}`
    : input.task;

  const timeoutSignal = AbortSignal.timeout(CODER_TIMEOUT_MS);
  const signal = input.signal
    ? AbortSignal.any([input.signal, timeoutSignal])
    : timeoutSignal;

  try {
    const result = await modelRouter.chat({
      model,
      messages: [{ role: "user", content: prompt }],
      systemPrompt: CODER_SYSTEM_PROMPT,
      signal,
    });

    return {
      content: result.content,
      usage: result.usage,
      agentType: "coder",
    };
  } catch (err: any) {
    if (err?.name !== "AbortError" && model !== CODER_FALLBACK_MODEL) {
      console.warn(`[CoderAgent] ${model} failed, trying fallback ${CODER_FALLBACK_MODEL}`);
      const result = await modelRouter.chat({
        model: CODER_FALLBACK_MODEL,
        messages: [{ role: "user", content: prompt }],
        systemPrompt: CODER_SYSTEM_PROMPT,
        signal: input.signal,
      });
      return {
        content: result.content,
        usage: { ...result.usage, model: `${CODER_FALLBACK_MODEL} (fallback)` },
        agentType: "coder",
      };
    }
    throw err;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function runCoderAgent(input: CoderInput): Promise<AgentOutput> {
  // If GitHub context is provided, use the agentic tool-use loop
  if (input.github?.token && input.github?.repo) {
    return runCoderWithTools(input);
  }
  return runCoderPlainChat(input);
}
