/**
 * LLM Provider — Strategy pattern (mirrors EngineProvider).
 *
 * Why: switch Claude ↔ Gemini via env / settings without touching coach code.
 * The LLM ONLY explains structured engine data — it never calculates chess.
 */
export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmGenerateOptions = {
  maxTokens?: number;
  temperature?: number;
};

export type LlmProviderId = "claude" | "gemini";

export interface LlmProvider {
  readonly id: LlmProviderId;
  readonly model: string;
  generate(messages: LlmMessage[], opts?: LlmGenerateOptions): Promise<string>;
}

export class LlmUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmUnavailableError";
  }
}
