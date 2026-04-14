import { storage } from "./storage";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface BrokerOrder {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  type: "market" | "limit";
  limitPrice?: number;
  timeInForce?: "day" | "gtc";
}

export interface BrokerPosition {
  symbol: string;
  qty: number;
  side: string;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  marketValue: number;
}

export interface BrokerAccount {
  id: string;
  cash: number;
  portfolioValue: number;
  buyingPower: number;
  equity: number;
}

// ── Alpaca API wrapper ────────────────────────────────────────────────────────

export class AlpacaBroker {
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string, isPaper: boolean) {
    this.baseUrl = isPaper
      ? "https://paper-api.alpaca.markets"
      : "https://api.alpaca.markets";
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private async request(path: string, method = "GET", body?: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "APCA-API-KEY-ID": this.apiKey,
        "APCA-API-SECRET-KEY": this.apiSecret,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Alpaca API error: ${res.status} ${err}`);
    }

    // DELETE endpoints may return 204 with no body
    if (res.status === 204) return null;

    return res.json();
  }

  async getAccount(): Promise<BrokerAccount> {
    const data = await this.request("/v2/account");
    return {
      id: data.id,
      cash: parseFloat(data.cash),
      portfolioValue: parseFloat(data.portfolio_value),
      buyingPower: parseFloat(data.buying_power),
      equity: parseFloat(data.equity),
    };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    const data = await this.request("/v2/positions");
    if (!Array.isArray(data)) return [];
    return data.map((p: any) => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty),
      side: p.side,
      avgEntryPrice: parseFloat(p.avg_entry_price),
      currentPrice: parseFloat(p.current_price ?? p.avg_entry_price),
      unrealizedPnl: parseFloat(p.unrealized_pl ?? 0),
      marketValue: parseFloat(p.market_value ?? 0),
    }));
  }

  async getOrders(status = "all", limit = 50): Promise<any[]> {
    const data = await this.request(`/v2/orders?status=${status}&limit=${limit}`);
    return Array.isArray(data) ? data : [];
  }

  async getClosedOrders(after?: string, limit = 100): Promise<any[]> {
    let path = `/v2/orders?status=closed&limit=${limit}`;
    if (after) path += `&after=${encodeURIComponent(after)}`;
    const data = await this.request(path);
    return Array.isArray(data) ? data : [];
  }

  async placeOrder(order: BrokerOrder): Promise<any> {
    return this.request("/v2/orders", "POST", {
      symbol: order.symbol,
      qty: order.qty.toString(),
      side: order.side,
      type: order.type,
      time_in_force: order.timeInForce || "day",
      ...(order.type === "limit" && order.limitPrice != null
        ? { limit_price: order.limitPrice.toString() }
        : {}),
    });
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.request(`/v2/orders/${orderId}`, "DELETE");
  }

  async closePosition(symbol: string): Promise<any> {
    return this.request(`/v2/positions/${symbol}`, "DELETE");
  }

  async closeAllPositions(): Promise<any> {
    return this.request("/v2/positions", "DELETE");
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function getBroker(connection: {
  broker: string;
  apiKey: string | null;
  apiSecret: string | null;
  isPaper: number;
}): AlpacaBroker {
  if (!connection.apiKey || !connection.apiSecret) {
    throw new Error("Broker connection is missing API credentials");
  }
  switch (connection.broker) {
    case "alpaca":
      return new AlpacaBroker(
        connection.apiKey,
        connection.apiSecret,
        !!connection.isPaper
      );
    default:
      throw new Error(`Unsupported broker: ${connection.broker}`);
  }
}

// ── Trade sync ────────────────────────────────────────────────────────────────

export async function syncTrades(
  connectionId: string,
  userId: number
): Promise<{ imported: number }> {
  const conn = await storage.getBrokerConnection(connectionId);
  if (!conn) throw new Error("Broker connection not found");

  const broker = getBroker(conn);
  const orders = await broker.getClosedOrders(conn.lastSyncAt ?? undefined);

  // Fetch existing trade notes to avoid duplicates
  const existingTrades = await storage.getTradesByUser(userId, { limit: 10000 });
  const importedOrderIds = new Set(
    existingTrades
      .map((t) => {
        const match = t.notes?.match(/Alpaca order ([^\s]+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean)
  );

  let imported = 0;
  for (const order of orders) {
    if (order.status !== "filled") continue;
    if (importedOrderIds.has(order.id)) continue;

    const direction = order.side === "buy" ? "long" : "short";
    const entryPrice = parseFloat(order.filled_avg_price ?? order.limit_price ?? 0);
    const qty = parseFloat(order.filled_qty ?? order.qty ?? 1);

    await storage.createTrade({
      userId,
      symbol: order.symbol,
      direction,
      entryPrice,
      exitPrice: entryPrice, // market fill — entry = exit conceptually until position closes
      quantity: qty,
      entryTime: order.filled_at || order.created_at,
      exitTime: order.filled_at,
      fees: 0,
      strategyTag: "auto-import",
      notes: `Alpaca order ${order.id}`,
      importSource: "alpaca_sync",
    });
    imported++;
  }

  // Update last sync timestamp
  await storage.updateBrokerConnection(connectionId, {
    lastSyncAt: new Date().toISOString(),
  });

  return { imported };
}
