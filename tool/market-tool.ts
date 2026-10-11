import { UIToolInvocation, tool } from "ai";
import { z } from "zod";

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";

const CHAIN_TO_COINGECKO_PLATFORM_ID = {
  ethereum: "ethereum",
  base: "base",
  optimism: "optimism",
  arbitrum: "arbitrum-one",
  polygon: "polygon-pos",
  bsc: "binance-smart-chain",
  avalanche: "avalanche",
  solana: "solana",
} as const;

type SupportedChain = keyof typeof CHAIN_TO_COINGECKO_PLATFORM_ID;

function isEvmAddress(input: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(input);
}

async function fetchJson<T>(
  url: string,
  opts?: { timeoutMs?: number }
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
      },
      // Market data should be relatively fresh; avoid caching surprises.
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Market data request failed (${res.status} ${res.statusText})${
          text ? `: ${text}` : ""
        }`
      );
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export const marketTool = tool({
  description: "Get the market data for a given crypto token",
  inputSchema: z.object({
    token: z
      .string()
      .min(1)
      .describe("Token symbol (e.g. ETH, BTC) or contract address (0x...)"),
    vsCurrency: z
      .string()
      .min(2)
      .default("usd")
      .describe("Quote currency (e.g. usd, eur)"),
    chain: z
      .enum(
        Object.keys(CHAIN_TO_COINGECKO_PLATFORM_ID) as unknown as [
          SupportedChain,
          ...SupportedChain[]
        ]
      )
      .default("ethereum")
      .describe("Only used when token is a contract address"),
  }),
  async *execute(input: {
    token: string;
    vsCurrency: string;
    chain: SupportedChain;
  }) {
    const tokenRaw = input.token.trim();
    const tokenLower = tokenRaw.toLowerCase();
    const vsCurrency = input.vsCurrency.trim().toLowerCase();
    const chain = input.chain;

    yield { state: "loading" as const };

    // 1) If it's a contract address, use CoinGecko's token_price endpoint for the specified chain.
    if (isEvmAddress(tokenLower)) {
      const platformId = CHAIN_TO_COINGECKO_PLATFORM_ID[chain];
      const url =
        `${COINGECKO_BASE_URL}/simple/token_price/${encodeURIComponent(
          platformId
        )}` +
        `?contract_addresses=${encodeURIComponent(tokenLower)}` +
        `&vs_currencies=${encodeURIComponent(vsCurrency)}` +
        `&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`;

      const data = await fetchJson<
        Record<
          string,
          {
            [k: string]: number | undefined;
            last_updated_at?: number;
          }
        >
      >(url);

      const entry = data?.[tokenLower];
      if (!entry) {
        throw new Error(
          `No market data found for contract ${tokenRaw} on ${chain}. Try a different chain or a token symbol (e.g. ETH).`
        );
      }

      const price = entry[vsCurrency];
      if (typeof price !== 'number' || !Number.isFinite(price)) {
        throw new Error(`Price data missing or invalid for contract ${tokenRaw} on ${chain}`);
      }

      const summary = {
        provider: "coingecko",
        resolved: {
          type: "contract" as const,
          address: tokenLower,
          chain,
          platformId,
        },
        quote: {
          vsCurrency,
          price,
          marketCap: entry[`${vsCurrency}_market_cap`],
          volume24h: entry[`${vsCurrency}_24h_vol`],
          change24h: entry[`${vsCurrency}_24h_change`],
          lastUpdatedAt: entry.last_updated_at,
        },
      };

      yield {
        state: "ready" as const,
        marketData: JSON.stringify(summary),
      };
      return;
    }

    // 2) Otherwise, treat it as a symbol/name, resolve to a CoinGecko coin id via search, then fetch price + stats.
    const searchUrl = `${COINGECKO_BASE_URL}/search?query=${encodeURIComponent(
      tokenRaw
    )}`;
    const search = await fetchJson<{
      coins: Array<{
        id: string;
        name: string;
        symbol: string;
        market_cap_rank: number | null;
      }>;
    }>(searchUrl);

    const coins = search?.coins ?? [];
    const exactSymbolMatches = coins.filter(
      (c) => c.symbol?.toLowerCase() === tokenLower
    );
    const candidates =
      exactSymbolMatches.length > 0 ? exactSymbolMatches : coins;

    const best =
      candidates.slice().sort((a, b) => {
        // Prefer higher-ranked coins; unknown ranks go last.
        const ar = a.market_cap_rank ?? Number.POSITIVE_INFINITY;
        const br = b.market_cap_rank ?? Number.POSITIVE_INFINITY;
        return ar - br;
      })[0] ?? null;

    if (!best) {
      throw new Error(
        `Couldn't resolve "${tokenRaw}" to a token. Try a ticker like ETH/BTC or a contract address (0x...).`
      );
    }

    const priceUrl =
      `${COINGECKO_BASE_URL}/simple/price?ids=${encodeURIComponent(best.id)}` +
      `&vs_currencies=${encodeURIComponent(vsCurrency)}` +
      `&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`;
    const price = await fetchJson<
      Record<
        string,
        {
          [k: string]: number | undefined;
          last_updated_at?: number;
        }
      >
    >(priceUrl);

    const entry = price?.[best.id];
    if (!entry) {
      throw new Error(
        `Resolved "${tokenRaw}" to "${best.id}" but no price data was returned.`
      );
    }

    const priceValue = entry[vsCurrency];
    if (typeof priceValue !== 'number' || !Number.isFinite(priceValue)) {
      throw new Error(`Price data missing or invalid for ${best.id}`);
    }

    const summary = {
      provider: "coingecko",
      resolved: {
        type: "coin" as const,
        id: best.id,
        symbol: best.symbol,
        name: best.name,
        marketCapRank: best.market_cap_rank,
      },
      quote: {
        vsCurrency,
        price: priceValue,
        marketCap: entry[`${vsCurrency}_market_cap`],
        volume24h: entry[`${vsCurrency}_24h_vol`],
        change24h: entry[`${vsCurrency}_24h_change`],
        lastUpdatedAt: entry.last_updated_at,
      },
    };

    yield { state: "ready" as const, marketData: JSON.stringify(summary) };
  },
});

export type MarketUIToolInvocation = UIToolInvocation<typeof marketTool>;
