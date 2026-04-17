/**
 * Real-time cross-device sync via WebSocket.
 *
 * Connects to /ws, authenticates via session cookie, subscribes to channels,
 * and auto-invalidates React Query caches when state changes on other devices.
 *
 * Usage:
 *   const { connectedDevices, isConnected } = useSync();
 *   useSyncChannel("workflows", (event, data) => { ... });
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";

type SyncChannel =
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

interface SyncEvent {
  type: "sync";
  channel: SyncChannel;
  event: string;
  data: any;
  timestamp: number;
}

type SyncListener = (event: string, data: any) => void;

// ── Singleton WebSocket Manager ──────────────────────────────────────────

class SyncManager {
  private ws: WebSocket | null = null;
  private listeners = new Map<SyncChannel, Set<SyncListener>>();
  private globalListeners = new Set<(msg: any) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private _isConnected = false;
  private _connectedDevices = 1;
  private _deviceId: string | null = null;
  private subscribedChannels = new Set<SyncChannel>();
  private stateListeners = new Set<() => void>();
  private reconnectAttempts = 0;

  get isConnected() { return this._isConnected; }
  get connectedDevices() { return this._connectedDevices; }
  get deviceId() { return this._deviceId; }

  /** Notify React components of state changes */
  private notifyState() {
    Array.from(this.stateListeners).forEach(fn => fn());
  }

  onStateChange(fn: () => void) {
    this.stateListeners.add(fn);
    return () => { this.stateListeners.delete(fn); };
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this._isConnected = true;
      this.reconnectAttempts = 0;
      this.notifyState();

      // Re-subscribe to channels
      if (this.subscribedChannels.size > 0) {
        this.ws?.send(JSON.stringify({
          type: "subscribe",
          channels: Array.from(this.subscribedChannels),
        }));
      }

      // Start ping interval (every 30s)
      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 30_000);
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        this.handleMessage(msg);
      } catch {}
    };

    this.ws.onclose = () => {
      this._isConnected = false;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.notifyState();
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
    this._isConnected = false;
    this.notifyState();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private handleMessage(msg: any) {
    // Notify global listeners
    Array.from(this.globalListeners).forEach(fn => fn(msg));

    switch (msg.type) {
      case "connected":
        this._deviceId = msg.deviceId;
        this._connectedDevices = msg.connectedDevices;
        this.notifyState();
        break;

      case "device_joined":
      case "device_left":
        this._connectedDevices = msg.connectedDevices;
        this.notifyState();
        break;

      case "sync":
        this.handleSync(msg as SyncEvent);
        break;
    }
  }

  private handleSync(msg: SyncEvent) {
    // Fire channel listeners
    const channelListeners = this.listeners.get(msg.channel);
    if (channelListeners) {
      Array.from(channelListeners).forEach(fn => fn(msg.event, msg.data));
    }

    // Auto-invalidate React Query caches based on channel
    const invalidationMap: Record<SyncChannel, string[]> = {
      workflows: ["/api/workflows"],
      pipelines: ["/api/pipelines"],
      bots: ["/api/bots"],
      notifications: ["/api/notifications"],
      conversations: ["/api/conversations"],
      agents: ["/api/agents"],
      connectors: ["/api/connectors"],
      wallet: ["/api/wallet"],
      dashboard: ["/api/stats"],
      plugins: ["/api/plugins"],
      workshop: ["/api/workshop"],
      traces: ["/api/traces"],
    };

    const keys = invalidationMap[msg.channel];
    if (keys) {
      for (const key of keys) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    }
  }

  subscribe(channel: SyncChannel, listener?: SyncListener): () => void {
    this.subscribedChannels.add(channel);

    if (listener) {
      let set = this.listeners.get(channel);
      if (!set) {
        set = new Set();
        this.listeners.set(channel, set);
      }
      set.add(listener);
    }

    // Tell server we want this channel
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "subscribe", channels: [channel] }));
    }

    return () => {
      if (listener) {
        const set = this.listeners.get(channel);
        if (set) {
          set.delete(listener);
          if (set.size === 0) this.listeners.delete(channel);
        }
      }
    };
  }

  onMessage(fn: (msg: any) => void) {
    this.globalListeners.add(fn);
    return () => { this.globalListeners.delete(fn); };
  }
}

// Singleton instance
export const syncManager = new SyncManager();

// ── React Hooks ──────────────────────────────────────────────────────────

/** Connect to sync on mount, disconnect on unmount. Returns connection state. */
export function useSync() {
  const [isConnected, setIsConnected] = useState(syncManager.isConnected);
  const [connectedDevices, setConnectedDevices] = useState(syncManager.connectedDevices);

  useEffect(() => {
    syncManager.connect();

    const unsub = syncManager.onStateChange(() => {
      setIsConnected(syncManager.isConnected);
      setConnectedDevices(syncManager.connectedDevices);
    });

    return unsub;
  }, []);

  return { isConnected, connectedDevices, deviceId: syncManager.deviceId };
}

/** Subscribe to a specific sync channel. Callback fires on each sync event. */
export function useSyncChannel(channel: SyncChannel, listener?: SyncListener) {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  useEffect(() => {
    const wrappedListener: SyncListener = (event, data) => {
      listenerRef.current?.(event, data);
    };

    return syncManager.subscribe(channel, listener ? wrappedListener : undefined);
  }, [channel]);
}

/** Get the sync connection status indicator component data */
export function useSyncStatus() {
  const { isConnected, connectedDevices } = useSync();

  return {
    isConnected,
    connectedDevices,
    statusColor: isConnected ? "text-emerald-400" : "text-red-400",
    statusText: isConnected
      ? connectedDevices > 1
        ? `Live on ${connectedDevices} devices`
        : "Live"
      : "Reconnecting...",
  };
}
