/**
 * Local rule-based mistake detection.
 * Pattern: pure functions over engine evals — free, instant, no LLM.
 *
 * Eval sign convention (ONE place):
 * Stockfish reports cp/mate from the side-to-move perspective.
 * We normalize swings to the *mover's* perspective so a blunder is always
 * a large negative swing for whoever just moved.
 */
import { Chess, type Square } from "chess.js";
import type { Evaluation } from "@/lib/engine/types";
import type { EngineProvider } from "@/lib/engine/provider";

export type Classification =
  | "BEST"
  | "INACCURACY"
  | "MISTAKE"
  | "BLUNDER"
  | "BOOK"
  | "OK";

export type MistakeTheme =
  | "hung_piece"
  | "missed_capture"
  | "back_rank"
  | "missed_mate"
  | "none";

export type MistakeReport = {
  classification: Classification;
  swingCp: number;
  theme: MistakeTheme;
  bestMove: string; // UCI
  bestLine: string[];
  evalBefore: Evaluation;
  evalAfter: Evaluation;
  san: string;
  fenBefore: string;
  fenAfter: string;
};

/** Convert Stockfish score (side-to-move) to White's perspective in cp. */
export function scoreToWhiteCp(ev: Evaluation): number {
  if (ev.mate != null) {
    // Mate in N for side-to-move → huge score; sign from White's view needs FEN
    return ev.mate > 0 ? 10000 - ev.mate * 10 : -10000 - ev.mate * 10;
  }
  return ev.cp ?? 0;
}

/**
 * Normalize eval to the mover's perspective.
 * fenBefore: position before the move (side to move = mover).
 * After the move, side to move flipped — Stockfish score is from opponent's view.
 */
export function moverPerspectiveCp(
  ev: Evaluation,
  fen: string,
  forMover: boolean,
): number {
  const chess = new Chess(fen);
  const whiteToMove = chess.turn() === "w";
  let whiteCp: number;
  if (ev.mate != null) {
    const mateForSideToMove = ev.mate > 0;
    const whiteMating = whiteToMove ? mateForSideToMove : !mateForSideToMove;
    const abs = 10000 - Math.abs(ev.mate) * 10;
    whiteCp = whiteMating ? abs : -abs;
  } else {
    const cp = ev.cp ?? 0;
    whiteCp = whiteToMove ? cp : -cp;
  }

  // forMover=true → fen is fenBefore (turn = mover)
  // forMover=false → fen is fenAfter (turn = opponent); we still want previous mover
  if (forMover) {
    return whiteToMove ? whiteCp : -whiteCp;
  }
  const prevMoverWasWhite = !whiteToMove;
  return prevMoverWasWhite ? whiteCp : -whiteCp;
}

export function classifySwing(swingCp: number, playedBest: boolean): Classification {
  if (playedBest) return "BEST";
  if (swingCp <= -200) return "BLUNDER";
  if (swingCp <= -100) return "MISTAKE";
  if (swingCp <= -50) return "INACCURACY";
  return "OK";
}

function detectThemes(
  fenBefore: string,
  fenAfter: string,
  evalBefore: Evaluation,
  bestMoveUci: string,
  playedUci: string,
): MistakeTheme {
  if (evalBefore.mate != null && evalBefore.mate > 0) {
    // Had a mate — if we didn't play the mating move, flag it
    if (bestMoveUci && playedUci !== bestMoveUci) return "missed_mate";
  }

  const before = new Chess(fenBefore);
  const after = new Chess(fenAfter);

  // Hung piece: check if the moved piece is undefended / capturable.
  const moves = before.moves({ verbose: true });
  const played = moves.find(
    (m) => m.from + m.to + (m.promotion ?? "") === playedUci,
  );
  if (played) {
    // After our move, can opponent capture on the destination for free-ish?
    after.load(fenAfter);
    const oppCaptures = after.moves({ verbose: true }).filter(
      (m) => m.to === played.to && m.captured,
    );
    if (oppCaptures.length > 0) {
      // Check if destination is defended
      const defenders = countAttackers(after, played.to, played.color);
      const attackers = countAttackers(
        after,
        played.to,
        played.color === "w" ? "b" : "w",
      );
      if (attackers > defenders) return "hung_piece";
    }
  }

  // Missed capture: best move was a capture and we didn't play it
  if (bestMoveUci && bestMoveUci !== playedUci) {
    const best = moves.find(
      (m) => m.from + m.to + (m.promotion ?? "") === bestMoveUci,
    );
    if (best?.captured || best?.san.includes("+")) {
      return "missed_capture";
    }
  }

  // Back-rank danger heuristic
  if (isBackRankDanger(after, before.turn())) return "back_rank";

  return "none";
}

function countAttackers(chess: Chess, square: string, byColor: "w" | "b"): number {
  // Generate all moves for `byColor` and count those targeting square.
  // Temporarily set turn if needed.
  const fen = chess.fen();
  const parts = fen.split(" ");
  parts[1] = byColor;
  const tmp = new Chess(parts.join(" "));
  return tmp.moves({ verbose: true }).filter((m) => m.to === square).length;
}

function isBackRankDanger(chess: Chess, kingColor: "w" | "b"): boolean {
  const board = chess.board();
  let kingSq: string | null = null;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r]![c];
      if (p?.type === "k" && p.color === kingColor) {
        kingSq = "abcdefgh"[c]! + (8 - r);
      }
    }
  }
  if (!kingSq) return false;
  const rank = kingSq[1];
  const home = kingColor === "w" ? "1" : "8";
  if (rank !== home) return false;
  // No luft: check f/g/h pawns still on 2nd/7th for that color — simplified
  const pawnRank = kingColor === "w" ? "2" : "7";
  const files = ["f", "g", "h"] as const;
  const hasLuft = files.some((f) => {
    const sq = (f + pawnRank) as Square;
    const piece = chess.get(sq);
    return !piece || piece.type !== "p" || piece.color !== kingColor;
  });
  return !hasLuft;
}

export async function analyzeUserMove(
  provider: EngineProvider,
  fenBefore: string,
  san: string,
  depth = 12,
): Promise<MistakeReport> {
  const before = new Chess(fenBefore);
  const move = before.move(san);
  if (!move) throw new Error(`Illegal move in detector: ${san}`);
  const fenAfter = before.fen();
  const playedUci = move.from + move.to + (move.promotion ?? "");

  const [evalBefore, evalAfter] = await Promise.all([
    provider.evaluate(fenBefore, { depth }),
    provider.evaluate(fenAfter, { depth }),
  ]);

  const beforeCp = moverPerspectiveCp(evalBefore, fenBefore, true);
  const afterCp = moverPerspectiveCp(evalAfter, fenAfter, false);
  const swingCp = afterCp - beforeCp;

  const bestUci = evalBefore.bestLine[0] ?? "";
  const playedBest = bestUci === playedUci;
  const classification = classifySwing(swingCp, playedBest);
  const theme = detectThemes(
    fenBefore,
    fenAfter,
    evalBefore,
    bestUci,
    playedUci,
  );

  return {
    classification,
    swingCp,
    theme,
    bestMove: bestUci,
    bestLine: evalBefore.bestLine,
    evalBefore,
    evalAfter,
    san,
    fenBefore,
    fenAfter,
  };
}

/**
 * Quick pre-move blunder check (depth 8).
 * Returns true if the resulting position hangs material ≥ ~3 pawns for the mover.
 */
export async function quickBlunderCheck(
  provider: EngineProvider,
  fenBefore: string,
  from: string,
  to: string,
  promotion: "q" | "r" | "b" | "n" = "q",
): Promise<{ warn: boolean; swingCp: number }> {
  const chess = new Chess(fenBefore);
  let move;
  try {
    move = chess.move({
      from: from as Square,
      to: to as Square,
      promotion,
    });
  } catch {
    return { warn: false, swingCp: 0 };
  }
  if (!move) return { warn: false, swingCp: 0 };

  const fenAfter = chess.fen();
  const [evalBefore, evalAfter] = await Promise.all([
    provider.evaluate(fenBefore, { depth: 8, movetime: 150 }),
    provider.evaluate(fenAfter, { depth: 8, movetime: 150 }),
  ]);

  const beforeCp = moverPerspectiveCp(evalBefore, fenBefore, true);
  const afterCp = moverPerspectiveCp(evalAfter, fenAfter, false);
  const swingCp = afterCp - beforeCp;
  // ≥ 3 pawns = 300cp
  return { warn: swingCp <= -300, swingCp };
}
