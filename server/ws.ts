/**
 * WebSocket Server — Real-time cross-device sync layer.
 *
 * Every authenticated user gets a persistent WS connection per device.
 * When state changes anywhere (workflow runs, bot activity, notifications,
 * conversations, etc.), ALL of that user's connected devices get notified
 * instantly. Interact on your phone -> see it on your PC live.
 *
 * Protocol:
 *   Client -> Server:  { type: "subscribe", channels: ["workflows", "bots", ...] }
 *   Client -> Server:  { type: "ping" }
 *   Server -> Client:  { type: "sync", channel: "workflows", event: "run_started", data: {...} }
 *   Server -> Client:  { type: "pong" }
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { parse as parseCookie } from "cookie";
import { log } from "./lib/logger";

// ── Types ────────────────────────────────────────────────────────────────

export type SyncChannel =
  | "workflows"
  | "pipelines"
  | "bots"
  | "notifications"
  | "conversations"
  | "agents"
  | "connectors"
  | "wallet"
  | "dashboard"
  | "plugins"
  | "workshop"
  | "traces";

const ALL_DEFAULT_CHANNELS: SyncChannel[] = ["notifications", "dashboard"];

export interface SyncMessage {
  type: "sync";
  channel: SyncChannel;
  event: string;
  data: any;
  timestamp: number;
}

interface ClientConnection {
  ws: WebSocket;
  userId: number;
  deviceId: string;
  channels: SyncChannel[];
  lastPing: number;
}

// ── Connection Registry ──────────────────────────────────────────────────

const connections = new Map<string, ClientConnection>(); // deviceId -> connection
const userDevices = new Map<number, string[]>();          // userId -> deviceId[]

function addConnection(conn: ClientConnection) {
  connections.set(conn.deviceId, conn);
  const devices = userDevices.get(conn.userId) || [];
  if (!devices.includes(conn.deviceId)) devices.push(conn.deviceId);
  userDevices.set(conn.userId, devices);
}

function removeConnection(deviceId: string) {
  const conn = connections.get(deviceId);
  if (!conn) return;
  connections.delete(deviceId);
  const devices = userDevices.get(conn.userId);
  if (devices) {
    const idx = devices.indexOf(deviceId);
    if (idx >= 0) devices.splice(idx, 1);
    if (devices.length === 0) userDevices.delete(conn.userId);
  }
}

// ── Public API: Broadcast to user's devices ──────────────────────────────

/** Send a sync event to ALL devices for a specific user */
export function broadcastToUser(userId: number, channel: SyncChannel, event: string, data: any) {
  const devices = userDevices.get(userId);
  if (!devices || devices.length === 0) return;

  const msg: SyncMessage = {
    type: "sync",
    channel,
    event,
    data,
    timestamp: Date.now(),
  };
  const payload = JSON.stringify(msg);

  devices.forEach(deviceId => {
    const conn = connections.get(deviceId);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      if (conn.channels.includes(channel) || conn.channels.includes("dashboard")) {
        try { conn.ws.send(payload); } catch {}
      }
    }
  });
}

/** Send a sync event to ALL connected users (system-wide broadcasts) */
export function broadcastToAll(channel: SyncChannel, event: string, data: any) {
  const msg: SyncMessage = {
    type: "sync",
    channel,
    event,
    data,
    timestamp: Date.now(),
  };
  const payload = JSON.stringify(msg);

  connections.forEach(conn => {
    if (conn.ws.readyState === WebSocket.OPEN) {
      if (conn.channels.includes(channel) || conn.channels.includes("dashboard")) {
        try { conn.ws.send(payload); } catch {}
      }
    }
  });
}

/** Get count of connected devices for a user */
export function getConnectedDeviceCount(userId: number): number {
  return userDevices.get(userId)?.length ?? 0;
}

/** Get all connected user IDs */
export function getConnectedUserIds(): number[] {
  return Array.from(userDevices.keys());
}

/** Close all WebSocket connections — called on graceful shutdown */
export function shutdownWebSockets(): void {
  for (const [, conn] of Array.from(connections.entries())) {
    try {
      conn.ws.close(1001, "Server shutting down");
    } catch {}
  }
  connections.clear();
  userDevices.clear();
}

// ── Session Extraction ───────────────────────────────────────────────────

async function extractUserFromRequest(req: IncomingMessage, sessionStore: any): Promise<number | null> {
  try {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;

    const cookies = parseCookie(cookieHeader);
    let sid = cookies["bunz.sid"];
    if (!sid) return null;

    // Express session IDs are signed: s%3A<id>.<signature>
    sid = decodeURIComponent(sid);
    if (sid.startsWith("s:")) {
      sid = sid.slice(2, sid.indexOf("."));
    }

    return new Promise((resolve) => {
      if (sessionStore && typeof sessionStore.get === "function") {
        sessionStore.get(sid, (err: any, session: any) => {
          if (err || !session) return resolve(null);
          const userId = session?.passport?.user ?? session?.userId;
          resolve(userId ? Number(userId) : null);
        });
      } else {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

// ── WebSocket Server Setup ───────────────────────────────────────────────

export function setupWebSocketServer(httpServer: Server, sessionStore: any) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
  });

  log("WebSocket server started on /ws", "ws");

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    // Authenticate via session cookie
    const userId = await extractUserFromRequest(req, sessionStore);
    if (!userId) {
      ws.send(JSON.stringify({ type: "error", message: "Unauthorized" }));
      ws.close(4001, "Unauthorized");
      return;
    }

    const deviceId = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const conn: ClientConnection = {
      ws,
      userId,
      deviceId,
      channels: [...ALL_DEFAULT_CHANNELS],
      lastPing: Date.now(),
    };

    addConnection(conn);
    const deviceCount = getConnectedDeviceCount(userId);
    log(`User ${userId} connected (device: ${deviceId}, total: ${deviceCount})`, "ws");

    // Send welcome with device info
    ws.send(JSON.stringify({
      type: "connected",
      deviceId,
      connectedDevices: deviceCount,
      timestamp: Date.now(),
    }));

    // Notify other devices that a new device connected
    const devices = userDevices.get(userId) || [];
    if (devices.length > 1) {
      devices.forEach(did => {
        if (did === deviceId) return;
        const other = connections.get(did);
        if (other && other.ws.readyState === WebSocket.OPEN) {
          try {
            other.ws.send(JSON.stringify({
              type: "device_joined",
              connectedDevices: deviceCount,
              timestamp: Date.now(),
            }));
          } catch {}
        }
      });
    }

    // Handle incoming messages
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case "subscribe": {
            if (Array.isArray(msg.channels)) {
              for (const ch of msg.channels) {
                if (!conn.channels.includes(ch)) conn.channels.push(ch);
              }
            }
            ws.send(JSON.stringify({
              type: "subscribed",
              channels: conn.channels,
            }));
            break;
          }

          case "unsubscribe": {
            if (Array.isArray(msg.channels)) {
              conn.channels = conn.channels.filter((c: string) => !msg.channels.includes(c));
            }
            break;
          }

          case "ping": {
            conn.lastPing = Date.now();
            ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
            break;
          }
        }
      } catch {}
    });

    // Cleanup on disconnect
    ws.on("close", () => {
      removeConnection(deviceId);
      const remaining = getConnectedDeviceCount(userId);
      log(`User ${userId} disconnected (device: ${deviceId}, remaining: ${remaining})`, "ws");

      // Notify remaining devices
      const remainingDevices = userDevices.get(userId) || [];
      remainingDevices.forEach(did => {
        const other = connections.get(did);
        if (other && other.ws.readyState === WebSocket.OPEN) {
          try {
            other.ws.send(JSON.stringify({
              type: "device_left",
              connectedDevices: remaining,
              timestamp: Date.now(),
            }));
          } catch {}
        }
      });
    });

    ws.on("error", () => {
      removeConnection(deviceId);
    });
  });

  // Heartbeat: close stale connections every 30s
  setInterval(() => {
    const now = Date.now();
    Array.from(connections.entries()).forEach(([deviceId, conn]) => {
      if (now - conn.lastPing > 90_000) {
        log(`Closing stale WS for user ${conn.userId} device ${deviceId}`, "ws");
        try { conn.ws.close(4002, "Stale connection"); } catch {}
        removeConnection(deviceId);
      }
    });
  }, 30_000);

  return wss;
}
