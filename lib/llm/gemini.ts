/**
 * Google Gemini adapter.
 * Pattern: Adapter — wraps @google/generative-ai behind LlmProvider.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LlmGenerateOptions, LlmMessage, LlmProvider } from "./provider";
import { LlmUnavailableError } from "./provider";

const DEFAULT_MODEL = "gemini-2.5-flash";

export class GeminiProvider implements LlmProvider {
  readonly id = "gemini" as const;
  readonly model: string;
  private client: GoogleGenerativeAI;

  constructor(apiKey?: string, model?: string) {
    const key = apiKey ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) {
      throw new LlmUnavailableError("GOOGLE_GENERATIVE_AI_API_KEY is not set");
    }
    this.client = new GoogleGenerativeAI(key);
    this.model = model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  }

  async generate(
    messages: LlmMessage[],
    opts: LlmGenerateOptions = {},
  ): Promise<string> {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const rest = messages.filter((m) => m.role !== "system");

    // Gemini wants a single user prompt for simple generateContent;
    // fold prior turns into one block to keep the adapter thin.
    const prompt = rest
      .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
      .join("\n\n");

    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: system || undefined,
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 300,
        temperature: opts.temperature ?? 0.4,
      },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    if (!text?.trim()) {
      throw new LlmUnavailableError("Gemini returned no text");
    }
    return text;
  }
}
