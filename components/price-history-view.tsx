interface SparklinePoint {
  t: number;
  p: number;
}

interface HistoryData {
  provider: string;
  coinId: string;
  token: string;
  vsCurrency: string;
  days: number;
  dataPoints: number;
  startPrice: number;
  endPrice: number;
  high: number;
  low: number;
  changePercent: number;
  startTime: string;
  endTime: string;
  sparkline: SparklinePoint[];
}

function fmt(n: number, currency: string): string {
  if (n >= 1_000_000_000_000) return `$${(n / 1_000_000_000_000).toFixed(2)}T`;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

function Sparkline({ points, positive }: { points: SparklinePoint[]; positive: boolean }) {
  if (points.length < 2) return null;
  const prices = points.map((p) => p.p);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const w = 200;
  const h = 40;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p.p - min) / range) * h;
    return `${x},${y}`;
  });
  const color = positive ? "#4ade80" : "#f87171";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function PriceHistoryView({ data }: { data: string }) {
  let parsed: HistoryData | null = null;
  try {
    parsed = JSON.parse(data);
  } catch {
    return (
      <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
        Failed to parse historical data.
      </div>
    );
  }

  if (!parsed) return null;
  const positive = parsed.changePercent >= 0;
  const changeColor = positive ? "text-green-400" : "text-red-400";
  const changeText = `${positive ? "+" : ""}${parsed.changePercent.toFixed(2)}%`;

  return (
    <div className="rounded-2xl border border-zinc-900/60 bg-zinc-950/20 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 items-center rounded-full border border-zinc-900/60 bg-zinc-950/30 px-2 text-[11px] font-medium text-zinc-200">
            tool
          </span>
          <span className="text-xs font-medium text-zinc-100">priceHistory</span>
          <span className="text-[11px] text-zinc-400">
            {parsed.token.toUpperCase()} · {parsed.days}d
          </span>
        </div>
        <span className={`text-sm font-semibold ${changeColor}`}>{changeText}</span>
      </div>

      <div className="mb-3">
        <Sparkline points={parsed.sparkline} positive={positive} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Start", value: fmt(parsed.startPrice, parsed.vsCurrency) },
          { label: "End", value: fmt(parsed.endPrice, parsed.vsCurrency) },
          { label: "High", value: fmt(parsed.high, parsed.vsCurrency) },
          { label: "Low", value: fmt(parsed.low, parsed.vsCurrency) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-zinc-900/60 bg-black/20 p-2">
            <div className="text-[11px] text-zinc-400">{label}</div>
            <div className="text-[13px] font-medium text-zinc-100">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
