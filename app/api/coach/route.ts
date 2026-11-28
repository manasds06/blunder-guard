/**
 * POST /api/coach — LLM explains a MistakeReport.
 * Enforces calculate/explain split: rejects requests missing engine data.
 * Provider switchable via body.provider or LLM_PROVIDER env (claude | gemini | ollama).
 */
import { NextResponse } from "next/server";
import { createLlmProvider, listAvailableProviders } from "@/lib/llm";
import type { LlmProviderId } from "@/lib/llm/provider";
import { LlmUnavailableError } from "@/lib/llm/provider";
import { COACH_SYSTEM_PROMPT } from "@/lib/prompts/coach";
import { cacheGet, cacheSet, hashKey } from "@/lib/coach/cache";
import {
  EXPLANATION_VERSION,
  inventedMoves,
  lineToSan,
  templateExplanation,
  uciToSan,
} from "@/lib/coach/templates";
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
    `ENGINE BEST: ${uciToSan(report.fenBefore, report.bestMove) ?? report.bestMove}, line: ${lineToSan(report.fenBefore, report.bestLine).join(" ")} | Theme: ${report.theme}`,
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

  const available = await listAvailableProviders();
  const key = await hashKey(`${EXPLANATION_VERSION}|${report.fenBefore}|${report.san}`);
  const cached = cacheGet(key);
  if (cached) {
    return NextResponse.json({
      text: cached.text,
      source: "cache",
      provider: cached.provider,
      available,
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
    // The LLM explains; it must not calculate. If it names a move that is not
    // the played move, not in the engine's line and not legal in the position,
    // discard its answer rather than show the student an impossible move.
    const invented = inventedMoves(text, report);
    if (invented.length > 0) {
      return NextResponse.json({
        text: templateExplanation(report),
        source: "template",
        error: `LLM named moves not in the engine line: ${invented.join(", ")}`,
        available,
      });
    }
    cacheSet(key, text, llm.id);
    return NextResponse.json({
      text,
      source: "llm",
      provider: llm.id,
      model: llm.model,
      available,
    });
  } catch (e) {
    const fallback = templateExplanation(report);
    const message =
      e instanceof LlmUnavailableError ? e.message : "LLM request failed";
    return NextResponse.json({
      text: fallback,
      source: "template",
      error: message,
      available,
    });
  }
}

export async function GET() {
  return NextResponse.json({
    available: await listAvailableProviders(),
    default: process.env.LLM_PROVIDER ?? "claude",
  });
}
