interface CompareToken {
  id: string;
  symbol: string;
  name: string;
  marketCapRank: number | null;
  price?: number;
  marketCap?: number;
  volume24h?: number;
  change24h?: number;
}

interface CompareData {
  provider: string;
  vsCurrency: string;
  tokens: CompareToken[];
}

function fmt(n: number | undefined, currency: string): string {
  if (n === undefined) return "—";
  if (n >= 1_000_000_000_000) return `$${(n / 1_000_000_000_000).toFixed(2)}T`;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

function fmtChange(n: number | undefined): { text: string; positive: boolean } {
  if (n === undefined) return { text: "—", positive: true };
  const positive = n >= 0;
  return { text: `${positive ? "+" : ""}${n.toFixed(2)}%`, positive };
}

export default function CompareView({ data }: { data: string }) {
  let parsed: CompareData | null = null;
  try {
    parsed = JSON.parse(data);
  } catch {
    return (
      <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
        Failed to parse comparison data.
      </div>
    );
  }

  if (!parsed) return null;
  const { vsCurrency, tokens } = parsed;

  return (
    <div className="rounded-2xl border border-zinc-900/60 bg-zinc-950/20 p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-5 items-center rounded-full border border-zinc-900/60 bg-zinc-950/30 px-2 text-[11px] font-medium text-zinc-200">
          tool
        </span>
        <span className="text-xs font-medium text-zinc-100">compare</span>
        <span className="text-[11px] text-zinc-400">{tokens.map((t) => t.symbol.toUpperCase()).join(" · ")}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px] text-zinc-200">
          <thead>
            <tr className="border-b border-zinc-900/60 text-zinc-400">
              <th className="pb-2 text-left font-medium">Token</th>
              <th className="pb-2 text-right font-medium">Price</th>
              <th className="pb-2 text-right font-medium">24h</th>
              <th className="pb-2 text-right font-medium">Market Cap</th>
              <th className="pb-2 text-right font-medium">Volume 24h</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => {
              const change = fmtChange(token.change24h);
              return (
                <tr key={token.id} className="border-b border-zinc-900/40 last:border-0">
                  <td className="py-2 pr-4">
                    <div className="font-medium">{token.symbol.toUpperCase()}</div>
                    <div className="text-[11px] text-zinc-400">{token.name}</div>
                  </td>
                  <td className="py-2 text-right font-medium">
                    {fmt(token.price, vsCurrency)}
                  </td>
                  <td className={`py-2 text-right font-medium ${change.positive ? "text-green-400" : "text-red-400"}`}>
                    {change.text}
                  </td>
                  <td className="py-2 text-right text-zinc-300">
                    {fmt(token.marketCap, vsCurrency)}
                  </td>
                  <td className="py-2 text-right text-zinc-300">
                    {fmt(token.volume24h, vsCurrency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
