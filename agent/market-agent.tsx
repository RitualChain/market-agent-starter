import { marketTool } from "@/tool/market-tool";
import { compareTokensTool } from "@/tool/compare-tool";
import { priceHistoryTool } from "@/tool/price-history-tool";
import { openai } from "@ai-sdk/openai";
import { ToolLoopAgent, InferAgentUIMessage } from "ai";

export const marketAgent = new ToolLoopAgent({
  model: openai("gpt-4o"),
  instructions: "You are a helpful assistant that can help with market data.",
  tools: {
    market: marketTool,
    compare: compareTokensTool,
    priceHistory: priceHistoryTool,
  },
});

export type MarketAgentUIMessage = InferAgentUIMessage<typeof marketAgent>;
