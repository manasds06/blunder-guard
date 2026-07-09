"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard, type PieceDropHandlerArgs } from "react-chessboard";
import type { PuzzleRecord } from "@/lib/puzzles/bank";
import { CURATED_THEMES } from "@/lib/puzzles/bank";
import {
  getPuzzleMeta,
  parsePuzzleLine,
  recordAttempt,
  selectPuzzle,
} from "@/lib/puzzles/session";
import { explainMistake } from "@/lib/coach/explainer";
import type { MistakeReport } from "@/lib/coach/detector";
import { loadSettings } from "@/lib/storage/local";

type Phase = "loading" | "playing" | "failed" | "solved";

export function PuzzleScreen() {
  const [pool, setPool] = useState<PuzzleRecord[]>([]);
  const [puzzle, setPuzzle] = useState<PuzzleRecord | null>(null);
  const [fen, setFen] = useState(() => new Chess().fen());
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [solution, setSolution] = useState<string[]>([]);
  const [solIndex, setSolIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [streak, setStreak] = useState(0);
  const [rating, setRating] = useState(600);
  const [dailyCount, setDailyCount] = useState(0);
  const [dailyGoal, setDailyGoal] = useState(10);
  const [practiceMode, setPracticeMode] = useState(false);
  const [themeFilter, setThemeFilter] = useState<string[]>([]);
  const [explanation, setExplanation] = useState<string>();
  const [sessionStreak, setSessionStreak] = useState(0);

  const chessRef = useMemo(() => ({ current: new Chess() }), []);

  const loadMeta = useCallback(async () => {
    const meta = await getPuzzleMeta();
    setRating(meta.puzzleRating);
    setDailyCount(meta.dailyCount);
    setDailyGoal(meta.dailyGoal);
    setStreak(meta.streak);
  }, []);

  const startPuzzle = useCallback(
    async (puzzles: PuzzleRecord[], userRating: number) => {
      setExplanation(undefined);
      const selected = await selectPuzzle({
        puzzles,
        userRating,
        themes: themeFilter.length ? themeFilter : undefined,
        practiceMode,
      });
      if (!selected) {
        setPhase("loading");
        return;
      }
      const { setupUci, solutionUcis } = parsePuzzleLine(selected);
      const chess = new Chess(selected.fen);
      if (setupUci) {
        const from = setupUci.slice(0, 2) as Square;
        const to = setupUci.slice(2, 4) as Square;
        const promotion = setupUci[4] as "q" | "r" | "b" | "n" | undefined;
        chess.move({ from, to, promotion });
      }
      chessRef.current = chess;
      setPuzzle(selected);
      setFen(chess.fen());
      setOrientation(chess.turn() === "w" ? "white" : "black");
      setSolution(solutionUcis);
      setSolIndex(0);
      setPhase("playing");
    },
    [chessRef, practiceMode, themeFilter],
  );

  useEffect(() => {
    void (async () => {
      await loadMeta();
      const res = await fetch("/api/puzzles");
      const data = (await res.json()) as { puzzles: PuzzleRecord[] };
      setPool(data.puzzles);
      const meta = await getPuzzleMeta();
      await startPuzzle(data.puzzles, meta.puzzleRating);
    })();
  }, [loadMeta, startPuzzle]);

  const fail = useCallback(async () => {
    if (!puzzle) return;
    setPhase("failed");
    setSessionStreak(0);
    // Show solution continuation on board
    const chess = new Chess(puzzle.fen);
    const { setupUci, solutionUcis } = parsePuzzleLine(puzzle);
    if (setupUci) {
      chess.move({
        from: setupUci.slice(0, 2) as Square,
        to: setupUci.slice(2, 4) as Square,
        promotion: setupUci[4] as "q" | undefined,
      });
    }
    for (const uci of solutionUcis) {
      chess.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: uci[4] as "q" | undefined,
      });
    }
    chessRef.current = chess;
    setFen(chess.fen());
    const meta = await recordAttempt(puzzle, false, practiceMode);
    setRating(meta.puzzleRating);
    setDailyCount(meta.dailyCount);
    setStreak(meta.streak);
  }, [chessRef, practiceMode, puzzle]);

  const onDrop = useCallback(
    ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
      if (!targetSquare || phase !== "playing" || !puzzle) return false;
      const expected = solution[solIndex];
      if (!expected) return false;
      const played =
        sourceSquare +
        targetSquare +
        /* default queen promo */ "";
      const chess = chessRef.current;
      const legal = chess.moves({ verbose: true }).find(
        (m) => m.from === sourceSquare && m.to === targetSquare,
      );
      if (!legal) return false;

      const playedUci = legal.from + legal.to + (legal.promotion ?? "");
      const expectedBase = expected.slice(0, 4);
      const ok =
        playedUci === expected ||
        playedUci.startsWith(expectedBase) ||
        // Accept alternate mates
        (() => {
          try {
            const probe = new Chess(chess.fen());
            probe.move({
              from: sourceSquare as Square,
              to: targetSquare as Square,
              promotion: (legal.promotion as "q") ?? "q",
            });
            return probe.isCheckmate() && expected.length >= 4;
          } catch {
            return false;
          }
        })();

      if (!ok) {
        void fail();
        return false;
      }

      chess.move({
        from: sourceSquare as Square,
        to: targetSquare as Square,
        promotion: (legal.promotion as "q") ?? undefined,
      });
      setFen(chess.fen());

      const nextIdx = solIndex + 1;
      // Opponent auto-plays next solution ply if any
      if (nextIdx < solution.length) {
        const reply = solution[nextIdx]!;
        // If this index is opponent's move in the line, play it
        // solution array is only solver moves when we parsed with setup —
        // actually solutionUcis is ALL remaining including opponent replies interleaved.
        // Lichess: after setup, moves alternate solver/opponent.
        // Our parsePuzzleLine returns moves.slice(1) which includes both sides.
        // Solver plays even indices of solutionUcis (0,2,4…); opponent 1,3,5…
      }

      // Advance: play opponent reply if present
      let idx = solIndex + 1;
      if (idx < solution.length) {
        // Check whose turn — if not solver orientation side, auto-play
        const solverColor = orientation === "white" ? "w" : "b";
        if (chess.turn() !== solverColor && solution[idx]) {
          const uci = solution[idx]!;
          chess.move({
            from: uci.slice(0, 2) as Square,
            to: uci.slice(2, 4) as Square,
            promotion: uci[4] as "q" | undefined,
          });
          setFen(chess.fen());
          idx += 1;
        }
      }

      if (idx >= solution.length) {
        setPhase("solved");
        setSessionStreak((s) => s + 1);
        void recordAttempt(puzzle, true, practiceMode).then((meta) => {
          setRating(meta.puzzleRating);
          setDailyCount(meta.dailyCount);
          setStreak(meta.streak);
        });
      } else {
        setSolIndex(idx);
      }
      return true;
    },
    [
      chessRef,
      fail,
      orientation,
      phase,
      practiceMode,
      puzzle,
      solIndex,
      solution,
    ],
  );

  const next = useCallback(() => {
    void startPuzzle(pool, rating);
  }, [pool, rating, startPuzzle]);

  const explainFail = useCallback(async () => {
    if (!puzzle) return;
    const { solutionUcis } = parsePuzzleLine(puzzle);
    const best = solutionUcis[0] ?? "";
    const report: MistakeReport = {
      classification: "MISTAKE",
      swingCp: -200,
      theme:
        puzzle.themes.includes("hangingPiece")
          ? "hung_piece"
          : puzzle.themes.includes("backRankMate")
            ? "back_rank"
            : "missed_capture",
      bestMove: best,
      bestLine: solutionUcis,
      evalBefore: { bestLine: solutionUcis, depth: 1 },
      evalAfter: { bestLine: [], depth: 1 },
      san: best,
      fenBefore: puzzle.fen,
      fenAfter: fen,
    };
    const settings = await loadSettings();
    const result = await explainMistake(report, settings);
    setExplanation(result.text);
  }, [fen, puzzle]);

  const boardOptions = useMemo(
    () => ({
      id: "puzzle-board",
      position: fen,
      boardOrientation: orientation,
      allowDragging: phase === "playing",
      boardStyle: {
        borderRadius: "4px",
        width: "100%",
        maxWidth: "520px",
      },
      onPieceDrop: onDrop,
    }),
    [fen, orientation, phase, onDrop],
  );

  function toggleTheme(t: string) {
    setThemeFilter((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_280px]">
      <div className="flex flex-col items-center gap-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            Puzzle rating: <strong data-testid="puzzle-rating">{rating}</strong>
          </span>
          <span>
            Session streak: <strong>{sessionStreak}</strong>
          </span>
          <span>
            Daily: {dailyCount}/{dailyGoal} · streak {streak}
          </span>
          <span className="text-[var(--muted)]">
            {orientation === "white" ? "White" : "Black"} to move
          </span>
        </div>
        <div className="w-full max-w-[520px] aspect-square">
          <Chessboard options={boardOptions} />
        </div>
        <p className="text-sm" data-testid="puzzle-status">
          {phase === "loading" && "Loading puzzle…"}
          {phase === "playing" && "Find the best move"}
          {phase === "solved" && "Solved!"}
          {phase === "failed" && "Incorrect — solution shown"}
        </p>
        {(phase === "solved" || phase === "failed") && (
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg)]"
              onClick={next}
              data-testid="next-puzzle"
            >
              Next puzzle
            </button>
            {phase === "failed" && (
              <button
                type="button"
                className="rounded border border-[var(--border)] px-4 py-2 text-sm"
                onClick={() => void explainFail()}
              >
                Explain
              </button>
            )}
          </div>
        )}
        {explanation && (
          <p className="max-w-lg text-sm text-[var(--fg)]/90">{explanation}</p>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4 text-sm">
          <label className="mb-3 flex items-center justify-between">
            <span>Practice by theme (no rating)</span>
            <input
              type="checkbox"
              checked={practiceMode}
              onChange={(e) => setPracticeMode(e.target.checked)}
            />
          </label>
          <p className="mb-2 text-[var(--muted)]">Themes</p>
          <div className="flex flex-wrap gap-1">
            {CURATED_THEMES.map((t) => (
              <button
                key={t}
                type="button"
                className={`rounded px-2 py-0.5 text-xs border ${
                  themeFilter.includes(t)
                    ? "border-[var(--accent)] bg-[var(--accent)]/20"
                    : "border-[var(--border)]"
                }`}
                onClick={() => toggleTheme(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 w-full rounded border border-[var(--border)] py-1.5 text-xs"
            onClick={() => void startPuzzle(pool, rating)}
          >
            Apply filters
          </button>
        </div>
        {puzzle && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)]">
            <p>
              Puzzle <span className="text-[var(--fg)]">{puzzle.id}</span> ·{" "}
              {puzzle.rating} Elo
            </p>
            <p className="mt-1">{puzzle.themes.join(", ")}</p>
          </div>
        )}
      </aside>
    </div>
  );
}
