import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { storage } from "./storage";
import { sendVerificationEmail, sendLoginAlertEmail, sendWelcomeEmail } from "./email";
// TIER_CREDIT_LIMITS available from ./lib/rateLimiter if needed

const OWNER_EMAIL = "reederb46@gmail.com";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const COOKIE_NAME = "bunz_session";

// ── Extend Express Request with user context ─────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        email: string;
        role: string;
        tier: string;
        displayName: string | null;
        avatarUrl: string | null;
      };
    }
  }
}

// ── Session helpers ──────────────────────────────────────────────────────────
async function createUserSession(userId: number): Promise<string> {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  await storage.createSession({ id: sessionId, userId, expiresAt });
  return sessionId;
}

// ── Auth Middleware ───────────────────────────────────────────────────────────
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip auth for auth routes, public assets, health check
  const publicPaths = [
    "/api/auth/",
    "/api/templates",
    "/api/health",
    "/api/marketplace/listings",
    "/api/marketplace/featured",
    "/api/marketplace/trending",
    "/api/marketplace/categories",
    "/api/connectors/oauth/callback",
    "/api/webhooks/inbound/",
  ];
  if (publicPaths.some(p => req.path.startsWith(p))) return next();
  if (!req.path.startsWith("/api/")) return next();

  const sessionId = req.cookies?.[COOKIE_NAME];
  if (!sessionId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const session = await storage.getSession(sessionId);
  if (!session || new Date(session.expiresAt) < new Date()) {
    if (session) await storage.deleteSession(sessionId);
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: "Session expired" });
  }

  const user = await storage.getUser(session.userId);
  if (!user) {
    await storage.deleteSession(sessionId);
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: "User not found" });
  }

  // Block suspended users
  if (user.role === "suspended") {
    return res.status(403).json({ error: "Account suspended. Contact the platform owner." });
  }

  req.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    tier: user.tier,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };

  next();
}

// ── Role guards ──────────────────────────────────────────────────────────────
export function ownerOnly(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "owner") {
    return res.status(403).json({ error: "Owner access only" });
  }
  next();
}

export function adminOrOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user || (req.user.role !== "owner" && req.user.role !== "admin")) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// ── Audit logger ─────────────────────────────────────────────────────────────
export function auditLog(userId: number, action: string, details?: string, metadata?: any) {
  try {
    storage.insertActivityEvent({
      id: require("crypto").randomUUID(),
      userId, type: "audit", title: action,
      description: details, metadata,
    });
  } catch {}
}

// ── Intelligence collector (silently logs all AI interactions) ────────────────
export async function collectIntelligence(opts: {
  userId: number;
  userEmail?: string;
  eventType: string;
  model?: string;
  inputData?: string;
  outputData?: string;
  tokensUsed?: number;
  metadata?: string;
}) {
  try {
    await storage.recordIntelligence({
      userId: opts.userId,
      userEmail: opts.userEmail,
      eventType: opts.eventType,
      model: opts.model,
      inputData: opts.inputData,
      outputData: opts.outputData,
      tokensUsed: opts.tokensUsed,
      metadata: opts.metadata,
    });
  } catch (_) {
    // Never let intelligence collection crash the main flow
  }
}

// ── Auth Router ──────────────────────────────────────────────────────────────
export function createAuthRouter(): Router {
  const router = Router();

  // Register with email + password
  router.post("/register", async (req: Request, res: Response) => {
    const { email, password, displayName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existing = await storage.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const username = email.split("@")[0] + "_" + Math.random().toString(36).slice(2, 6);
    const isOwner = email.toLowerCase() === OWNER_EMAIL.toLowerCase();

    const user = await storage.createUser({
      username,
      email: email.toLowerCase(),
      passwordHash,
      displayName: displayName || email.split("@")[0],
      authProvider: "email",
      role: isOwner ? "owner" : "user",
      tier: isOwner ? "agency" : "free",
    } as any);

    // Create plan for new user (owner gets unlimited)
    await storage.createUserPlan({
      userId: user.id,
      tier: isOwner ? "agency" : "free",
      monthlyTokens: isOwner ? 999999999 : 3000,
      tokensUsed: 0,
      periodStart: new Date().toISOString(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Send verification email (owner auto-verified)
    if (isOwner) {
      await storage.updateUser(user.id, { emailVerified: 1 } as any);
    } else {
      sendVerificationEmail(user.id, user.email, displayName || email.split("@")[0]);
    }

    const sessionId = await createUserSession(user.id);
    res.cookie(COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DURATION_MS,
      path: "/",
    });

    // Welcome notification
    await storage.createNotification({
      userId: user.id,
      type: "welcome",
      title: "Welcome to Bunz!",
      message: "Your account has been created. Check your email to verify your address.",
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      tier: user.tier,
      avatarUrl: user.avatarUrl,
      emailVerified: isOwner ? 1 : 0,
    });
  });

  // Login with email + password
  router.post("/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await storage.getUserByEmail(email.toLowerCase());
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Update last login
    await storage.updateUser(user.id, { lastLoginAt: new Date().toISOString() } as any);

    // ── Owner plan repair: ensure owner always has agency tier + unlimited tokens ──
    if (user.email.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
      // Ensure role is "owner"
      if (user.role !== "owner") {
        await storage.updateUser(user.id, { role: "owner" } as any);
        user.role = "owner" as any;
      }
      // Repair plan to agency / 999999999 tokens
      const plan = await storage.getUserPlan(user.id);
      if (plan) {
        await storage.updateUserPlan(plan.id, {
          tier: "agency",
          monthlyTokens: 999999999,
        });
      } else {
        const now = new Date();
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        await storage.createUserPlan({
          userId: user.id,
          tier: "agency",
          monthlyTokens: 999999999,
          tokensUsed: 0,
          periodStart: now.toISOString(),
          periodEnd: periodEnd.toISOString(),
        });
      }
    }

    // Send login alert email + in-app notification
    const ipAddress = req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "Unknown";
    sendLoginAlertEmail(user.id, user.email, user.displayName || user.username, ipAddress);

    const sessionId = await createUserSession(user.id);
    res.cookie(COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DURATION_MS,
      path: "/",
    });

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      tier: user.tier,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
    });
  });

  // Logout
  router.post("/logout", async (req: Request, res: Response) => {
    const sessionId = req.cookies?.[COOKIE_NAME];
    if (sessionId) {
      await storage.deleteSession(sessionId);
    }
    res.clearCookie(COOKIE_NAME);
    res.json({ ok: true });
  });

  // Get current user (session check)
  router.get("/me", async (req: Request, res: Response) => {
    const sessionId = req.cookies?.[COOKIE_NAME];
    if (!sessionId) return res.status(401).json({ error: "Not authenticated" });

    const session = await storage.getSession(sessionId);
    if (!session || new Date(session.expiresAt) < new Date()) {
      if (session) await storage.deleteSession(sessionId);
      res.clearCookie(COOKIE_NAME);
      return res.status(401).json({ error: "Session expired" });
    }

    const user = await storage.getUser(session.userId);
    if (!user) return res.status(401).json({ error: "User not found" });

    // ── Owner plan repair on session check ──
    if (user.email.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
      if (user.role !== "owner") {
        await storage.updateUser(user.id, { role: "owner" } as any);
        user.role = "owner" as any;
      }
      const plan = await storage.getUserPlan(user.id);
      if (plan && (plan.tier !== "agency" || plan.monthlyTokens !== 999999999)) {
        await storage.updateUserPlan(plan.id, {
          tier: "agency",
          monthlyTokens: 999999999,
        });
      } else if (!plan) {
        const now = new Date();
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        await storage.createUserPlan({
          userId: user.id,
          tier: "agency",
          monthlyTokens: 999999999,
          tokensUsed: 0,
          periodStart: now.toISOString(),
          periodEnd: periodEnd.toISOString(),
        });
      }
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      tier: user.tier,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
    });
  });

  // ── Email Verification ───────────────────────────────────────────────────
  router.get("/verify-email", async (req: Request, res: Response) => {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.redirect("/#/login?error=invalid_token");
    }

    const verification = await storage.getEmailVerification(token);
    if (!verification) {
      return res.redirect("/#/login?error=invalid_token");
    }
    if (verification.verified) {
      return res.redirect("/#/login?verified=already");
    }
    if (new Date(verification.expiresAt) < new Date()) {
      return res.redirect("/#/login?error=token_expired");
    }

    await storage.markEmailVerified(token);

    // Send welcome email
    const user = await storage.getUser(verification.userId);
    if (user) {
      sendWelcomeEmail(user.email, user.displayName || user.username);
      await storage.createNotification({
        userId: user.id,
        type: "system",
        title: "Email verified",
        message: "Your email has been verified. Your account is now fully active.",
      });
    }

    res.redirect("/#/login?verified=true");
  });

  // Resend verification email
  router.post("/resend-verification", async (req: Request, res: Response) => {
    const sessionId = req.cookies?.[COOKIE_NAME];
    if (!sessionId) return res.status(401).json({ error: "Not authenticated" });

    const session = await storage.getSession(sessionId);
    if (!session) return res.status(401).json({ error: "Not authenticated" });

    const user = await storage.getUser(session.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.emailVerified) return res.json({ ok: true, message: "Already verified" });

    await sendVerificationEmail(user.id, user.email, user.displayName || user.username);
    res.json({ ok: true, message: "Verification email sent" });
  });

  // ── GitHub OAuth ─────────────────────────────────────────────────────────
  router.get("/github", (_req: Request, res: Response) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: "GitHub OAuth not configured" });
    const redirectUri = `${process.env.APP_URL || ""}/api/auth/github/callback`;
    const scope = "user:email,repo";
    res.redirect(`https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`);
  });

  router.get("/github/callback", async (req: Request, res: Response) => {
    const { code } = req.query;
    if (!code) return res.redirect("/#/login?error=no_code");

    try {
      // Exchange code for access token
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const tokenData = await tokenRes.json() as any;
      if (!tokenData.access_token) return res.redirect("/#/login?error=token_failed");

      // Get user info
      const userRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const ghUser = await userRes.json() as any;

      // Get email
      const emailRes = await fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const emails = await emailRes.json() as any[];
      const primaryEmail = emails?.find((e: any) => e.primary)?.email || ghUser.email || `${ghUser.login}@github.com`;

      // Find or create user
      let user = await storage.getUserByProviderId("github", String(ghUser.id));
      if (!user) {
        user = await storage.getUserByEmail(primaryEmail.toLowerCase());
      }

      const isOwner = primaryEmail.toLowerCase() === OWNER_EMAIL.toLowerCase();

      if (!user) {
        user = await storage.createUser({
          username: ghUser.login + "_" + Math.random().toString(36).slice(2, 5),
          email: primaryEmail.toLowerCase(),
          displayName: ghUser.name || ghUser.login,
          avatarUrl: ghUser.avatar_url,
          authProvider: "github",
          providerId: String(ghUser.id),
          emailVerified: 1, // OAuth providers verify email
          role: isOwner ? "owner" : "user",
          tier: isOwner ? "agency" : "free",
        } as any);
        await storage.createUserPlan({
          userId: user.id,
          tier: isOwner ? "agency" : "free",
          monthlyTokens: isOwner ? 999999999 : 3000,
          tokensUsed: 0,
          periodStart: new Date().toISOString(),
          periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
        // Welcome notification for new OAuth users
        await storage.createNotification({
          userId: user.id,
          type: "welcome",
          title: "Welcome to Bunz!",
          message: "Your account has been created via GitHub. You're all set.",
        });
      } else {
        // Link GitHub provider to existing user if not already linked
        const updateData: any = {
          avatarUrl: ghUser.avatar_url,
          lastLoginAt: new Date().toISOString(),
        };
        if (!user.providerId) {
          updateData.authProvider = "github";
          updateData.providerId = String(ghUser.id);
        }
        await storage.updateUser(user.id, updateData);
        // Login alert for existing users
        const ip = req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "Unknown";
        sendLoginAlertEmail(user.id, user.email, user.displayName || user.username, ip);
      }

      // Store GitHub token + username for Coder agent repo access
      await storage.setGitHubToken(user.id, tokenData.access_token, ghUser.login);

      const sessionId = await createUserSession(user.id);
      res.cookie(COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: SESSION_DURATION_MS,
        path: "/",
      });
      res.redirect("/#/");
    } catch (err) {
      console.error("GitHub OAuth error:", err);
      res.redirect("/#/login?error=oauth_failed");
    }
  });

  // ── Google OAuth ─────────────────────────────────────────────────────────
  router.get("/google", (_req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: "Google OAuth not configured" });
    const redirectUri = `${process.env.APP_URL || ""}/api/auth/google/callback`;
    const scope = "openid email profile";
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline`);
  });

  router.get("/google/callback", async (req: Request, res: Response) => {
    const { code } = req.query;
    if (!code) return res.redirect("/#/login?error=no_code");

    try {
      const redirectUri = `${process.env.APP_URL || ""}/api/auth/google/callback`;
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: code as string,
          client_id: process.env.GOOGLE_CLIENT_ID || "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenRes.json() as any;
      if (!tokenData.access_token) return res.redirect("/#/login?error=token_failed");

      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const gUser = await userRes.json() as any;

      let user = await storage.getUserByProviderId("google", gUser.id);
      if (!user) {
        user = await storage.getUserByEmail(gUser.email.toLowerCase());
      }

      const isOwner = gUser.email.toLowerCase() === OWNER_EMAIL.toLowerCase();

      if (!user) {
        user = await storage.createUser({
          username: gUser.email.split("@")[0] + "_" + Math.random().toString(36).slice(2, 5),
          email: gUser.email.toLowerCase(),
          displayName: gUser.name,
          avatarUrl: gUser.picture,
          authProvider: "google",
          providerId: gUser.id,
          emailVerified: 1,
          role: isOwner ? "owner" : "user",
          tier: isOwner ? "agency" : "free",
        } as any);
        await storage.createUserPlan({
          userId: user.id,
          tier: isOwner ? "agency" : "free",
          monthlyTokens: isOwner ? 999999999 : 3000,
          tokensUsed: 0,
          periodStart: new Date().toISOString(),
          periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
        await storage.createNotification({
          userId: user.id,
          type: "welcome",
          title: "Welcome to Bunz!",
          message: "Your account has been created via Google. You're all set.",
        });
      } else {
        // Link Google provider to existing user if not already linked
        const updateData: any = {
          avatarUrl: gUser.picture,
          lastLoginAt: new Date().toISOString(),
        };
        if (!user.providerId) {
          updateData.authProvider = "google";
          updateData.providerId = gUser.id;
        }
        await storage.updateUser(user.id, updateData);
        const ip = req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "Unknown";
        sendLoginAlertEmail(user.id, user.email, user.displayName || user.username, ip);
      }

      const sessionId = await createUserSession(user.id);
      res.cookie(COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: SESSION_DURATION_MS,
        path: "/",
      });
      res.redirect("/#/");
    } catch (err) {
      console.error("Google OAuth error:", err);
      res.redirect("/#/login?error=oauth_failed");
    }
  });

  return router;
}

// ── Owner Admin Router ───────────────────────────────────────────────────────
export function createOwnerRouter(): Router {
  const router = Router();

  // All owner routes require owner role
  router.use(ownerOnly);

  // List all users
  router.get("/users", async (_req: Request, res: Response) => {
    const users = await storage.getAllUsers();
    res.json(users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      tier: u.tier,
      authProvider: u.authProvider,
      avatarUrl: u.avatarUrl,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    })));
  });

  // Lookup specific user
  router.get("/users/:id", async (req: Request, res: Response) => {
    const user = await storage.getUser(Number(req.params.id));
    if (!user) return res.status(404).json({ error: "User not found" });

    const plan = await storage.getUserPlan(user.id);
    const usage = await storage.getTokenUsageByUser(user.id);
    const totalTokens = usage.reduce((sum, u) => sum + u.totalTokens, 0);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        tier: user.tier,
        authProvider: user.authProvider,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
      plan,
      stats: { totalTokensUsed: totalTokens, sessionCount: usage.length },
    });
  });

  // Intelligence data — all collected generations
  router.get("/intelligence", async (req: Request, res: Response) => {
    const opts = {
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
      eventType: req.query.eventType as string | undefined,
      userId: req.query.userId ? Number(req.query.userId) : undefined,
      quality: req.query.quality as string | undefined,
    };
    const [data, count] = await Promise.all([
      storage.getIntelligence(opts),
      storage.getIntelligenceCount(),
    ]);
    res.json({ data, total: count, limit: opts.limit, offset: opts.offset });
  });

  // Tag intelligence quality
  router.patch("/intelligence/:id/quality", async (req: Request, res: Response) => {
    const { quality } = req.body; // good | bad | neutral
    await storage.updateIntelligenceQuality(Number(req.params.id), quality);
    res.json({ ok: true });
  });

  // Intelligence stats/summary
  router.get("/intelligence/stats", async (_req: Request, res: Response) => {
    const total = await storage.getIntelligenceCount();
    // Get breakdown by event type using raw query
    const byType = (await storage.getIntelligence({ limit: 10000 })).reduce((acc: Record<string, number>, item) => {
      acc[item.eventType] = (acc[item.eventType] || 0) + 1;
      return acc;
    }, {});
    const byQuality = (await storage.getIntelligence({ limit: 10000 })).reduce((acc: Record<string, number>, item) => {
      const q = item.quality || "unrated";
      acc[q] = (acc[q] || 0) + 1;
      return acc;
    }, {});
    res.json({ total, byType, byQuality });
  });

  // Update user role/tier
  router.patch("/users/:id", async (req: Request, res: Response) => {
    const userId = Number(req.params.id);
    const { role, tier } = req.body;
    const updates: any = {};
    if (role) updates.role = role;
    if (tier) updates.tier = tier;
    const user = await storage.updateUser(userId, updates);
    if (!user) return res.status(404).json({ error: "User not found" });
    auditLog(req.user!.id, `Updated user ${user.email}: ${JSON.stringify(updates)}`);

    // Update plan tier if tier changed
    if (tier) {
      const TIER_TOKENS: Record<string, number> = { free: 3000, starter: 40000, pro: 200000, agency: 800000 };
      const plan = await storage.getUserPlan(userId);
      if (plan) {
        await storage.updateUserPlan(plan.id, { tier, monthlyTokens: TIER_TOKENS[tier] || 3000 });
      }
    }
    res.json(user);
  });

  // Suspend/unsuspend user
  router.post("/users/:id/suspend", async (req: Request, res: Response) => {
    const userId = Number(req.params.id);
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.role === "owner") return res.status(400).json({ error: "Cannot suspend owner" });
    const newRole = user.role === "suspended" ? "user" : "suspended";
    await storage.updateUser(userId, { role: newRole });
    auditLog(req.user!.id, `${newRole === "suspended" ? "Suspended" : "Unsuspended"} user ${user.email}`);
    res.json({ ok: true, role: newRole });
  });

  // Reset user token quota
  router.post("/users/:id/reset-quota", async (req: Request, res: Response) => {
    const userId = Number(req.params.id);
    const plan = await storage.getUserPlan(userId);
    if (!plan) return res.status(404).json({ error: "No plan found" });
    await storage.updateUserPlan(plan.id, { tokensUsed: 0, periodStart: new Date().toISOString(), periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
    auditLog(req.user!.id, `Reset quota for user ${userId}`);
    res.json({ ok: true });
  });

  // Delete user account
  router.delete("/users/:id", async (req: Request, res: Response) => {
    const userId = Number(req.params.id);
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.role === "owner") return res.status(400).json({ error: "Cannot delete owner" });
    // Delete user data
    const { sqlite } = await import("./storage");
    sqlite.prepare("DELETE FROM boss_messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)").run(userId);
    sqlite.prepare("DELETE FROM conversations WHERE user_id = ?").run(userId);
    sqlite.prepare("DELETE FROM agent_jobs WHERE user_id = ?").run(userId);
    sqlite.prepare("DELETE FROM token_usage WHERE user_id = ?").run(userId);
    sqlite.prepare("DELETE FROM user_plans WHERE user_id = ?").run(userId);
    sqlite.prepare("DELETE FROM activity_events WHERE user_id = ?").run(userId);
    sqlite.prepare("DELETE FROM users WHERE id = ?").run(userId);
    auditLog(req.user!.id, `Deleted user ${user.email}`);
    res.json({ ok: true });
  });

  // Audit log
  router.get("/audit", async (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 50;
    const events = storage.getActivityEvents(req.user!.id, limit);
    // Get all audit events across all users
    const { sqlite } = await import("./storage");
    const allAudit = sqlite.prepare("SELECT * FROM activity_events WHERE type = 'audit' ORDER BY created_at DESC LIMIT ?").all(limit) as any[];
    res.json(allAudit.map((r: any) => ({
      id: r.id, userId: r.user_id, type: r.type, title: r.title,
      description: r.description, metadata: r.metadata ? JSON.parse(r.metadata) : null,
      createdAt: r.created_at,
    })));
  });

  return router;
}
