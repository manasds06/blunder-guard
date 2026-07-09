/**
 * Ollama adapter — fully local LLM via http://localhost:11434.
 * Pattern: Adapter behind LlmProvider; no API keys, no cloud.
 *
 * Install: https://ollama.com then `ollama pull llama3.2` (or any chat model).
 */
import type { LlmGenerateOptions, LlmMessage, LlmProvider } from "./provider";
import { LlmUnavailableError } from "./provider";

const DEFAULT_MODEL = "llama3.2";
const DEFAULT_BASE = "http://127.0.0.1:11434";

export class OllamaProvider implements LlmProvider {
  readonly id = "ollama" as const;
  readonly model: string;
  private baseUrl: string;

  constructor(model?: string, baseUrl?: string) {
    this.model = model ?? process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
    this.baseUrl = (
      baseUrl ??
      process.env.OLLAMA_BASE_URL ??
      DEFAULT_BASE
    ).replace(/\/$/, "");
  }

  async generate(
    messages: LlmMessage[],
    opts: LlmGenerateOptions = {},
  ): Promise<string> {
    // Ollama chat API: https://github.com/ollama/ollama/blob/main/docs/api.md
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: false,
          options: {
            temperature: opts.temperature ?? 0.4,
            num_predict: opts.maxTokens ?? 300,
          },
        }),
      });
    } catch {
      throw new LlmUnavailableError(
        `Ollama not reachable at ${this.baseUrl}. Is \`ollama serve\` running?`,
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new LlmUnavailableError(
        `Ollama error ${res.status}: ${body || res.statusText}. Try \`ollama pull ${this.model}\`.`,
      );
    }

    const data = (await res.json()) as {
      message?: { content?: string };
    };
    const text = data.message?.content?.trim();
    if (!text) {
      throw new LlmUnavailableError("Ollama returned no text");
    }
    return text;
  }
}

/** Probe whether Ollama is up (used by /api/coach GET). */
export async function isOllamaAvailable(
  baseUrl = process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE,
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}
