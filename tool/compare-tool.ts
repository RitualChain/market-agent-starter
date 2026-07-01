import { tool } from "ai";
import { z } from "zod";

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";

async function fetchJson<T>(url: string, timeoutMs = 10_000): Promise<T> {
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

async function resolveSymbolToId(symbol: string): Promise<{ id: string; name: string; symbol: string; market_cap_rank: number | null }> {
  const url = `${COINGECKO_BASE_URL}/search?query=${encodeURIComponent(symbol)}`;
  const search = await fetchJson<{
    coins: Array<{ id: string; name: string; symbol: string; market_cap_rank: number | null }>;
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
  return best;
}

export const compareTokensTool = tool({
  description: "Compare market data for multiple crypto tokens side by side",
  inputSchema: z.object({
    tokens: z
      .array(z.string().min(1))
      .min(2)
      .max(5)
      .describe("List of token symbols to compare (e.g. ['BTC', 'ETH', 'SOL'])"),
    vsCurrency: z
      .string()
      .min(2)
      .default("usd")
      .describe("Quote currency (e.g. usd, eur)"),
  }),
  async *execute(input: { tokens: string[]; vsCurrency: string }) {
    yield { state: "loading" as const };

    const vsCurrency = input.vsCurrency.trim().toLowerCase();

    // Resolve all symbols to CoinGecko IDs in parallel
    const resolved = await Promise.all(
      input.tokens.map((t) => resolveSymbolToId(t.trim()))
    );

    const ids = resolved.map((r) => r.id).join(",");
    const url =
      `${COINGECKO_BASE_URL}/simple/price?ids=${encodeURIComponent(ids)}` +
      `&vs_currencies=${encodeURIComponent(vsCurrency)}` +
      `&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`;

    const prices = await fetchJson<
      Record<string, Record<string, number | undefined>>
    >(url);

    const comparison = resolved.map((coin) => ({
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      marketCapRank: coin.market_cap_rank,
      price: prices[coin.id]?.[vsCurrency],
      marketCap: prices[coin.id]?.[`${vsCurrency}_market_cap`],
      volume24h: prices[coin.id]?.[`${vsCurrency}_24h_vol`],
      change24h: prices[coin.id]?.[`${vsCurrency}_24h_change`],
      lastUpdatedAt: prices[coin.id]?.last_updated_at,
    }));

    yield {
      state: "ready" as const,
      comparisonData: JSON.stringify({ provider: "coingecko", vsCurrency, tokens: comparison }),
    };
  },
});

export type CompareUIToolInvocation = ReturnType<typeof compareTokensTool.execute>;
