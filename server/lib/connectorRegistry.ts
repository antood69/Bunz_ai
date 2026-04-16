import { storage } from "../storage";
import { decryptCredentials } from "./connectorCrypto";
import type { Connector } from "@shared/schema";

export interface ConnectorAction {
  name: string;
  description: string;
  params: Record<string, { type: string; required?: boolean; description?: string }>;
}

interface ExecuteResult {
  ok: boolean;
  data?: any;
  error?: string;
}

// Pre-built actions per connector provider
const PROVIDER_ACTIONS: Record<string, ConnectorAction[]> = {
  github: [
    { name: "list_repos", description: "List authenticated user's repositories", params: { per_page: { type: "number", description: "Items per page (max 100)" } } },
    { name: "get_file", description: "Get file content from a repository", params: { owner: { type: "string", required: true }, repo: { type: "string", required: true }, path: { type: "string", required: true } } },
    { name: "create_issue", description: "Create an issue in a repository", params: { owner: { type: "string", required: true }, repo: { type: "string", required: true }, title: { type: "string", required: true }, body: { type: "string" } } },
    { name: "create_pr", description: "Create a pull request", params: { owner: { type: "string", required: true }, repo: { type: "string", required: true }, title: { type: "string", required: true }, head: { type: "string", required: true }, base: { type: "string", required: true }, body: { type: "string" } } },
  ],
  slack: [
    { name: "send_message", description: "Send a message to a Slack channel", params: { channel: { type: "string", required: true }, text: { type: "string", required: true } } },
    { name: "list_channels", description: "List Slack channels", params: { limit: { type: "number" } } },
    { name: "list_messages", description: "Read recent messages from a channel", params: { channel: { type: "string", required: true }, limit: { type: "number" } } },
    { name: "add_reaction", description: "Add an emoji reaction to a message", params: { channel: { type: "string", required: true }, timestamp: { type: "string", required: true }, name: { type: "string", required: true } } },
    { name: "upload_file", description: "Upload a file to a channel", params: { channel: { type: "string", required: true }, content: { type: "string", required: true }, filename: { type: "string", required: true }, title: { type: "string" } } },
  ],
  stripe: [
    { name: "list_customers", description: "List Stripe customers", params: { limit: { type: "number" } } },
    { name: "create_invoice", description: "Create a Stripe invoice", params: { customer: { type: "string", required: true }, description: { type: "string" } } },
  ],
  google: [
    { name: "list_emails", description: "List recent Gmail messages", params: { maxResults: { type: "number" }, query: { type: "string", description: "Gmail search query (e.g. 'from:fiverr.com is:unread')" } } },
    { name: "read_email", description: "Read a specific email's full content", params: { messageId: { type: "string", required: true } } },
    { name: "send_email", description: "Send an email", params: { to: { type: "string", required: true }, subject: { type: "string", required: true }, body: { type: "string", required: true } } },
    { name: "search_emails", description: "Search Gmail and return parsed content", params: { query: { type: "string", required: true }, maxResults: { type: "number" } } },
    { name: "list_files", description: "List Google Drive files", params: { pageSize: { type: "number" }, query: { type: "string", description: "Search query (e.g. name contains 'report')" } } },
    { name: "read_file", description: "Read a Google Drive file's content", params: { fileId: { type: "string", required: true } } },
    { name: "search_files", description: "Search Google Drive by name or content", params: { query: { type: "string", required: true }, pageSize: { type: "number" } } },
    { name: "list_events", description: "List Google Calendar events", params: { maxResults: { type: "number" } } },
  ],
  notion: [
    { name: "list_pages", description: "Search Notion pages", params: { query: { type: "string" } } },
    { name: "read_page", description: "Read a Notion page's content blocks", params: { pageId: { type: "string", required: true } } },
    { name: "create_page", description: "Create a new Notion page", params: { parentId: { type: "string", required: true }, title: { type: "string", required: true }, content: { type: "string" } } },
    { name: "query_database", description: "Query a Notion database", params: { databaseId: { type: "string", required: true } } },
  ],
  obsidian: [
    { name: "list_notes", description: "List notes in Obsidian vault", params: { folder: { type: "string", description: "Subfolder path (optional)" } } },
    { name: "read_note", description: "Read a note's content", params: { path: { type: "string", required: true, description: "Relative path from vault root (e.g. 'Projects/plan.md')" } } },
    { name: "search_notes", description: "Search notes by content", params: { query: { type: "string", required: true } } },
    { name: "write_note", description: "Create or update a note", params: { path: { type: "string", required: true }, content: { type: "string", required: true } } },
  ],
  custom_rest: [
    { name: "get", description: "HTTP GET request", params: { path: { type: "string", required: true }, query: { type: "object" } } },
    { name: "post", description: "HTTP POST request", params: { path: { type: "string", required: true }, body: { type: "object" } } },
    { name: "put", description: "HTTP PUT request", params: { path: { type: "string", required: true }, body: { type: "object" } } },
    { name: "delete", description: "HTTP DELETE request", params: { path: { type: "string", required: true } } },
  ],
  // ── New connectors ──────────────────────────────────────────────
  linkedin: [
    { name: "create_post", description: "Publish a text post to LinkedIn", params: { text: { type: "string", required: true } } },
    { name: "create_image_post", description: "Publish a post with an image", params: { text: { type: "string", required: true }, imageUrl: { type: "string", required: true } } },
  ],
  shopify: [
    { name: "list_products", description: "List products", params: { limit: { type: "number" } } },
    { name: "create_product", description: "Create a new product", params: { title: { type: "string", required: true }, body_html: { type: "string" }, product_type: { type: "string" }, price: { type: "string" } } },
    { name: "list_orders", description: "List recent orders", params: { limit: { type: "number" }, status: { type: "string" } } },
    { name: "fulfill_order", description: "Mark an order as fulfilled", params: { orderId: { type: "string", required: true } } },
  ],
  gumroad: [
    { name: "list_products", description: "List Gumroad products", params: {} },
    { name: "create_product", description: "Create a digital product", params: { name: { type: "string", required: true }, price: { type: "number", required: true }, description: { type: "string" } } },
    { name: "list_sales", description: "List recent sales", params: { after: { type: "string" } } },
  ],
};

// Test connection per provider
async function testApiKey(provider: string, config: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
  try {
    switch (provider) {
      case "openai": {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${config.apiKey}` },
        });
        if (!res.ok) return { ok: false, error: `OpenAI API returned ${res.status}` };
        return { ok: true };
      }
      case "anthropic": {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 10,
            messages: [{ role: "user", content: "hi" }],
          }),
        });
        if (!res.ok) return { ok: false, error: `Anthropic API returned ${res.status}` };
        return { ok: true };
      }
      case "github": {
        const res = await fetch("https://api.github.com/user", {
          headers: { Authorization: `token ${config.apiKey}` },
        });
        if (!res.ok) return { ok: false, error: `GitHub API returned ${res.status}` };
        return { ok: true };
      }
      case "slack": {
        const res = await fetch("https://slack.com/api/auth.test", {
          method: "POST",
          headers: { Authorization: `Bearer ${config.apiKey}` },
        });
        const data = await res.json() as any;
        if (!data.ok) return { ok: false, error: data.error || "Slack auth failed" };
        return { ok: true };
      }
      case "stripe": {
        const res = await fetch("https://api.stripe.com/v1/balance", {
          headers: { Authorization: `Bearer ${config.apiKey}` },
        });
        if (!res.ok) return { ok: false, error: `Stripe API returned ${res.status}` };
        return { ok: true };
      }
      case "obsidian": {
        const apiUrl = config.apiUrl || "https://127.0.0.1:27124";
        const apiKey = config.apiKey;
        if (!apiKey) return { ok: false, error: "No API key configured" };
        try {
          const res = await fetch(`${apiUrl}/`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (!res.ok) return { ok: false, error: `Obsidian API returned ${res.status}` };
          return { ok: true };
        } catch (e: any) {
          return { ok: false, error: `Cannot reach Obsidian: ${e.message}. Make sure the Local REST API plugin is running.` };
        }
      }
      case "linkedin": {
        const res = await fetch("https://api.linkedin.com/v2/userinfo", {
          headers: { Authorization: `Bearer ${config.accessToken || config.apiKey}` },
        });
        if (!res.ok) return { ok: false, error: `LinkedIn API returned ${res.status}` };
        return { ok: true };
      }
      case "shopify": {
        const shop = config.shop || config.shopDomain;
        const token = config.accessToken || config.apiKey;
        if (!shop || !token) return { ok: false, error: "Shop domain and token required" };
        const res = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
          headers: { "X-Shopify-Access-Token": token },
        });
        if (!res.ok) return { ok: false, error: `Shopify API returned ${res.status}` };
        return { ok: true };
      }
      case "gumroad": {
        const res = await fetch("https://api.gumroad.com/v2/user", {
          headers: { Authorization: `Bearer ${config.accessToken || config.apiKey}` },
        });
        if (!res.ok) return { ok: false, error: `Gumroad API returned ${res.status}` };
        return { ok: true };
      }
      case "custom_rest": {
        if (!config.testEndpoint) return { ok: true };
        const url = `${config.baseUrl}${config.testEndpoint}`;
        const headers: Record<string, string> = {};
        if (config.authType === "bearer") headers["Authorization"] = `Bearer ${config.authValue}`;
        else if (config.authType === "api_key") headers["X-API-Key"] = config.authValue;
        else if (config.authType === "basic") headers["Authorization"] = `Basic ${Buffer.from(config.authValue).toString("base64")}`;
        if (config.headers) {
          const parsed = typeof config.headers === "string" ? JSON.parse(config.headers) : config.headers;
          Object.assign(headers, parsed);
        }
        const res = await fetch(url, { headers });
        if (!res.ok) return { ok: false, error: `Endpoint returned ${res.status}` };
        return { ok: true };
      }
      default:
        return { ok: true };
    }
  } catch (err: any) {
    return { ok: false, error: err.message || "Connection test failed" };
  }
}

// Test OAuth2 connections
async function testOAuth2(provider: string, config: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
  try {
    const accessToken = config.accessToken;
    if (!accessToken) return { ok: false, error: "No access token" };

    switch (provider) {
      case "google": {
        const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return { ok: false, error: `Google API returned ${res.status}` };
        return { ok: true };
      }
      case "notion": {
        const res = await fetch("https://api.notion.com/v1/users/me", {
          headers: { Authorization: `Bearer ${accessToken}`, "Notion-Version": "2022-06-28" },
        });
        if (!res.ok) return { ok: false, error: `Notion API returned ${res.status}` };
        return { ok: true };
      }
      case "hubspot": {
        const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return { ok: false, error: `HubSpot API returned ${res.status}` };
        return { ok: true };
      }
      case "discord": {
        const res = await fetch("https://discord.com/api/v10/users/@me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return { ok: false, error: `Discord API returned ${res.status}` };
        return { ok: true };
      }
      case "dropbox": {
        const res = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return { ok: false, error: `Dropbox API returned ${res.status}` };
        return { ok: true };
      }
      default:
        return { ok: true };
    }
  } catch (err: any) {
    return { ok: false, error: err.message || "OAuth test failed" };
  }
}

// Execute an action on a connector
async function executeAction(connector: Connector, action: string, params: Record<string, any>): Promise<ExecuteResult> {
  try {
    const config = decryptCredentials(connector.config);

    switch (connector.provider) {
      case "github":
        return executeGitHub(config, action, params);
      case "slack":
        return executeSlack(config, action, params);
      case "stripe":
        return executeStripe(config, action, params);
      case "google":
        return executeGoogle(config, action, params);
      case "notion":
        return executeNotion(config, action, params);
      case "obsidian":
        return executeObsidian(config, action, params);
      case "linkedin":
        return executeLinkedIn(config, action, params);
      case "shopify":
        return executeShopify(config, action, params);
      case "gumroad":
        return executeGumroad(config, action, params);
      case "custom_rest":
        return executeCustomRest(config, action, params);
      default:
        return { ok: false, error: `No executor for provider: ${connector.provider}` };
    }
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

async function executeGitHub(config: Record<string, any>, action: string, params: Record<string, any>): Promise<ExecuteResult> {
  const headers = { Authorization: `token ${config.apiKey}`, Accept: "application/vnd.github.v3+json" };
  switch (action) {
    case "list_repos": {
      const res = await fetch(`https://api.github.com/user/repos?per_page=${params.per_page || 30}`, { headers });
      return { ok: res.ok, data: await res.json() };
    }
    case "get_file": {
      const res = await fetch(`https://api.github.com/repos/${params.owner}/${params.repo}/contents/${params.path}`, { headers });
      return { ok: res.ok, data: await res.json() };
    }
    case "create_issue": {
      const res = await fetch(`https://api.github.com/repos/${params.owner}/${params.repo}/issues`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ title: params.title, body: params.body }),
      });
      return { ok: res.ok, data: await res.json() };
    }
    case "create_pr": {
      const res = await fetch(`https://api.github.com/repos/${params.owner}/${params.repo}/pulls`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ title: params.title, head: params.head, base: params.base, body: params.body }),
      });
      return { ok: res.ok, data: await res.json() };
    }
    default:
      return { ok: false, error: `Unknown GitHub action: ${action}` };
  }
}

async function executeSlack(config: Record<string, any>, action: string, params: Record<string, any>): Promise<ExecuteResult> {
  const headers = { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" };
  switch (action) {
    case "send_message": {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST", headers, body: JSON.stringify({ channel: params.channel, text: params.text }),
      });
      const data = await res.json() as any;
      return { ok: data.ok, data, error: data.error };
    }
    case "list_channels": {
      const res = await fetch(`https://slack.com/api/conversations.list?limit=${params.limit || 100}`, { headers });
      const data = await res.json() as any;
      return { ok: data.ok, data: data.channels, error: data.error };
    }
    case "list_messages": {
      const res = await fetch(`https://slack.com/api/conversations.history?channel=${params.channel}&limit=${params.limit || 20}`, { headers });
      const data = await res.json() as any;
      return { ok: data.ok, data: data.messages, error: data.error };
    }
    case "add_reaction": {
      const res = await fetch("https://slack.com/api/reactions.add", {
        method: "POST", headers, body: JSON.stringify({ channel: params.channel, timestamp: params.timestamp, name: params.name }),
      });
      const data = await res.json() as any;
      return { ok: data.ok, error: data.error };
    }
    case "upload_file": {
      const res = await fetch("https://slack.com/api/files.upload", {
        method: "POST", headers,
        body: JSON.stringify({ channels: params.channel, content: params.content, filename: params.filename, title: params.title || params.filename }),
      });
      const data = await res.json() as any;
      return { ok: data.ok, data: data.file, error: data.error };
    }
    default:
      return { ok: false, error: `Unknown Slack action: ${action}` };
  }
}

async function executeStripe(config: Record<string, any>, action: string, params: Record<string, any>): Promise<ExecuteResult> {
  const headers = { Authorization: `Bearer ${config.apiKey}` };
  switch (action) {
    case "list_customers": {
      const res = await fetch(`https://api.stripe.com/v1/customers?limit=${params.limit || 10}`, { headers });
      return { ok: res.ok, data: await res.json() };
    }
    case "create_invoice": {
      const body = new URLSearchParams({ customer: params.customer });
      if (params.description) body.set("description", params.description);
      const res = await fetch("https://api.stripe.com/v1/invoices", {
        method: "POST", headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      return { ok: res.ok, data: await res.json() };
    }
    default:
      return { ok: false, error: `Unknown Stripe action: ${action}` };
  }
}

async function executeGoogle(config: Record<string, any>, action: string, params: Record<string, any>): Promise<ExecuteResult> {
  const headers = { Authorization: `Bearer ${config.accessToken}` };
  switch (action) {
    case "list_emails": {
      let url = `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${params.maxResults || 10}`;
      if (params.query) url += `&q=${encodeURIComponent(params.query)}`;
      const res = await fetch(url, { headers });
      if (!res.ok) return { ok: false, error: `Gmail API ${res.status}` };
      const data = await res.json() as any;
      // Fetch snippet for each message
      const messages = [];
      for (const msg of (data.messages || []).slice(0, params.maxResults || 10)) {
        const detail = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, { headers });
        if (detail.ok) {
          const d = await detail.json() as any;
          const getHeader = (name: string) => d.payload?.headers?.find((h: any) => h.name === name)?.value || "";
          messages.push({ id: d.id, threadId: d.threadId, snippet: d.snippet, from: getHeader("From"), subject: getHeader("Subject"), date: getHeader("Date") });
        }
      }
      return { ok: true, data: messages };
    }
    case "read_email": {
      const res = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${params.messageId}?format=full`, { headers });
      if (!res.ok) return { ok: false, error: `Gmail read failed: ${res.status}` };
      const msg = await res.json() as any;
      const getHeader = (name: string) => msg.payload?.headers?.find((h: any) => h.name === name)?.value || "";
      // Extract plain text body
      let body = "";
      const extractText = (part: any): string => {
        if (part.mimeType === "text/plain" && part.body?.data) {
          return Buffer.from(part.body.data, "base64url").toString("utf-8");
        }
        if (part.parts) return part.parts.map(extractText).join("\n");
        return "";
      };
      body = extractText(msg.payload);
      return { ok: true, data: { id: msg.id, from: getHeader("From"), to: getHeader("To"), subject: getHeader("Subject"), date: getHeader("Date"), body, snippet: msg.snippet } };
    }
    case "send_email": {
      const raw = Buffer.from(
        `To: ${params.to}\r\nSubject: ${params.subject}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${params.body}`
      ).toString("base64url");
      const res = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      if (!res.ok) return { ok: false, error: `Send email failed: ${res.status}` };
      return { ok: true, data: await res.json() };
    }
    case "search_emails": {
      // Search and return parsed content
      const listRes = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${params.maxResults || 5}&q=${encodeURIComponent(params.query)}`, { headers });
      if (!listRes.ok) return { ok: false, error: `Gmail search failed: ${listRes.status}` };
      const listData = await listRes.json() as any;
      const results = [];
      for (const msg of (listData.messages || []).slice(0, 5)) {
        const detail = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, { headers });
        if (detail.ok) {
          const d = await detail.json() as any;
          const getHeader = (name: string) => d.payload?.headers?.find((h: any) => h.name === name)?.value || "";
          let body = "";
          const extractText = (part: any): string => {
            if (part.mimeType === "text/plain" && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf-8");
            if (part.parts) return part.parts.map(extractText).join("\n");
            return "";
          };
          body = extractText(d.payload);
          results.push({ id: d.id, from: getHeader("From"), subject: getHeader("Subject"), date: getHeader("Date"), body: body.slice(0, 2000), snippet: d.snippet });
        }
      }
      return { ok: true, data: results };
    }
    case "list_files": {
      let url = `https://www.googleapis.com/drive/v3/files?pageSize=${params.pageSize || 20}&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)`;
      if (params.query) url += `&q=${encodeURIComponent(params.query)}`;
      const res = await fetch(url, { headers });
      return { ok: res.ok, data: await res.json() };
    }
    case "search_files": {
      const q = `name contains '${params.query.replace(/'/g, "\\'")}'`;
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=${params.pageSize || 20}&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)`, { headers });
      return { ok: res.ok, data: await res.json() };
    }
    case "read_file": {
      // First get file metadata to check type
      const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${params.fileId}?fields=id,name,mimeType`, { headers });
      if (!metaRes.ok) return { ok: false, error: `Failed to get file metadata: ${metaRes.status}` };
      const meta = await metaRes.json() as any;
      // For Google Docs/Sheets/Slides, export as text
      if (meta.mimeType?.startsWith("application/vnd.google-apps.")) {
        const exportType = meta.mimeType.includes("spreadsheet") ? "text/csv" : "text/plain";
        const expRes = await fetch(`https://www.googleapis.com/drive/v3/files/${params.fileId}/export?mimeType=${encodeURIComponent(exportType)}`, { headers });
        return { ok: expRes.ok, data: { ...meta, content: await expRes.text() } };
      }
      // For regular files, download content
      const dlRes = await fetch(`https://www.googleapis.com/drive/v3/files/${params.fileId}?alt=media`, { headers });
      const content = await dlRes.text();
      return { ok: dlRes.ok, data: { ...meta, content: content.slice(0, 50000) } };
    }
    case "list_events": {
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${params.maxResults || 10}`, { headers });
      return { ok: res.ok, data: await res.json() };
    }
    default:
      return { ok: false, error: `Unknown Google action: ${action}` };
  }
}

async function executeNotion(config: Record<string, any>, action: string, params: Record<string, any>): Promise<ExecuteResult> {
  const headers = { Authorization: `Bearer ${config.accessToken}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" };
  switch (action) {
    case "list_pages": {
      const res = await fetch("https://api.notion.com/v1/search", {
        method: "POST", headers, body: JSON.stringify({ query: params.query || "", filter: { property: "object", value: "page" } }),
      });
      return { ok: res.ok, data: await res.json() };
    }
    case "read_page": {
      // Get page properties
      const pageRes = await fetch(`https://api.notion.com/v1/pages/${params.pageId}`, { headers });
      if (!pageRes.ok) return { ok: false, error: `Failed to get page: ${pageRes.status}` };
      const page = await pageRes.json() as any;
      // Get page content blocks
      const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${params.pageId}/children?page_size=100`, { headers });
      const blocks = blocksRes.ok ? await blocksRes.json() as any : { results: [] };
      // Extract text from blocks
      const textContent = (blocks.results || []).map((b: any) => {
        const type = b.type;
        const block = b[type];
        if (!block?.rich_text) return "";
        return block.rich_text.map((rt: any) => rt.plain_text || "").join("");
      }).filter(Boolean).join("\n");
      return { ok: true, data: { page, content: textContent, blocks: blocks.results } };
    }
    case "create_page": {
      const res = await fetch("https://api.notion.com/v1/pages", {
        method: "POST", headers,
        body: JSON.stringify({
          parent: { page_id: params.parentId },
          properties: { title: { title: [{ text: { content: params.title } }] } },
          children: params.content ? [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: params.content } }] } }] : [],
        }),
      });
      return { ok: res.ok, data: await res.json() };
    }
    case "query_database": {
      const res = await fetch(`https://api.notion.com/v1/databases/${params.databaseId}/query`, {
        method: "POST", headers, body: JSON.stringify({}),
      });
      return { ok: res.ok, data: await res.json() };
    }
    default:
      return { ok: false, error: `Unknown Notion action: ${action}` };
  }
}

async function executeObsidian(config: Record<string, any>, action: string, params: Record<string, any>): Promise<ExecuteResult> {
  const apiUrl = config.apiUrl || "http://127.0.0.1:27123";
  const apiKey = config.apiKey;
  if (!apiKey) return { ok: false, error: "No Obsidian API key" };
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };

  try {
    switch (action) {
      case "list_notes": {
        const folder = params.folder || "/";
        const res = await fetch(`${apiUrl}/vault/${encodeURIComponent(folder)}`, { headers });
        if (!res.ok) return { ok: false, error: `List failed: ${res.status}` };
        return { ok: true, data: await res.json() };
      }
      case "read_note": {
        const res = await fetch(`${apiUrl}/vault/${encodeURIComponent(params.path)}`, { headers, });
        if (!res.ok) return { ok: false, error: `Read failed: ${res.status}` };
        const content = await res.text();
        return { ok: true, data: { path: params.path, content } };
      }
      case "search_notes": {
        const res = await fetch(`${apiUrl}/search/simple/?query=${encodeURIComponent(params.query)}`, { headers });
        if (!res.ok) return { ok: false, error: `Search failed: ${res.status}` };
        return { ok: true, data: await res.json() };
      }
      case "write_note": {
        const writeUrl = `${apiUrl}/vault/${encodeURIComponent(params.path)}`;
        const res = await fetch(writeUrl, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "text/markdown" },
          body: params.content,
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          return { ok: false, error: `Write failed: ${res.status} ${errBody}` };
        }
        return { ok: true, data: { path: params.path, written: true } };
      }
      default:
        return { ok: false, error: `Unknown Obsidian action: ${action}` };
    }
  } catch (e: any) {
    console.error(`[Obsidian] API error for action="${action}":`, e.message);
    return { ok: false, error: `Obsidian API error: ${e.message}` };
  }
}

async function executeCustomRest(config: Record<string, any>, action: string, params: Record<string, any>): Promise<ExecuteResult> {
  const method = action.toUpperCase();
  if (!["GET", "POST", "PUT", "DELETE"].includes(method)) return { ok: false, error: `Invalid method: ${method}` };

  const url = `${config.baseUrl}${params.path || ""}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (config.authType === "bearer") headers["Authorization"] = `Bearer ${config.authValue}`;
  else if (config.authType === "api_key") headers["X-API-Key"] = config.authValue;
  else if (config.authType === "basic") headers["Authorization"] = `Basic ${Buffer.from(config.authValue).toString("base64")}`;

  if (config.headers) {
    const parsed = typeof config.headers === "string" ? JSON.parse(config.headers) : config.headers;
    Object.assign(headers, parsed);
  }

  const fetchOpts: RequestInit = { method, headers };
  if (params.body && ["POST", "PUT"].includes(method)) {
    fetchOpts.body = JSON.stringify(params.body);
  }

  const res = await fetch(url, fetchOpts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, data };
}

// ── LinkedIn Executor ────────────────────────────────────────────────
async function executeLinkedIn(config: Record<string, any>, action: string, params: Record<string, any>): Promise<ExecuteResult> {
  const accessToken = config.accessToken || config.apiKey;
  if (!accessToken) return { ok: false, error: "No LinkedIn access token" };

  // Get LinkedIn user ID (sub)
  const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) return { ok: false, error: `LinkedIn profile fetch failed: ${profileRes.status}` };
  const profile = await profileRes.json() as any;
  const personUrn = `urn:li:person:${profile.sub}`;

  switch (action) {
    case "create_post": {
      const res = await fetch("https://api.linkedin.com/rest/posts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": "202401",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author: personUrn,
          commentary: params.text,
          visibility: "PUBLIC",
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: "PUBLISHED",
        }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        return { ok: false, error: `LinkedIn post failed: ${res.status} ${err}` };
      }
      return { ok: true, data: { posted: true } };
    }
    case "create_image_post": {
      // For now, post as text with image link
      const text = `${params.text}\n\n${params.imageUrl}`;
      return executeLinkedIn(config, "create_post", { text });
    }
    default:
      return { ok: false, error: `Unknown LinkedIn action: ${action}` };
  }
}

// ── Shopify Executor ────────────────────────────────────────────────
async function executeShopify(config: Record<string, any>, action: string, params: Record<string, any>): Promise<ExecuteResult> {
  const shop = config.shop || config.shopDomain; // e.g. "mystore.myshopify.com"
  const token = config.accessToken || config.apiKey;
  if (!shop || !token) return { ok: false, error: "Shop domain and access token required" };

  const baseUrl = `https://${shop}/admin/api/2024-01`;
  const headers = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };

  switch (action) {
    case "list_products": {
      const res = await fetch(`${baseUrl}/products.json?limit=${params.limit || 20}`, { headers });
      if (!res.ok) return { ok: false, error: `Shopify API ${res.status}` };
      return { ok: true, data: await res.json() };
    }
    case "create_product": {
      const product: any = { title: params.title, body_html: params.body_html || "", product_type: params.product_type || "" };
      if (params.price) product.variants = [{ price: params.price }];
      const res = await fetch(`${baseUrl}/products.json`, {
        method: "POST", headers, body: JSON.stringify({ product }),
      });
      if (!res.ok) return { ok: false, error: `Create product failed: ${res.status}` };
      return { ok: true, data: await res.json() };
    }
    case "list_orders": {
      const status = params.status || "any";
      const res = await fetch(`${baseUrl}/orders.json?limit=${params.limit || 20}&status=${status}`, { headers });
      if (!res.ok) return { ok: false, error: `Shopify API ${res.status}` };
      return { ok: true, data: await res.json() };
    }
    case "fulfill_order": {
      const res = await fetch(`${baseUrl}/orders/${params.orderId}/fulfillments.json`, {
        method: "POST", headers, body: JSON.stringify({ fulfillment: { location_id: null, notify_customer: true } }),
      });
      if (!res.ok) return { ok: false, error: `Fulfill failed: ${res.status}` };
      return { ok: true, data: await res.json() };
    }
    default:
      return { ok: false, error: `Unknown Shopify action: ${action}` };
  }
}

// ── Gumroad Executor ────────────────────────────────────────────────
async function executeGumroad(config: Record<string, any>, action: string, params: Record<string, any>): Promise<ExecuteResult> {
  const token = config.accessToken || config.apiKey;
  if (!token) return { ok: false, error: "No Gumroad access token" };

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  switch (action) {
    case "list_products": {
      const res = await fetch("https://api.gumroad.com/v2/products", { headers });
      if (!res.ok) return { ok: false, error: `Gumroad API ${res.status}` };
      return { ok: true, data: await res.json() };
    }
    case "create_product": {
      const body = new URLSearchParams({
        name: params.name,
        price: String(Math.round((params.price || 0) * 100)),
        description: params.description || "",
      });
      const res = await fetch("https://api.gumroad.com/v2/products", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!res.ok) return { ok: false, error: `Create product failed: ${res.status}` };
      return { ok: true, data: await res.json() };
    }
    case "list_sales": {
      let url = "https://api.gumroad.com/v2/sales";
      if (params.after) url += `?after=${params.after}`;
      const res = await fetch(url, { headers });
      if (!res.ok) return { ok: false, error: `Gumroad API ${res.status}` };
      return { ok: true, data: await res.json() };
    }
    default:
      return { ok: false, error: `Unknown Gumroad action: ${action}` };
  }
}

// Public API
export const connectorRegistry = {
  listActions(provider: string): ConnectorAction[] {
    return PROVIDER_ACTIONS[provider] || [];
  },

  async testConnection(connectorId: number): Promise<{ ok: boolean; error?: string }> {
    const connector = await storage.getConnector(connectorId);
    if (!connector) return { ok: false, error: "Connector not found" };

    const config = decryptCredentials(connector.config);

    if (connector.type === "oauth2") {
      return testOAuth2(connector.provider, config);
    }
    return testApiKey(connector.provider, config);
  },

  async execute(connectorId: number, action: string, params: Record<string, any>): Promise<ExecuteResult> {
    const connector = await storage.getConnector(connectorId);
    if (!connector) return { ok: false, error: "Connector not found" };

    const result = await executeAction(connector, action, params);

    // Update last used timestamp
    await storage.updateConnector(connectorId, {
      lastUsedAt: new Date().toISOString(),
      status: result.ok ? "connected" : "error",
      lastError: result.error || null,
    } as any);

    return result;
  },

  /** Execute an Obsidian action directly using env vars (no DB connector needed) */
  async executeObsidianDirect(action: string, params: Record<string, any>): Promise<ExecuteResult> {
    const apiUrl = process.env.OBSIDIAN_API_URL;
    const apiKey = process.env.OBSIDIAN_API_KEY;
    if (!apiUrl || !apiKey) return { ok: false, error: "OBSIDIAN_API_URL or OBSIDIAN_API_KEY not set" };
    return executeObsidian({ apiUrl, apiKey }, action, params);
  },
};
