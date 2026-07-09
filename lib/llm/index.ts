/**
 * Factory for LLM providers.
 * Switch with LLM_PROVIDER=claude|gemini (or pass providerId explicitly).
 * Pattern: Factory + Strategy — call sites never import Claude/Gemini SDKs.
 */
import { ClaudeProvider } from "./claude";
import { GeminiProvider } from "./gemini";
import type { LlmProvider, LlmProviderId } from "./provider";
import { LlmUnavailableError } from "./provider";

export type CreateLlmOptions = {
  provider?: LlmProviderId;
  model?: string;
};

export function createLlmProvider(opts: CreateLlmOptions = {}): LlmProvider {
  const id =
    opts.provider ??
    (process.env.LLM_PROVIDER as LlmProviderId | undefined) ??
    "claude";

  try {
    if (id === "gemini") {
      return new GeminiProvider(undefined, opts.model);
    }
    return new ClaudeProvider(undefined, opts.model);
  } catch (e) {
    // Fallback: if preferred provider missing key, try the other
    if (e instanceof LlmUnavailableError) {
      try {
        if (id === "gemini") return new ClaudeProvider(undefined, opts.model);
        return new GeminiProvider(undefined, opts.model);
      } catch {
        throw e;
      }
    }
    throw e;
  }
}

export function listAvailableProviders(): LlmProviderId[] {
  const available: LlmProviderId[] = [];
  if (process.env.ANTHROPIC_API_KEY) available.push("claude");
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) available.push("gemini");
  return available;
}
