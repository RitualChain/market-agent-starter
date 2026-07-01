"use client";

import { useChat } from "@ai-sdk/react";
import ChatInput from "@/components/chat-input";
import type { MarketAgentUIMessage } from "@/agent/market-agent";
import MarketView from "@/components/market-view";
import CompareView from "@/components/compare-view";
import PriceHistoryView from "@/components/price-history-view";
import type { MarketUIToolInvocation } from "@/tool/market-tool";
import Image from "next/image";
import { Streamdown } from "streamdown";
import Link from "next/link";
import { GitHubIcon, TelegramIcon, XIcon } from "@/components/icons";

function extractTokenCandidateFromText(text: string): string | undefined {
  // Prefer contract addresses if present.
  const addr = text.match(/\b0x[a-fA-F0-9]{40}\b/);
  if (addr?.[0]) return addr[0];

  // Then try ticker symbols (2-6 chars). Avoid common non-token acronyms.
  const blacklist = new Set(["USD", "USDC", "USDT", "AI", "API", "TVL", "ATH"]);
  const tickers = text.match(/\b[A-Z]{2,6}\b/g) ?? [];
  const candidate = tickers.find((t) => !blacklist.has(t));
  return candidate;
}

function getLastMarketToolToken(
  messages: MarketAgentUIMessage[]
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const part = msg.parts[j];
      if (part.type === "tool-market") {
        const inv = part as unknown as MarketUIToolInvocation;
        if ("input" in inv && inv.input?.token) return String(inv.input.token);
      }
    }
  }
  return undefined;
}

function getLastUserMentionedToken(
  messages: MarketAgentUIMessage[]
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    const textParts = msg.parts.filter((p) => p.type === "text") as Array<{
      type: "text";
      text: string;
    }>;
    const joined = textParts.map((p) => p.text).join("\n");
    const token = extractTokenCandidateFromText(joined);
    if (token) return token;
  }
  return undefined;
}

function uniqNonEmpty(items: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const s = raw.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function buildDynamicSuggestions(messages: MarketAgentUIMessage[]) {
  const token =
    getLastMarketToolToken(messages) ?? getLastUserMentionedToken(messages);

  const general = [
    "Price of BTC",
    "Price of ETH",
    "Compare SOL vs ETH",
    "What's the market cap of BTC?",
  ];

  if (!token) return general;

  const contextual = [
    `Price of ${token}`,
    `Market cap, 24h volume, and 24h change for ${token}`,
    `Compare ${token} vs BTC`,
    `Show ${token} price in EUR`,
    `Summarize what moved ${token} today`,
  ];

  return uniqNonEmpty([...contextual, ...general]).slice(0, 8);
}

export default function MarketChat() {
  const chat = useChat<MarketAgentUIMessage>();
  const { status, sendMessage, messages } = chat;
  const stop = (chat as unknown as { stop?: () => void }).stop;
  const suggestions = buildDynamicSuggestions(messages ?? []);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-zinc-900/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src="/logo.png"
              alt="Market Agent"
              width={1200}
              height={1200}
              className="aspect-square size-8 shrink-0 rounded-md bg-black p-1 object-contain"
            />

            <div className="min-w-0">
              <div className="truncate text-sm font-medium leading-tight">
                MarketMind
              </div>
              <div className="truncate text-[11px] leading-tight text-zinc-400">
                AI-powered Market Assistant
              </div>
            </div>
          </div>

          <nav className="flex items-center gap-2">
            <Link
              href="https://github.com/RitualChain/market-agent-starter"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              title="GitHub"
              className="inline-flex size-9 items-center justify-center rounded-xl border border-zinc-900/60 bg-zinc-950/30 text-zinc-200 hover:bg-zinc-900/40"
            >
              <GitHubIcon className="size-5" />
            </Link>
            <Link
              href="https://x.com/BunsDev"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (Twitter)"
              title="X (Twitter)"
              className="inline-flex size-9 items-center justify-center rounded-xl border border-zinc-900/60 bg-zinc-950/30 text-zinc-200 hover:bg-zinc-900/40"
            >
              <XIcon className="size-5" />
            </Link>
            <Link
              href="https://t.me/RitualChain"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram"
              title="Telegram"
              className="inline-flex size-9 items-center justify-center rounded-xl border border-zinc-900/60 bg-zinc-950/30 text-zinc-200 hover:bg-zinc-900/40"
            >
              <TelegramIcon className="size-5" />
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-screen-2xl px-4 pb-[calc(11rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl min-w-full md:min-w-0 md:max-w-none lg:max-w-screen-2xl">
          {messages?.length ? null : (
            <div className="pt-8 sm:pt-12">
              <div className="rounded-3xl border border-zinc-900/60 bg-zinc-950/30 p-4 shadow-sm backdrop-blur sm:p-6">
                <div className="text-base font-semibold sm:text-lg">
                  Welcome, ask MarketMind AI anything about crypto markets
                </div>
                <div className="mt-2 text-sm text-zinc-400">
                  MarketMind AI can fetch live pricing and key stats (e.g.
                  market cap, 24h volume, 24h change) for tickers (e.g. ETH,
                  BTC, SOL) or contract addresses (e.g. 0x…). You can also
                  compare prices of different tokens, or get the price of a
                  specific token.
                </div>
              </div>
            </div>
          )}
          <div className="py-6 sm:py-10">
            <div className="space-y-6">
              {messages?.map((message) => {
                const isUser = message.role === "user";

                return (
                  <div
                    key={message.id}
                    className={`flex w-full gap-3 ${
                      isUser ? "justify-end" : ""
                    }`}
                  >
                    {!isUser && (
                      <Image
                        src="/logo.png"
                        alt="Market Agent"
                        width={32}
                        height={32}
                        className="mt-0.5 hidden size-8 shrink-0 rounded-full border border-zinc-900/60 bg-black p-1 object-contain shadow-sm sm:block"
                      />
                    )}

                    <div
                      className={`w-full ${
                        isUser ? "max-w-[92%] sm:max-w-[80%]" : "max-w-full"
                      }`}
                    >
                      <div
                        className={[
                          "rounded-3xl px-4 py-3",
                          isUser
                            ? "ml-auto border border-zinc-900/60 bg-zinc-900/80 text-zinc-100 shadow-sm"
                            : "border border-zinc-900/60 bg-zinc-950/30 text-zinc-100 shadow-sm",
                        ].join(" ")}
                      >
                        <div className="space-y-3">
                          {message.parts.map((part, index) => {
                            switch (part.type) {
                              case "text":
                                return message.role === "assistant" ? (
                                  <Streamdown
                                    key={index}
                                    className="md whitespace-pre-wrap text-sm leading-relaxed"
                                  >
                                    {part.text}
                                  </Streamdown>
                                ) : (
                                  <div
                                    key={index}
                                    className="whitespace-pre-wrap text-sm leading-relaxed"
                                  >
                                    {part.text}
                                  </div>
                                );

                              case "step-start":
                                return index > 0 ? (
                                  <div key={index} className="py-1">
                                    <div className="h-px w-full bg-background" />
                                  </div>
                                ) : null;

                              case "tool-market": {
                                const invocation =
                                  part as MarketUIToolInvocation & {
                                    toolCallId?: string;
                                    id?: string;
                                  };
                                return (
                                  <MarketView
                                    key={
                                      invocation.toolCallId ??
                                      invocation.id ??
                                      index
                                    }
                                    invocation={invocation}
                                  />
                                );
                              }
                              case "tool-compare": {
                                const inv = part as { state: string; comparisonData?: string; toolCallId?: string; id?: string };
                                return inv.state === "ready" && inv.comparisonData ? (
                                  <CompareView key={inv.toolCallId ?? inv.id ?? index} data={inv.comparisonData} />
                                ) : (
                                  <div key={index} className="text-[13px] text-zinc-300 mt-2">Comparing tokens…</div>
                                );
                              }
                              case "tool-priceHistory": {
                                const inv = part as { state: string; historyData?: string; toolCallId?: string; id?: string };
                                return inv.state === "ready" && inv.historyData ? (
                                  <PriceHistoryView key={inv.toolCallId ?? inv.id ?? index} data={inv.historyData} />
                                ) : (
                                  <div key={index} className="text-[13px] text-zinc-300 mt-2">Fetching price history…</div>
                                );
                              }
                            }
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Full-width fixed composer (ChatGPT-style) */}
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-900/60 bg-background">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-background" />
        <div className="pointer-events-auto relative w-full px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-3xl min-w-full md:min-w-0 md:max-w-none lg:max-w-screen-2xl">
            <ChatInput
              status={status}
              stop={stop}
              suggestions={suggestions}
              onSubmit={(text: string) => sendMessage({ text })}
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
