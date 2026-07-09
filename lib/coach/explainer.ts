/**
 * Client-side coach explanation helper with IndexedDB cache + rate limit.
 */
import type { MistakeReport } from "./detector";
import { templateExplanation } from "./templates";
import {
  getCachedExplanation,
  setCachedExplanation,
  type AppSettings,
} from "@/lib/storage/local";

const MAX_LLM_PER_SESSION = 20;
let sessionLlmCalls = 0;

export function resetSessionLlmBudget(): void {
  sessionLlmCalls = 0;
}

export type ExplainResult = {
  text: string;
  source: "cache" | "llm" | "template";
  provider?: string;
  model?: string;
};

function clientHash(fen: string, move: string): string {
  return `${fen}|${move}`;
}

export async function explainMistake(
  report: MistakeReport,
  settings?: Partial<AppSettings>,
): Promise<ExplainResult> {
  const key = clientHash(report.fenBefore, report.san);
  const cached = await getCachedExplanation(key);
  if (cached) return { text: cached, source: "cache" };

  if (sessionLlmCalls >= MAX_LLM_PER_SESSION) {
    const text = templateExplanation(report);
    await setCachedExplanation(key, text);
    return { text, source: "template" };
  }

  try {
    sessionLlmCalls += 1;
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        report,
        provider: settings?.llmProvider,
        model: settings?.llmModel,
      }),
    });
    const data = (await res.json()) as {
      text?: string;
      source?: string;
      provider?: string;
      model?: string;
      error?: string;
    };
    if (!res.ok || !data.text) {
      const text = templateExplanation(report);
      return { text, source: "template" };
    }
    await setCachedExplanation(key, data.text);
    return {
      text: data.text,
      source: (data.source as ExplainResult["source"]) ?? "llm",
      provider: data.provider,
      model: data.model,
    };
  } catch {
    return { text: templateExplanation(report), source: "template" };
  }
}
