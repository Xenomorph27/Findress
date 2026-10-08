import "server-only";
import { createAnthropic, type AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import { gateway, type LanguageModel } from "ai";

/**
 * The single place that knows which LLM powers "Ask FIndress" (SPEC §6).
 *
 *   AI_PROVIDER=anthropic (default)  → ANTHROPIC_API_KEY, AI_MODEL (default claude-sonnet-5-5)
 *   AI_PROVIDER=gateway              → Vercel AI Gateway (AI_GATEWAY_API_KEY), AI_MODEL like
 *                                      "anthropic/claude-sonnet-5.5" or any other provider/model
 *
 * Swapping providers only touches this file.
 */

export interface ChatModel {
  model: LanguageModel;
  providerOptions: Record<string, Record<string, unknown>>;
  label: string;
}

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

export function aiConfigError(): string | null {
  const provider = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY)
    return "ANTHROPIC_API_KEY is not set";
  if (provider === "gateway" && !process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return "AI_GATEWAY_API_KEY is not set";
  }
  if (!["anthropic", "gateway"].includes(provider)) return `Unknown AI_PROVIDER "${provider}"`;
  return null;
}

export function getChatModel(): ChatModel {
  const provider = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  if (provider === "gateway") {
    const id = process.env.AI_MODEL || "anthropic/claude-sonnet-5.5";
    return { model: gateway(id), providerOptions: {}, label: id };
  }
  const id = process.env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL;
  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // Current Claude models: never send temperature, never force tool_choice, keep thinking on
  // (adaptive) and steer depth with effort. Automatic caching keeps the large, stable event
  // context (system prompt) cheap across turns.
  const options: AnthropicLanguageModelOptions = {
    thinking: { type: "adaptive" },
    effort: (process.env.AI_EFFORT as AnthropicLanguageModelOptions["effort"]) ?? "medium",
    cacheControl: { type: "ephemeral" },
  };
  return { model: anthropic(id), providerOptions: { anthropic: options }, label: id };
}

export function maxOutputTokens(): number {
  const n = Number(process.env.CHAT_MAX_OUTPUT_TOKENS ?? 4000);
  return Number.isFinite(n) && n >= 500 ? Math.min(n, 16000) : 4000;
}
