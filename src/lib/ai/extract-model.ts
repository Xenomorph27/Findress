import "server-only";
import { createGoogleGenerativeAI, type GoogleLanguageModelOptions } from "@ai-sdk/google";
import { generateText } from "ai";
import { aiConfigError, aiProvider, getChatModel, modelIdFor } from "./model";

/**
 * The model used to read CFP pages. Same provider, key and AI_MODEL as the assistant (so there is
 * one place to configure it), but with minimal "thinking": extraction copies text, it does not
 * reason, and every thinking token costs free-tier quota the assistant also needs.
 */
export function getExtractionModel() {
  if (aiProvider() !== "google") return getChatModel();
  const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
  const id = modelIdFor("google", process.env.AI_MODEL);
  const options: GoogleLanguageModelOptions = {
    thinkingConfig: { thinkingLevel: "low", includeThoughts: false },
  };
  return { model: google(id), providerOptions: { google: options }, label: id };
}

export { aiConfigError };

/** One extraction request: system + user prompt → the model's raw text reply. */
export function makeGenerate(): {
  generate: (system: string, prompt: string) => Promise<string>;
  label: string;
} {
  const { model, providerOptions, label } = getExtractionModel();
  return {
    label,
    generate: async (system, prompt) => {
      const { text } = await generateText({
        model,
        system,
        prompt,
        temperature: 0,
        maxOutputTokens: 3000,
        providerOptions: providerOptions as never,
      });
      return text;
    },
  };
}
