import { tool } from "ai";
import { z } from "zod";

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";

async function fetchJson<T>(url: string, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 429) {
        throw new Error("CoinGecko rate limit reached. Please wait a moment before retrying.");
      }
      throw new Error(`Request failed (${res.status} ${res.statusText})`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveSymbolToId(symbol: string): Promise<string> {
  const url = `${COINGECKO_BASE_URL}/search?query=${encodeURIComponent(symbol)}`;
  const search = await fetchJson<{
    coins: Array<{ id: string; symbol: string; market_cap_rank: number | null }>;
  }>(url);

  const coins = search?.coins ?? [];
  const exact = coins.filter((c) => c.symbol?.toLowerCase() === symbol.toLowerCase());
  const candidates = exact.length > 0 ? exact : coins;
  const best = candidates.sort((a, b) => {
    const ar = a.market_cap_rank ?? Number.POSITIVE_INFINITY;
    const br = b.market_cap_rank ?? Number.POSITIVE_INFINITY;
    return ar - br;
  })[0];

  if (!best) throw new Error(`Could not resolve "${symbol}" to a known token.`);
  return best.id;
}

export const priceHistoryTool = tool({
  description: "Get historical price data for a crypto token over a given time range",
  inputSchema: z.object({
    token: z.string().min(1).describe("Token symbol (e.g. BTC, ETH) or CoinGecko coin id"),
    days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .default(7)
      .describe("Number of days of historical data to fetch (1-365)"),
    vsCurrency: z
      .string()
      .min(2)
      .default("usd")
      .describe("Quote currency (e.g. usd, eur)"),
  }),
  async *execute(input: { token: string; days: number; vsCurrency: string }) {
    yield { state: "loading" as const };

    const vsCurrency = input.vsCurrency.trim().toLowerCase();
    const coinId = await resolveSymbolToId(input.token.trim());

    const url =
      `${COINGECKO_BASE_URL}/coins/${encodeURIComponent(coinId)}/market_chart` +
      `?vs_currency=${encodeURIComponent(vsCurrency)}&days=${input.days}`;

    const data = await fetchJson<{
      prices: [number, number][];
      market_caps: [number, number][];
      total_volumes: [number, number][];
    }>(url);

    const prices = data.prices ?? [];
    if (prices.length === 0) {
      throw new Error(`No historical data found for "${input.token}".`);
    }

    const first = prices[0];
    const last = prices[prices.length - 1];
    const high = Math.max(...prices.map(([, p]) => p));
    const low = Math.min(...prices.map(([, p]) => p));
    const change = first[1] > 0 ? ((last[1] - first[1]) / first[1]) * 100 : 0;

    const summary = {
      provider: "coingecko",
      coinId,
      token: input.token,
      vsCurrency,
      days: input.days,
      dataPoints: prices.length,
      startPrice: first[1],
      endPrice: last[1],
      high,
      low,
      changePercent: change,
      startTime: new Date(first[0]).toISOString(),
      endTime: new Date(last[0]).toISOString(),
      // Sample every ~10th point to keep payload manageable
      sparkline: prices.filter((_, i) => i % Math.max(1, Math.floor(prices.length / 30)) === 0).map(([ts, p]) => ({ t: ts, p })),
    };

    yield {
      state: "ready" as const,
      historyData: JSON.stringify(summary),
    };
  },
});
