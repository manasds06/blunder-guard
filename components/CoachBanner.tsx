"use client";

import { Chess, type Square } from "chess.js";
import type { Classification, MistakeReport } from "@/lib/coach/detector";

const ICONS: Record<Classification, string> = {
  BLUNDER: "??",
  MISTAKE: "?",
  INACCURACY: "?!",
  BEST: "!",
  OK: "·",
  BOOK: "·",
};

const VERDICT: Record<Classification, string> = {
  BLUNDER: "Blunder",
  MISTAKE: "Mistake",
  INACCURACY: "Inaccuracy",
  BEST: "Good move",
  OK: "Okay",
  BOOK: "Book",
};

type Props = {
  report?: MistakeReport;
  explanation?: string;
  loading?: boolean;
  bestMoveShown?: boolean;
  onShowBestMove?: () => void;
  onDismiss?: () => void;
};

function uciToSan(fen: string, uci: string): string {
  if (!uci || uci.length < 4) return uci;
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: (uci[4] as "q" | "r" | "b" | "n") ?? undefined,
    });
    return move?.san ?? uci;
  } catch {
    return uci;
  }
}

/**
 * Coach banner above the board — auto-shows verdict + LLM text after each move.
 */
export function CoachBanner({
  report,
  explanation,
  loading,
  bestMoveShown,
  onShowBestMove,
  onDismiss,
}: Props) {
  const classification = report?.classification;
  const tone =
    classification === "BLUNDER" || classification === "MISTAKE"
      ? "danger"
      : classification === "BEST"
        ? "ok"
        : classification
          ? "accent"
          : "muted";

  const edge =
    tone === "danger"
      ? "var(--danger)"
      : tone === "ok"
        ? "var(--ok)"
        : tone === "accent"
          ? "var(--accent)"
          : "var(--border-strong)";

  const verdictColor =
    tone === "danger"
      ? "text-[var(--danger)]"
      : tone === "ok"
        ? "text-[var(--ok)]"
        : "text-[var(--accent)]";

  const bestSan =
    report?.bestMove && report.fenBefore
      ? uciToSan(report.fenBefore, report.bestMove)
      : report?.bestMove;

  const idle = !report && !loading;

  return (
    <div
      className="card relative w-full max-w-[560px] overflow-hidden"
      style={{ borderLeft: `2px solid ${edge}` }}
      data-testid="coach-banner"
    >
      <div className="px-4 pb-4 pt-3.5">
        <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
          <span className="label">coach</span>
          {classification && (
            <span
              className={`font-[family-name:var(--font-mono)] text-[0.6875rem] font-semibold uppercase tracking-[0.1em] ${verdictColor}`}
              data-testid="coach-verdict"
            >
              {ICONS[classification]} {VERDICT[classification]}
            </span>
          )}
          {report && (
            <span className="font-[family-name:var(--font-mono)] text-[0.6875rem] text-[var(--fg)]/70">
              {report.san}
              {report.theme !== "none"
                ? ` · ${report.theme.replace("_", " ")}`
                : ""}
            </span>
          )}
          {loading && (
            <span className="label animate-pulse normal-case">explaining…</span>
          )}
          {(explanation || loading) && onDismiss && (
            <button
              type="button"
              aria-label="Dismiss"
              className="ml-auto rounded px-1.5 py-0.5 text-sm leading-none text-[var(--muted)] transition-colors hover:bg-white/5 hover:text-[var(--fg)]"
              onClick={onDismiss}
            >
              ×
            </button>
          )}
        </div>

        <p
          className={`min-h-[2.5rem] text-[0.875rem] leading-relaxed ${
            idle ? "text-[var(--muted)]" : "text-[var(--fg)]/90"
          }`}
        >
          {idle
            ? "Play a move — the coach will call it good, a mistake, or a blunder."
            : loading && !explanation
              ? classification
                ? `${VERDICT[classification]} on ${report?.san}. Writing your lesson…`
                : "Judging your move…"
              : explanation}
        </p>

        {report?.bestMove && classification !== "BEST" && onShowBestMove && (
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              className="btn btn-accent px-3 py-1.5 font-[family-name:var(--font-mono)] text-[0.6875rem] uppercase tracking-[0.08em]"
              onClick={onShowBestMove}
              data-testid="show-best-move"
            >
              {bestMoveShown ? "Best move shown" : "Show best move"}
              {bestSan ? ` · ${bestSan}` : ""}
            </button>
            {bestMoveShown && (
              <span className="text-xs text-[var(--muted)]">
                Arrow drawn on the position before your move
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
