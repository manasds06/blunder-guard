"use client";

import { useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import { analyzeGame, clampEvalCp } from "@/lib/analysis/analyzer";
import type { AnalysisResult } from "@/lib/analysis/types";
import { explainMistake } from "@/lib/coach/explainer";
import { loadSettings } from "@/lib/storage/local";
import { loadCurrentGame } from "@/lib/storage/local";

const SAMPLE_PGN = `[Event "Sample"]
[Result "0-1"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 0-1`;

export function AnalyzeScreen() {
  const [pgn, setPgn] = useState("");
  const [progress, setProgress] = useState({ i: 0, n: 0 });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string>();
  const [cursor, setCursor] = useState(0);
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const [keyLesson, setKeyLesson] = useState<string>();

  async function runAnalysis(sourcePgn: string) {
    setRunning(true);
    setError(undefined);
    setResult(null);
    setKeyLesson(undefined);
    setExplanations({});
    try {
      const res = await analyzeGame(sourcePgn, (i, n) => setProgress({ i, n }), "w");
      setResult(res);
      setCursor(Math.max(0, res.moves.length - 1));

      // Key lesson from top mistake via coach API
      if (res.topMistakes[0]) {
        const settings = await loadSettings();
        const explained = await explainMistake(res.topMistakes[0], settings);
        setKeyLesson(explained.text);
      } else {
        setKeyLesson("No major mistakes found — nice game.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setRunning(false);
    }
  }

  async function loadLastGame() {
    const g = await loadCurrentGame();
    if (g?.pgn) {
      setPgn(g.pgn);
      await runAnalysis(g.pgn);
    } else {
      setError("No saved in-app game found. Play one on /play first.");
    }
  }

  const fen = useMemo(() => {
    if (!result || result.moves.length === 0) return "start";
    const move = result.moves[Math.min(cursor, result.moves.length - 1)];
    return move?.fenAfter ?? "start";
  }, [result, cursor]);

  const boardOptions = useMemo(
    () => ({
      id: "analyze-board",
      position: fen === "start" ? undefined : fen,
      darkSquareStyle: { backgroundColor: "#3d3d47" },
      lightSquareStyle: { backgroundColor: "#8a8a96" },
      darkSquareNotationStyle: { color: "#8a8a96", fontSize: "11px" },
      lightSquareNotationStyle: { color: "#3d3d47", fontSize: "11px" },
      boardStyle: {
        width: "100%",
        maxWidth: "480px",
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid var(--border-strong)",
      },
      allowDragging: false,
    }),
    [fen],
  );

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4">
        <div>
          <p className="label">full-game review</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-medium tracking-tight">
            Analyze
          </h1>
        </div>
        <textarea
          className="field min-h-32 w-full bg-[var(--panel)] p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed"
          placeholder="Paste a PGN here…"
          value={pgn}
          onChange={(e) => setPgn(e.target.value)}
          data-testid="pgn-input"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={running || !pgn.trim()}
            onClick={() => void runAnalysis(pgn)}
            data-testid="analyze-btn"
          >
            {running ? `Analyzing ${progress.i}/${progress.n}…` : "Analyze"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={running}
            onClick={() => void loadLastGame()}
          >
            Analyze my last game
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={running}
            onClick={() => {
              setPgn(SAMPLE_PGN);
            }}
          >
            Load sample
          </button>
        </div>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        {running && (
          <div className="h-1 overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full bg-[var(--accent)] transition-all"
              style={{
                width: progress.n
                  ? `${(100 * progress.i) / progress.n}%`
                  : "5%",
              }}
            />
          </div>
        )}

        {keyLesson && (
          <div
            className="card p-4"
            style={{ borderLeft: "2px solid var(--accent)" }}
          >
            <p className="label text-[var(--accent)]">one key lesson</p>
            <p className="mt-2 text-sm leading-relaxed">{keyLesson}</p>
          </div>
        )}

        <div className="flex flex-col items-center gap-3">
          <div className="w-full max-w-[480px] aspect-square">
            <Chessboard options={boardOptions} />
          </div>
          {result && (
            <div className="flex items-center gap-3 font-[family-name:var(--font-mono)] text-xs">
              <button
                type="button"
                className="btn btn-ghost px-2.5 py-1"
                onClick={() => setCursor((c) => Math.max(0, c - 1))}
              >
                ←
              </button>
              <span className="text-[var(--muted)]">
                move{" "}
                <span className="text-[var(--fg)]">
                  {cursor + 1}/{result.moves.length}
                </span>{" "}
                · accuracy{" "}
                <span className="text-[var(--fg)]">{result.accuracy}%</span>
              </span>
              <button
                type="button"
                className="btn btn-ghost px-2.5 py-1"
                onClick={() =>
                  setCursor((c) =>
                    Math.min((result?.moves.length ?? 1) - 1, c + 1),
                  )
                }
              >
                →
              </button>
            </div>
          )}
          {result && <EvalGraph result={result} cursor={cursor} onJump={setCursor} />}
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        {result && (
          <>
            <div className="card p-4">
              <p className="label mb-3">top mistakes</p>
              {result.topMistakes.length === 0 && (
                <p className="text-sm text-[var(--muted)]">None flagged.</p>
              )}
              {result.topMistakes.map((m, idx) => (
                <div
                  key={`${m.san}-${idx}`}
                  className="mb-3 border-b border-[var(--border)] pb-3 text-sm last:mb-0 last:border-0 last:pb-0"
                >
                  <p className="font-[family-name:var(--font-mono)] text-xs">
                    <span className="text-[var(--fg)]">{m.san}</span>{" "}
                    <span className="text-[var(--danger)]">
                      {m.classification.toLowerCase()}
                    </span>{" "}
                    <span className="text-[var(--muted)]">
                      {(m.swingCp / 100).toFixed(1)}p
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Best: {m.bestMove} · {m.theme}
                  </p>
                  <button
                    type="button"
                    className="mt-1.5 font-[family-name:var(--font-mono)] text-[0.6875rem] text-[var(--accent)] hover:underline"
                    onClick={() => {
                      void (async () => {
                        const settings = await loadSettings();
                        const ex = await explainMistake(m, settings);
                        setExplanations((prev) => ({ ...prev, [idx]: ex.text }));
                      })();
                    }}
                  >
                    explain →
                  </button>
                  {explanations[idx] && (
                    <p className="mt-2 text-xs leading-relaxed text-[var(--fg)]/85">
                      {explanations[idx]}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="card max-h-80 overflow-y-auto p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed">
              {result.moves.map((m) => (
                <button
                  key={m.ply}
                  type="button"
                  className={`mr-1 inline-block rounded px-1 transition-colors ${
                    cursor === m.ply
                      ? "bg-[var(--accent)] text-[var(--bg)]"
                      : "hover:bg-white/5"
                  }`}
                  onClick={() => setCursor(m.ply)}
                >
                  {m.ply % 2 === 0 ? `${m.ply / 2 + 1}.` : ""}
                  {m.san}
                  {m.classification === "BLUNDER"
                    ? "??"
                    : m.classification === "MISTAKE"
                      ? "?"
                      : m.classification === "INACCURACY"
                        ? "?!"
                        : ""}
                </button>
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function EvalGraph({
  result,
  cursor,
  onJump,
}: {
  result: AnalysisResult;
  cursor: number;
  onJump: (i: number) => void;
}) {
  const w = 400;
  const h = 120;
  const pts = result.moves.map((m, i) => {
    const x = (i / Math.max(1, result.moves.length - 1)) * w;
    const y = h / 2 - (clampEvalCp(m.evalCpWhite) / 500) * (h / 2 - 4);
    return `${x},${y}`;
  });
  const cursorX =
    (cursor / Math.max(1, result.moves.length - 1)) * w;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full max-w-[480px] cursor-crosshair rounded-lg border border-[var(--border)] bg-[var(--panel)]"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const idx = Math.round((x / rect.width) * (result.moves.length - 1));
        onJump(Math.max(0, Math.min(result.moves.length - 1, idx)));
      }}
      data-testid="eval-graph"
    >
      <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#1f1f26" />
      <polyline
        fill="none"
        stroke="#dfa93f"
        strokeWidth={1.5}
        points={pts.join(" ")}
      />
      <line
        x1={cursorX}
        y1={0}
        x2={cursorX}
        y2={h}
        stroke="#70707c"
        strokeDasharray="3"
      />
    </svg>
  );
}
