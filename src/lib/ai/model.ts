import "server-only";
import { createAnthropic, type AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI, type GoogleLanguageModelOptions } from "@ai-sdk/google";
import { gateway, type LanguageModel } from "ai";

/**
 * The single place that knows which LLM powers "Ask FIndress" (SPEC §6).
 *
 *   AI_PROVIDER=google (default)  → GOOGLE_GENERATIVE_AI_API_KEY, AI_MODEL (default gemini-3.8-flash)
 *   AI_PROVIDER=anthropic         → ANTHROPIC_API_KEY, AI_MODEL (default claude-sonnet-5-5)
 *   AI_PROVIDER=gateway           → Vercel AI Gateway (AI_GATEWAY_API_KEY), AI_MODEL like
 *                                   "google/gemini-3.8-flash" or any other provider/model
 *
 * Swapping providers only touches this file. Tools, streaming and citations are provider-neutral
 * (AI SDK tool calling + the same system prompt).
 */

export type AiProvider = "google" | "anthropic" | "gateway";

export interface ChatModel {
  model: LanguageModel;
  providerOptions: Record<string, Record<string, unknown>>;
  label: string;
}

/** Latest stable Gemini Flash (ai.google.dev/gemini-api/docs/models, checked 2026-10-09). */
export const DEFAULT_GOOGLE_MODEL = "gemini-3.8-flash";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";
const DEFAULT_GATEWAY_MODEL = "google/gemini-3.8-flash";

export function aiProvider(): AiProvider | string {
  return (process.env.AI_PROVIDER || "google").toLowerCase();
}

export function aiConfigError(): string | null {
  const provider = aiProvider();
  if (provider === "google" && !process.env.GOOGLE_GENERATIVE_AI_API_KEY)
    return "GOOGLE_GENERATIVE_AI_API_KEY is not set";
  if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY)
    return "ANTHROPIC_API_KEY is not set";
  if (provider === "gateway" && !process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return "AI_GATEWAY_API_KEY is not set";
  }
  if (!["google", "anthropic", "gateway"].includes(provider)) {
    return `Unknown AI_PROVIDER "${provider}"`;
  }
  return null;
}

/** AI_MODEL, unless it obviously belongs to another provider (e.g. a leftover claude-* id). */
export function modelIdFor(provider: string, configured: string | undefined): string {
  const id = configured?.trim();
  if (provider === "google") return id && /^(gemini|gemma)/i.test(id) ? id : DEFAULT_GOOGLE_MODEL;
  if (provider === "anthropic") return id && /^claude/i.test(id) ? id : DEFAULT_ANTHROPIC_MODEL;
  return id || DEFAULT_GATEWAY_MODEL;
}

/** AI_EFFORT (low | medium | high | xhigh | max) as Gemini's thinking level. */
export function geminiThinkingLevel(effort: string | undefined): "low" | "medium" | "high" {
  if (effort === "low") return "low";
  if (effort === "high" || effort === "xhigh" || effort === "max") return "high";
  return "medium";
}

export function getChatModel(): ChatModel {
  const provider = aiProvider();
  const id = modelIdFor(provider, process.env.AI_MODEL);
  if (provider === "gateway") return { model: gateway(id), providerOptions: {}, label: id };

  if (provider === "anthropic") {
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

  // Gemini: thinking depth from AI_EFFORT; thoughts stay server-side (not streamed to the UI).
  const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
  const options: GoogleLanguageModelOptions = {
    thinkingConfig: {
      thinkingLevel: geminiThinkingLevel(process.env.AI_EFFORT),
      includeThoughts: false,
    },
  };
  return { model: google(id), providerOptions: { google: options }, label: id };
}

export function maxOutputTokens(): number {
  const n = Number(process.env.CHAT_MAX_OUTPUT_TOKENS ?? 4000);
  return Number.isFinite(n) && n >= 500 ? Math.min(n, 16000) : 4000;
}
