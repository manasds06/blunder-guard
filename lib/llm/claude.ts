/**
 * Anthropic Claude adapter.
 * Pattern: Adapter — wraps @anthropic-ai/sdk behind LlmProvider.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { LlmGenerateOptions, LlmMessage, LlmProvider } from "./provider";
import { LlmUnavailableError } from "./provider";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export class ClaudeProvider implements LlmProvider {
  readonly id = "claude" as const;
  readonly model: string;
  private client: Anthropic;

  constructor(apiKey?: string, model?: string) {
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new LlmUnavailableError("ANTHROPIC_API_KEY is not set");
    }
    this.client = new Anthropic({ apiKey: key });
    this.model = model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  async generate(
    messages: LlmMessage[],
    opts: LlmGenerateOptions = {},
  ): Promise<string> {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const rest = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 300,
      temperature: opts.temperature ?? 0.4,
      system: system || undefined,
      messages: rest,
    });

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      throw new LlmUnavailableError("Claude returned no text");
    }
    return block.text;
  }
}
