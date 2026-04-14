import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { storage } from "./storage";
import { encryptCredentials, decryptCredentials, generateHmacSecret, verifyHmac, signHmac } from "./lib/connectorCrypto";
import { connectorRegistry } from "./lib/connectorRegistry";

// OAuth2 provider configs
const OAUTH2_PROVIDERS: Record<string, {
  authUrl: string;
  tokenUrl: string;
  scopes: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}> = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/calendar.readonly",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  notion: {
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: "",
    clientIdEnv: "NOTION_CLIENT_ID",
    clientSecretEnv: "NOTION_CLIENT_SECRET",
  },
  hubspot: {
    authUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scopes: "crm.objects.contacts.read",
    clientIdEnv: "HUBSPOT_CLIENT_ID",
    clientSecretEnv: "HUBSPOT_CLIENT_SECRET",
  },
  discord: {
    authUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    scopes: "identify guilds",
    clientIdEnv: "DISCORD_CLIENT_ID",
    clientSecretEnv: "DISCORD_CLIENT_SECRET",
  },
  dropbox: {
    authUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    scopes: "files.metadata.read",
    clientIdEnv: "DROPBOX_CLIENT_ID",
    clientSecretEnv: "DROPBOX_CLIENT_SECRET",
  },
};

export function createConnectorsRouter(): Router {
  const router = Router();

  // GET /api/connectors — list user's connectors (no secrets)
  router.get("/", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const rows = await storage.getConnectorsByUser(userId);
    // Strip encrypted config, return metadata only
    const safe = rows.map((c) => ({
      id: c.id,
      type: c.type,
      provider: c.provider,
      name: c.name,
      status: c.status,
      lastUsedAt: c.lastUsedAt,
      lastError: c.lastError,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
    res.json(safe);
  });

  // POST /api/connectors — create connector (encrypt + save)
  router.post("/", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { type, provider, name, config } = req.body;
    if (!type || !provider || !name || !config) {
      return res.status(400).json({ error: "Missing required fields: type, provider, name, config" });
    }
    // Auto-generate HMAC secret for inbound webhooks
    const configToStore = { ...config };
    if (type === "webhook" && config.direction === "inbound") {
      configToStore.hmacSecret = generateHmacSecret();
    }
    const encrypted = encryptCredentials(configToStore);
    const connector = await storage.createConnector({
      userId,
      type,
      provider,
      name,
      config: encrypted,
      status: "connected",
    });
    // For inbound webhooks, return the HMAC secret (shown once) and webhook URL
    const extra: Record<string, any> = {};
    if (type === "webhook" && config.direction === "inbound") {
      extra.webhookUrl = `/api/webhooks/inbound/${connector.id}`;
      extra.hmacSecret = configToStore.hmacSecret;
    }
    res.status(201).json({
      id: connector.id,
      type: connector.type,
      provider: connector.provider,
      name: connector.name,
      status: connector.status,
      createdAt: connector.createdAt,
      ...extra,
    });
  });

  // PUT /api/connectors/:id — update connector
  router.put("/:id", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const id = Number(req.params.id);
    const connector = await storage.getConnector(id);
    if (!connector) return res.status(404).json({ error: "Connector not found" });
    if (connector.userId !== userId && req.user!.role !== "owner") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const updates: any = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.status) updates.status = req.body.status;
    if (req.body.config) updates.config = encryptCredentials(req.body.config);
    const updated = await storage.updateConnector(id, updates);
    res.json({
      id: updated!.id,
      type: updated!.type,
      provider: updated!.provider,
      name: updated!.name,
      status: updated!.status,
      updatedAt: updated!.updatedAt,
    });
  });

  // DELETE /api/connectors/:id — delete connector
  router.delete("/:id", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const id = Number(req.params.id);
    const connector = await storage.getConnector(id);
    if (!connector) return res.status(404).json({ error: "Connector not found" });
    if (connector.userId !== userId && req.user!.role !== "owner") {
      return res.status(403).json({ error: "Forbidden" });
    }
    await storage.deleteConnector(id);
    res.status(204).end();
  });

  // POST /api/connectors/:id/test — test connection
  router.post("/:id/test", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const id = Number(req.params.id);
    const connector = await storage.getConnector(id);
    if (!connector) return res.status(404).json({ error: "Connector not found" });
    if (connector.userId !== userId && req.user!.role !== "owner") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const result = await connectorRegistry.testConnection(id);
    if (result.ok) {
      await storage.updateConnector(id, { status: "connected", lastError: null } as any);
    } else {
      await storage.updateConnector(id, { status: "error", lastError: result.error || "Test failed" } as any);
    }
    res.json(result);
  });

  // POST /api/connectors/:id/execute — execute action via ConnectorRegistry
  router.post("/:id/execute", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const id = Number(req.params.id);
    const connector = await storage.getConnector(id);
    if (!connector) return res.status(404).json({ error: "Connector not found" });
    if (connector.userId !== userId && req.user!.role !== "owner") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { action, params } = req.body;
    if (!action) return res.status(400).json({ error: "Missing action" });
    const result = await connectorRegistry.execute(id, action, params || {});
    res.json(result);
  });

  // GET /api/connectors/:id/actions — list available actions
  router.get("/:id/actions", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const id = Number(req.params.id);
    const connector = await storage.getConnector(id);
    if (!connector) return res.status(404).json({ error: "Connector not found" });
    if (connector.userId !== userId && req.user!.role !== "owner") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const actions = connectorRegistry.listActions(connector.provider);
    res.json(actions);
  });

  // POST /api/connectors/oauth/start — start OAuth2 flow
  router.post("/oauth/start", async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { provider } = req.body;
    if (!provider) return res.status(400).json({ error: "Missing provider" });

    // Check if it's a custom OAuth2 connector
    if (req.body.customConfig) {
      const { authUrl, clientId, scopes } = req.body.customConfig;
      const state = uuidv4();
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${appUrl}/api/connectors/oauth/callback`;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await storage.createOAuthState({ state, userId, provider: `custom_oauth2:${provider}`, redirectUri, expiresAt });
      const url = `${authUrl}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes || "")}&state=${state}`;
      return res.json({ url });
    }

    const oauthConfig = OAUTH2_PROVIDERS[provider];
    if (!oauthConfig) return res.status(400).json({ error: `Unknown OAuth2 provider: ${provider}` });

    const clientId = process.env[oauthConfig.clientIdEnv];
    if (!clientId) return res.status(400).json({ error: `${provider} OAuth2 not configured — missing ${oauthConfig.clientIdEnv}` });

    const state = uuidv4();
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${appUrl}/api/connectors/oauth/callback`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await storage.createOAuthState({ state, userId, provider, redirectUri, expiresAt });

    let url: string;
    if (provider === "notion") {
      url = `${oauthConfig.authUrl}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&owner=user&state=${state}`;
    } else {
      url = `${oauthConfig.authUrl}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(oauthConfig.scopes)}&state=${state}&access_type=offline&prompt=consent`;
    }

    res.json({ url });
  });

  // GET /api/connectors/oauth/callback — OAuth2 callback
  router.get("/oauth/callback", async (req: Request, res: Response) => {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.send(renderOAuthResult(false, String(oauthError), "unknown"));
    }
    if (!code || !state) {
      return res.send(renderOAuthResult(false, "Missing code or state", "unknown"));
    }

    const oauthState = await storage.getOAuthState(String(state));
    if (!oauthState) {
      return res.send(renderOAuthResult(false, "Invalid or expired state", "unknown"));
    }

    // Clean up used state
    await storage.deleteOAuthState(String(state));

    // Check expiry
    if (new Date(oauthState.expiresAt) < new Date()) {
      return res.send(renderOAuthResult(false, "State expired", oauthState.provider));
    }

    // Determine if custom or pre-built
    const isCustom = oauthState.provider.startsWith("custom_oauth2:");
    const providerKey = isCustom ? oauthState.provider.split(":")[1] : oauthState.provider;

    try {
      let tokenData: any;

      if (isCustom) {
        // For custom OAuth2 — we'd need the stored config. For now, return the code for manual exchange.
        tokenData = { code: String(code), provider: providerKey };
      } else {
        const oauthConfig = OAUTH2_PROVIDERS[oauthState.provider];
        const clientId = process.env[oauthConfig.clientIdEnv]!;
        const clientSecret = process.env[oauthConfig.clientSecretEnv]!;

        // Exchange code for tokens
        const tokenBody: Record<string, string> = {
          code: String(code),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: oauthState.redirectUri,
          grant_type: "authorization_code",
        };

        let tokenRes: globalThis.Response;
        if (oauthState.provider === "notion") {
          tokenRes = await fetch(oauthConfig.tokenUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
            },
            body: JSON.stringify({ code: String(code), grant_type: "authorization_code", redirect_uri: oauthState.redirectUri }),
          });
        } else {
          tokenRes = await fetch(oauthConfig.tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(tokenBody).toString(),
          });
        }

        tokenData = await tokenRes.json();
        if (!tokenRes.ok) {
          return res.send(renderOAuthResult(false, tokenData.error_description || tokenData.error || "Token exchange failed", oauthState.provider));
        }
      }

      // Store the connector with encrypted tokens
      const encrypted = encryptCredentials({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type,
        scope: tokenData.scope,
      });

      const displayNames: Record<string, string> = {
        google: "Google Workspace",
        notion: "Notion",
        hubspot: "HubSpot",
        discord: "Discord",
        dropbox: "Dropbox",
      };

      await storage.createConnector({
        userId: oauthState.userId,
        type: "oauth2",
        provider: oauthState.provider,
        name: displayNames[oauthState.provider] || providerKey,
        config: encrypted,
        status: "connected",
      });

      res.send(renderOAuthResult(true, undefined, oauthState.provider));
    } catch (err: any) {
      res.send(renderOAuthResult(false, err.message, oauthState.provider));
    }
  });

  return router;
}

// Create the inbound webhook handler (mounted separately since it needs to be public)
export function createWebhookInboundRouter(): Router {
  const router = Router();

  // POST /api/webhooks/inbound/:id — inbound webhook receiver
  router.post("/:id", async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const connector = await storage.getConnector(id);
    if (!connector || connector.type !== "webhook") {
      return res.status(404).json({ error: "Webhook not found" });
    }

    // Verify HMAC if secret configured
    try {
      const config = decryptCredentials(connector.config);
      if (config.hmacSecret) {
        const signature = req.headers["x-hmac-signature"] as string || req.headers["x-hub-signature-256"] as string;
        if (!signature) {
          return res.status(401).json({ error: "Missing HMAC signature" });
        }
        const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        if (!verifyHmac(rawBody, signature.replace("sha256=", ""), config.hmacSecret)) {
          return res.status(401).json({ error: "Invalid HMAC signature" });
        }
      }
    } catch (err) {
      // If decryption fails, still accept the webhook but log
      console.error("[Webhook] Failed to verify HMAC:", err);
    }

    // Store the event
    await storage.createWebhookEvent({
      connectorId: id,
      headers: JSON.stringify(req.headers),
      payload: JSON.stringify(req.body),
      sourceIp: req.ip || req.socket.remoteAddress,
    });

    // Update connector last used
    await storage.updateConnector(id, { lastUsedAt: new Date().toISOString() } as any);

    res.json({ received: true });
  });

  return router;
}

function renderOAuthResult(success: boolean, error?: string, provider?: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>OAuth ${success ? "Success" : "Error"}</title></head>
<body style="background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center">
    <div style="font-size:48px;margin-bottom:16px">${success ? "&#x2705;" : "&#x274C;"}</div>
    <h2 style="margin:0 0 8px">${success ? "Connected!" : "Connection Failed"}</h2>
    <p style="color:#999;margin:0">${success ? "You can close this window." : (error || "Unknown error")}</p>
  </div>
  <script>
    try {
      window.opener.postMessage({ type: 'oauth_complete', success: ${success}, provider: '${provider || "unknown"}', error: ${error ? `'${error.replace(/'/g, "\\'")}'` : "null"} }, '*');
    } catch(e) {}
    setTimeout(() => window.close(), 2000);
  </script>
</body>
</html>`;
}
