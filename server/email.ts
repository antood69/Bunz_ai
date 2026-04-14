import { Resend } from "resend";
import { storage } from "./storage";
import { v4 as uuidv4 } from "uuid";

const RESEND_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || "Bunz <noreply@bunz.io>";
const APP_URL = process.env.APP_URL || "https://bunz.io";

// ── Email Templates ──────────────────────────────────────────────────────────

function verificationEmailHtml(displayName: string, verifyUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#131518;font-family:'Inter',system-ui,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#1a1d22;border-radius:16px;border:1px solid #2a2d35;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#0066ff,#0044cc);padding:32px 40px;">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">Bunz</h1>
    </div>
    <div style="padding:40px;">
      <h2 style="color:#e8eaed;margin:0 0 12px;font-size:20px;">Verify your email</h2>
      <p style="color:#9aa0a8;font-size:15px;line-height:1.6;margin:0 0 28px;">
        Hey ${displayName}, welcome to Bunz. Click the button below to verify your email address and activate your account.
      </p>
      <a href="${verifyUrl}" style="display:inline-block;background:#0066ff;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">
        Verify Email
      </a>
      <p style="color:#666;font-size:13px;margin:28px 0 0;line-height:1.5;">
        If the button doesn't work, copy and paste this URL:<br/>
        <a href="${verifyUrl}" style="color:#0066ff;word-break:break-all;">${verifyUrl}</a>
      </p>
      <p style="color:#555;font-size:12px;margin:20px 0 0;">This link expires in 24 hours.</p>
    </div>
  </div>
</body>
</html>`;
}

function loginAlertHtml(displayName: string, loginTime: string, ipHint: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#131518;font-family:'Inter',system-ui,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#1a1d22;border-radius:16px;border:1px solid #2a2d35;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#0066ff,#0044cc);padding:32px 40px;">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">Bunz</h1>
    </div>
    <div style="padding:40px;">
      <h2 style="color:#e8eaed;margin:0 0 12px;font-size:20px;">New sign-in to your account</h2>
      <p style="color:#9aa0a8;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Hey ${displayName}, your Bunz account was just signed into.
      </p>
      <div style="background:#22252b;border-radius:10px;padding:20px;margin:0 0 20px;">
        <p style="color:#9aa0a8;font-size:13px;margin:0 0 8px;"><strong style="color:#e8eaed;">Time:</strong> ${loginTime}</p>
        <p style="color:#9aa0a8;font-size:13px;margin:0;"><strong style="color:#e8eaed;">IP:</strong> ${ipHint}</p>
      </div>
      <p style="color:#666;font-size:13px;line-height:1.5;margin:0;">
        If this was you, no action is needed. If you don't recognize this activity, 
        <a href="${APP_URL}/#/settings" style="color:#0066ff;">change your password immediately</a>.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function welcomeEmailHtml(displayName: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#131518;font-family:'Inter',system-ui,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#1a1d22;border-radius:16px;border:1px solid #2a2d35;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#0066ff,#0044cc);padding:32px 40px;">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">Bunz</h1>
    </div>
    <div style="padding:40px;">
      <h2 style="color:#e8eaed;margin:0 0 12px;font-size:20px;">Welcome to Bunz 👋</h2>
      <p style="color:#9aa0a8;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Hey ${displayName}, your account is now verified and ready to go. Here's what you can do:
      </p>
      <ul style="color:#9aa0a8;font-size:14px;line-height:2;padding-left:20px;margin:0 0 28px;">
        <li>Build AI agent workflows with the visual editor</li>
        <li>Chat with specialized AI agents</li>
        <li>Run multi-agent orchestration pipelines</li>
        <li>Ask The Boss anything — your platform-wide AI assistant</li>
      </ul>
      <a href="${APP_URL}/#/" style="display:inline-block;background:#0066ff;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">
        Open Bunz
      </a>
    </div>
  </div>
</body>
</html>`;
}

// ── Send Functions ────────────────────────────────────────────────────────────

export async function sendVerificationEmail(userId: number, email: string, displayName: string): Promise<boolean> {
  try {
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    await storage.createEmailVerification(userId, token, expiresAt);

    const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}`;

    if (!resend) { console.log("[email] Resend not configured, skipping verification email"); return true; }
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Verify your Bunz account",
      html: verificationEmailHtml(displayName || email.split("@")[0], verifyUrl),
    });

    // Create in-app notification
    await storage.createNotification({
      userId,
      type: "verification",
      title: "Verify your email",
      message: "Check your inbox for a verification link to activate your account.",
    });

    return true;
  } catch (err) {
    console.error("Failed to send verification email:", err);
    return false;
  }
}

export async function sendLoginAlertEmail(userId: number, email: string, displayName: string, ipAddress: string): Promise<void> {
  try {
    if (!resend) { console.log("[email] Resend not configured, skipping login alert"); return; }
    const loginTime = new Date().toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });

    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "New sign-in to your Bunz account",
      html: loginAlertHtml(displayName || email.split("@")[0], loginTime, ipAddress || "Unknown"),
    });

    // Create in-app notification
    await storage.createNotification({
      userId,
      type: "login_alert",
      title: "New sign-in detected",
      message: `Your account was signed into at ${new Date().toLocaleTimeString()}.`,
    });
  } catch (err) {
    console.error("Failed to send login alert:", err);
  }
}

export async function sendWelcomeEmail(email: string, displayName: string): Promise<void> {
  try {
    if (!resend) { console.log("[email] Resend not configured, skipping welcome email"); return; }
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Welcome to Bunz — let's build something cool",
      html: welcomeEmailHtml(displayName || email.split("@")[0]),
    });
  } catch (err) {
    console.error("Failed to send welcome email:", err);
  }
}
