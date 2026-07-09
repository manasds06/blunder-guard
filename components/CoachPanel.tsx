"use client";

import type { Classification, MistakeReport } from "@/lib/coach/detector";

const ICONS: Record<Classification, string> = {
  BLUNDER: "??",
  MISTAKE: "?",
  INACCURACY: "?!",
  BEST: "✓",
  OK: "·",
  BOOK: "📖",
};

const COLORS: Record<Classification, string> = {
  BLUNDER: "text-[var(--danger)]",
  MISTAKE: "text-orange-400",
  INACCURACY: "text-yellow-400",
  BEST: "text-[var(--ok)]",
  OK: "text-[var(--muted)]",
  BOOK: "text-[var(--muted)]",
};

export type CoachFeedItem = {
  ply: number;
  report: MistakeReport;
  explanation?: string;
  explaining?: boolean;
};

type Props = {
  items: CoachFeedItem[];
  onExplain: (ply: number) => void;
  summary?: { blunders: number; mistakes: number; inaccuracies: number; best: number };
  biggestLesson?: string;
  gameOver: boolean;
};

export function CoachPanel({
  items,
  onExplain,
  summary,
  biggestLesson,
  gameOver,
}: Props) {
  const flagged = items.filter(
    (i) =>
      i.report.classification === "BLUNDER" ||
      i.report.classification === "MISTAKE" ||
      i.report.classification === "INACCURACY" ||
      i.report.classification === "BEST",
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-[var(--accent)]">
          Coach
        </h2>
        <span className="text-xs text-[var(--muted)]">Stockfish judges · LLM explains</span>
      </div>

      {gameOver && summary && (
        <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-3 text-sm">
          <p className="font-semibold">Post-game</p>
          <p className="mt-1 text-[var(--muted)]">
            ?? {summary.blunders} · ? {summary.mistakes} · ?! {summary.inaccuracies} · ✓{" "}
            {summary.best}
          </p>
          {biggestLesson && (
            <p className="mt-2 text-[var(--fg)]">{biggestLesson}</p>
          )}
        </div>
      )}

      <ul className="max-h-72 space-y-2 overflow-y-auto text-sm" data-testid="coach-feed">
        {flagged.length === 0 && (
          <li className="text-[var(--muted)]">Make a move — classifications appear here.</li>
        )}
        {flagged.map((item) => (
          <li
            key={item.ply}
            className="rounded border border-[var(--border)]/60 bg-[var(--bg)]/50 p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className={COLORS[item.report.classification]}>
                <span className="font-mono font-bold">
                  {ICONS[item.report.classification]}
                </span>{" "}
                {item.report.san}{" "}
                <span className="text-[var(--muted)]">
                  ({item.report.classification.toLowerCase()}
                  {item.report.theme !== "none" ? ` · ${item.report.theme}` : ""})
                </span>
              </span>
              {item.report.classification !== "BEST" &&
                item.report.classification !== "OK" && (
                  <button
                    type="button"
                    className="shrink-0 rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-white/5 disabled:opacity-50"
                    onClick={() => onExplain(item.ply)}
                    disabled={item.explaining}
                    data-testid="explain-btn"
                  >
                    {item.explaining ? "…" : item.explanation ? "Again" : "Explain"}
                  </button>
                )}
            </div>
            {item.explanation && (
              <p className="mt-2 text-[var(--fg)]/90 leading-relaxed">{item.explanation}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
