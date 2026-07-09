/**
 * POST /api/coach — LLM explains a MistakeReport.
 * Enforces calculate/explain split: rejects requests missing engine data.
 * Provider switchable via body.provider or LLM_PROVIDER env (claude | gemini).
 */
import { NextResponse } from "next/server";
import { createLlmProvider, listAvailableProviders } from "@/lib/llm";
import type { LlmProviderId } from "@/lib/llm/provider";
import { LlmUnavailableError } from "@/lib/llm/provider";
import { COACH_SYSTEM_PROMPT } from "@/lib/prompts/coach";
import { cacheGet, cacheSet, hashKey } from "@/lib/coach/cache";
import { templateExplanation } from "@/lib/coach/templates";
import type { MistakeReport } from "@/lib/coach/detector";

export const runtime = "nodejs";

type Body = {
  report?: MistakeReport;
  provider?: LlmProviderId;
  model?: string;
};

function formatEval(ev: MistakeReport["evalBefore"]): string {
  if (ev.mate != null) return `mate ${ev.mate}`;
  if (ev.cp != null) return `${(ev.cp / 100).toFixed(2)}`;
  return "n/a";
}

function buildUserMessage(report: MistakeReport): string {
  return [
    `POSITION (FEN): ${report.fenBefore}`,
    `MOVE PLAYED: ${report.san} | Eval before: ${formatEval(report.evalBefore)} | after: ${formatEval(report.evalAfter)} | Classification: ${report.classification}`,
    `ENGINE BEST: ${report.bestMove}, line: ${report.bestLine.join(" ")} | Theme: ${report.theme}`,
    `Eval swing (mover perspective): ${report.swingCp} cp`,
    "",
    "Explain this for the student. Use ONLY the engine facts above — do not invent moves.",
  ].join("\n");
}

function hasEngineData(report: MistakeReport): boolean {
  return Boolean(
    report.fenBefore &&
      report.san &&
      report.classification &&
      (report.bestMove || report.bestLine?.length),
  );
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const report = body.report;
  if (!report || !hasEngineData(report)) {
    return NextResponse.json(
      {
        error:
          "Missing engine data. The coach only explains structured Stockfish output.",
      },
      { status: 400 },
    );
  }

  const key = await hashKey(`${report.fenBefore}|${report.san}`);
  const cached = cacheGet(key);
  if (cached) {
    return NextResponse.json({
      text: cached.text,
      source: "cache",
      provider: cached.provider,
      available: listAvailableProviders(),
    });
  }

  try {
    const llm = createLlmProvider({
      provider: body.provider,
      model: body.model,
    });
    const text = await llm.generate(
      [
        { role: "system", content: COACH_SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(report) },
      ],
      { maxTokens: 300 },
    );
    cacheSet(key, text, llm.id);
    return NextResponse.json({
      text,
      source: "llm",
      provider: llm.id,
      model: llm.model,
      available: listAvailableProviders(),
    });
  } catch (e) {
    const fallback = templateExplanation(report);
    const message =
      e instanceof LlmUnavailableError ? e.message : "LLM request failed";
    return NextResponse.json({
      text: fallback,
      source: "template",
      error: message,
      available: listAvailableProviders(),
    });
  }
}

export async function GET() {
  return NextResponse.json({
    available: listAvailableProviders(),
    default: process.env.LLM_PROVIDER ?? "claude",
  });
}
