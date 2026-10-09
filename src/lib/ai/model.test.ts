import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aiConfigError,
  DEFAULT_GOOGLE_MODEL,
  geminiThinkingLevel,
  getChatModel,
  modelIdFor,
} from "./model";

afterEach(() => vi.unstubAllEnvs());

describe("AI provider selection", () => {
  it("defaults to Gemini and needs GOOGLE_GENERATIVE_AI_API_KEY", () => {
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    expect(aiConfigError()).toBe("GOOGLE_GENERATIVE_AI_API_KEY is not set");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    expect(aiConfigError()).toBeNull();
  });

  it("keeps Anthropic as an option", () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(aiConfigError()).toBe("ANTHROPIC_API_KEY is not set");
  });

  it("rejects unknown providers", () => {
    vi.stubEnv("AI_PROVIDER", "nope");
    expect(aiConfigError()).toMatch(/Unknown AI_PROVIDER/);
  });

  it("ignores a model id from another provider", () => {
    expect(modelIdFor("google", "claude-sonnet-5-5")).toBe(DEFAULT_GOOGLE_MODEL);
    expect(modelIdFor("google", undefined)).toBe("gemini-3.8-flash");
    expect(modelIdFor("google", "gemini-3.5-flash-lite")).toBe("gemini-3.5-flash-lite");
    expect(modelIdFor("anthropic", "gemini-3.8-flash")).toBe("claude-sonnet-5-5");
  });

  it("maps AI_EFFORT to Gemini thinking levels", () => {
    expect(geminiThinkingLevel(undefined)).toBe("medium");
    expect(geminiThinkingLevel("low")).toBe("low");
    expect(geminiThinkingLevel("max")).toBe("high");
  });

  it("builds a Gemini model with thinking options", () => {
    vi.stubEnv("AI_PROVIDER", "google");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    vi.stubEnv("AI_MODEL", "");
    const m = getChatModel();
    expect(m.label).toBe(DEFAULT_GOOGLE_MODEL);
    expect(m.providerOptions.google).toMatchObject({ thinkingConfig: { thinkingLevel: "medium" } });
  });
});
