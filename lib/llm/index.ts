/**
 * Factory for LLM providers.
 * Switch with LLM_PROVIDER=claude|gemini|ollama (or pass providerId explicitly).
 * Pattern: Factory + Strategy — call sites never import SDKs directly.
 */
import { ClaudeProvider } from "./claude";
import { GeminiProvider } from "./gemini";
import { isOllamaAvailable, OllamaProvider } from "./ollama";
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
    return build(id, opts.model);
  } catch (e) {
    // Fallback chain: try the other cloud key, then Ollama, else rethrow
    if (e instanceof LlmUnavailableError) {
      const order: LlmProviderId[] =
        id === "ollama"
          ? ["claude", "gemini"]
          : id === "gemini"
            ? ["claude", "ollama"]
            : ["gemini", "ollama"];
      for (const next of order) {
        try {
          return build(next, opts.model);
        } catch {
          /* try next */
        }
      }
      throw e;
    }
    throw e;
  }
}

function build(id: LlmProviderId, model?: string): LlmProvider {
  if (id === "ollama") return new OllamaProvider(model);
  if (id === "gemini") return new GeminiProvider(undefined, model);
  return new ClaudeProvider(undefined, model);
}

export async function listAvailableProviders(): Promise<LlmProviderId[]> {
  const available: LlmProviderId[] = [];
  if (process.env.ANTHROPIC_API_KEY) available.push("claude");
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) available.push("gemini");
  if (await isOllamaAvailable()) available.push("ollama");
  return available;
}
