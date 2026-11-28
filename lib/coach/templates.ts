/**
 * Template fallback explanations — used when offline, rate-limited, or LLM errors.
 * The UI never shows a raw API error.
 */
import { Chess } from "chess.js";
import type { MistakeReport } from "./detector";

/** UCI (e.g. "g1f3") → SAN ("Nf3") in the given position; null if not legal there. */
export function uciToSan(fen: string, uci: string): string | null {
  if (!uci || uci.length < 4) return null;
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] ?? "q",
    });
    return move?.san ?? null;
  } catch {
    return null;
  }
}

/** A UCI line → SAN moves, stopping at the first move that isn't legal. */
export function lineToSan(fen: string, line: string[]): string[] {
  const out: string[] = [];
  try {
    const chess = new Chess(fen);
    for (const uci of line) {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? "q" });
      if (!move) break;
      out.push(move.san);
    }
  } catch {
    /* illegal move or bad FEN: return what we have */
  }
  return out;
}

const SAN_TOKEN = /\b(?:O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][1-8](?:=[QRBN])?)[+#]?/g;

/**
 * Moves an explanation may mention: the move played, the engine's line, and
 * any move legal in the position before the mistake. Anything else is a move
 * the LLM invented (often one that is impossible on the board).
 */
export function inventedMoves(text: string, report: MistakeReport): string[] {
  const allowed = new Set<string>();
  const strip = (s: string) => s.replace(/[+#]$/, "");
  allowed.add(strip(report.san));
  for (const m of lineToSan(report.fenBefore, report.bestLine)) allowed.add(strip(m));
  try {
    for (const m of new Chess(report.fenBefore).moves()) allowed.add(strip(m));
    for (const m of new Chess(report.fenAfter).moves()) allowed.add(strip(m));
  } catch {
    return [];
  }
  const found = text.match(SAN_TOKEN) ?? [];
  // Bare squares ("the e5 square") are not moves; only judge piece moves,
  // captures and castling, plus pawn pushes written as moves.
  return found.map(strip).filter((m) => !allowed.has(m) && !/^[a-h][1-8]$/.test(m));
}

/**
 * Bump when explanation text changes (templates, prompt, guard), so cached
 * explanations written by older code are never shown again.
 */
export const EXPLANATION_VERSION = "v2";

function moverIsWhite(fen: string): boolean {
  return fen.split(" ")[1] !== "b";
}

function pieceName(san: string): string {
  const c = san[0];
  if (!c || c === c.toLowerCase()) return "pawn";
  switch (c) {
    case "N":
      return "knight";
    case "B":
      return "bishop";
    case "R":
      return "rook";
    case "Q":
      return "queen";
    case "K":
      return "king";
    default:
      return "piece";
  }
}

export function templateExplanation(report: MistakeReport): string {
  const piece = pieceName(report.san);
  // Name the engine move in the notation the student sees on the board, and
  // only if it is actually legal in the position the mistake was made in.
  const best = uciToSan(report.fenBefore, report.bestMove) ?? "the engine's move";
  const luft = moverIsWhite(report.fenBefore) ? "h3" : "h6";
  const swing = (Math.abs(report.swingCp) / 100).toFixed(1);

  switch (report.theme) {
    case "hung_piece":
      return `Your ${piece} after ${report.san} looks unsafe — the engine says this costs about ${swing} pawns. Blunder Check question 1: is my piece safe? Prefer ${best} next time, which keeps your material.`;
    case "missed_capture":
      return `You played ${report.san}, but there was a stronger capture/tactic: ${best}. Blunder Check question 2: are their pieces hanging? Look for free material before quiet moves.`;
    case "back_rank":
      return `${report.san} leaves back-rank trouble on the table. Give your king luft (a pawn move like ${luft}) so enemy heavy pieces can't mate on the home rank. Engine idea: ${best}.`;
    case "missed_mate":
      return `There was a forced mate available (${best}), but ${report.san} lets it slip. When the position is sharp, calculate checks and captures first.`;
    default:
      if (report.classification === "BEST") {
        return `Nice — ${report.san} matches the engine's top choice. Keep asking the Blunder Check before every move.`;
      }
      if (report.classification === "BLUNDER" || report.classification === "MISTAKE") {
        return `${report.san} dropped about ${swing} pawns of evaluation. The engine preferred ${best}. Pause and run the Blunder Check: piece safe? their pieces hanging? king safe?`;
      }
      return `${report.san} is playable; ${best} was a bit more accurate. Small edges add up — stay curious about the why.`;
  }
}
