"use client";

import type { Classification, MistakeReport } from "@/lib/coach/detector";

const ICONS: Record<Classification, string> = {
  BLUNDER: "??",
  MISTAKE: "?",
  INACCURACY: "?!",
  BEST: "!",
  OK: "·",
  BOOK: "·",
};

const COLORS: Record<Classification, string> = {
  BLUNDER: "text-[var(--danger)]",
  MISTAKE: "text-[#e8843f]",
  INACCURACY: "text-[var(--accent)]",
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
  activePly?: number | null;
  onSelect: (ply: number) => void;
  summary?: {
    blunders: number;
    mistakes: number;
    inaccuracies: number;
    best: number;
  };
  gameOver: boolean;
};

/** Compact move feed — explanations auto-appear in the banner above the board. */
export function CoachPanel({
  items,
  activePly,
  onSelect,
  summary,
  gameOver,
}: Props) {
  const flagged = items.filter(
    (i) =>
      i.report.classification === "BLUNDER" ||
      i.report.classification === "MISTAKE" ||
      i.report.classification === "INACCURACY" ||
      i.report.classification === "BEST" ||
      i.report.classification === "OK",
  );

  return (
    <div className="flex flex-col gap-3">
      {gameOver && summary && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
          <p className="label">post-game</p>
          <p className="mt-1.5 font-[family-name:var(--font-mono)] text-xs text-[var(--fg)]/80">
            ?? {summary.blunders} · ? {summary.mistakes} · ?!{" "}
            {summary.inaccuracies} · ! {summary.best}
          </p>
        </div>
      )}

      <ul
        className="max-h-72 space-y-1 overflow-y-auto"
        data-testid="coach-feed"
      >
        {flagged.length === 0 && (
          <li className="text-sm text-[var(--muted)]">
            Play a move — every verdict lands here. Click one to revisit it.
          </li>
        )}
        {flagged.map((item) => {
          const active = activePly === item.ply;
          return (
            <li key={item.ply}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left font-[family-name:var(--font-mono)] text-xs transition-colors ${
                  active
                    ? "bg-[var(--accent-dim)] text-[var(--fg)]"
                    : "hover:bg-white/5"
                }`}
                onClick={() => onSelect(item.ply)}
              >
                <span className={COLORS[item.report.classification]}>
                  <span className="font-semibold">
                    {ICONS[item.report.classification]}
                  </span>{" "}
                  <span className="text-[var(--fg)]/85">{item.report.san}</span>{" "}
                  <span className="text-[var(--muted)]">
                    {item.report.classification.toLowerCase()}
                  </span>
                </span>
                {item.explaining && (
                  <span className="text-[var(--muted)]">…</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
