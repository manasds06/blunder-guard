/**
 * Client-side full-game analysis pipeline.
 * Pattern: Pipeline with a progress callback seam — swap to server later.
 */
import { Chess } from "chess.js";
import { analyzeUserMove, type MistakeReport } from "@/lib/coach/detector";
import { StockfishProvider } from "@/lib/engine/stockfish";
import type { AnalyzedMove, AnalysisResult } from "./types";

/** Clamp eval for graphs: mates and huge scores → ±500 cp (±5 pawns). */
export function clampEvalCp(cp: number): number {
  return Math.max(-500, Math.min(500, cp));
}

function whitePerspectiveFromEval(
  fen: string,
  ev: { cp?: number; mate?: number },
): number {
  const chess = new Chess(fen);
  const whiteToMove = chess.turn() === "w";
  if (ev.mate != null) {
    const mateForStm = ev.mate > 0;
    const whiteMating = whiteToMove ? mateForStm : !mateForStm;
    const abs = 10000 - Math.abs(ev.mate) * 10;
    return clampEvalCp(whiteMating ? abs : -abs);
  }
  const cp = ev.cp ?? 0;
  return clampEvalCp(whiteToMove ? cp : -cp);
}

/** Strip Chess.com clock/comments that make chess.js picky. */
export function sanitizePgn(pgn: string): string {
  return pgn
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\$\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function historyFromPgn(pgn: string): string[] {
  const clean = sanitizePgn(pgn);
  const chess = new Chess();
  try {
    chess.loadPgn(clean, { strict: false });
    const h = chess.history();
    if (h.length > 0) return h;
  } catch {
    // fall through
  }

  chess.reset();
  const tokens = clean
    .replace(/\[.*?\]/g, " ")
    .replace(/\d+\.(\.\.)?/g, " ")
    .split(/\s+/)
    .filter(
      (t) =>
        t &&
        !["1-0", "0-1", "1/2-1/2", "*"].includes(t) &&
        !t.startsWith("["),
    );
  for (const san of tokens) {
    try {
      chess.move(san);
    } catch {
      break;
    }
  }
  return chess.history();
}

export async function analyzeGame(
  pgn: string,
  onProgress?: (i: number, n: number) => void,
  userColor: "w" | "b" = "w",
): Promise<AnalysisResult> {
  const history = historyFromPgn(pgn);
  if (history.length === 0) {
    throw new Error("Could not parse PGN — paste a valid game.");
  }

  const engine = new StockfishProvider();
  await engine.init();

  const moves: AnalyzedMove[] = [];
  const userReports: MistakeReport[] = [];
  const replay = new Chess();

  try {
    for (let i = 0; i < history.length; i++) {
      const san = history[i]!;
      const fenBefore = replay.fen();
      const move = replay.move(san);
      if (!move) break;
      const fenAfter = replay.fen();
      const isUserMove = move.color === userColor;

      onProgress?.(i + 1, history.length);

      const evaluation = await engine.evaluate(fenAfter, {
        movetime: 300,
        depth: 14,
      });
      const evalCpWhite = whitePerspectiveFromEval(fenAfter, evaluation);

      let report: MistakeReport | undefined;
      if (isUserMove) {
        try {
          report = await analyzeUserMove(engine, fenBefore, san, 12);
          userReports.push(report);
        } catch (e) {
          console.warn("classify failed", e);
        }
      }

      moves.push({
        ply: i,
        san,
        fenBefore,
        fenAfter,
        evalCpWhite,
        classification: report?.classification,
        report,
        isUserMove,
      });
    }
  } finally {
    engine.dispose();
  }

  const topMistakes = [...userReports]
    .filter(
      (r) =>
        r.classification === "BLUNDER" ||
        r.classification === "MISTAKE" ||
        r.classification === "INACCURACY",
    )
    .sort((a, b) => a.swingCp - b.swingCp)
    .slice(0, 3);

  const swings = userReports.map((r) => Math.abs(Math.min(0, r.swingCp)));
  const avg =
    swings.length === 0 ? 0 : swings.reduce((a, b) => a + b, 0) / swings.length;
  const accuracy = Math.max(0, Math.min(100, Math.round(100 - avg / 5)));

  return {
    moves,
    topMistakes,
    accuracy,
    pgn: sanitizePgn(pgn),
  };
}
