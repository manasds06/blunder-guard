/**
 * Browser-side twin of ml/bgml/encoding.py. The trained model only works if
 * these functions produce exactly the numbers it was trained on, so
 * human-encoding.test.ts checks them against a fixture written by
 * ml/export_onnx.py from the Python encoder itself.
 *
 * Board → 17 planes × 64 squares, index = plane*64 + rank*8 + file, drawn
 * from the SIDE TO MOVE's point of view (Black's turn: board mirrored,
 * colours swapped). Planes 0–5 mover's P N B R Q K, 6–11 opponent's,
 * 12 all ones, 13–16 castling: mover K-side, mover Q-side, opponent K, Q.
 *
 * Move → from*64 + to in the same mirrored frame. Promotions always decode
 * as queen (4096 classes can't name the piece; see encoding.py).
 */
import { Chess } from "chess.js";

export const N_PLANES = 17;
export const N_MOVES = 4096;
const PIECES = "pnbrqk";

/** "e4" → 28, or its mirror when `black` */
function squareIndex(sq: string, black: boolean): number {
  const file = sq.charCodeAt(0) - 97;
  const rank = sq.charCodeAt(1) - 49;
  return (black ? 7 - rank : rank) * 8 + file;
}

function squareName(index: number, black: boolean): string {
  const rank = Math.floor(index / 8);
  const file = index % 8;
  return String.fromCharCode(97 + file) + String((black ? 7 - rank : rank) + 1);
}

export function encodeBoard(fen: string): Float32Array {
  const chess = new Chess(fen);
  const black = chess.turn() === "b";
  const planes = new Float32Array(N_PLANES * 64);
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const mine = (piece.color === "b") === black;
      const plane = PIECES.indexOf(piece.type) + (mine ? 0 : 6);
      planes[plane * 64 + squareIndex(piece.square, black)] = 1;
    }
  }
  planes.fill(1, 12 * 64, 13 * 64);
  const rights = fen.split(" ")[2] ?? "-";
  const [myK, myQ, oppK, oppQ] = black ? ["k", "q", "K", "Q"] : ["K", "Q", "k", "q"];
  [myK, myQ, oppK, oppQ].forEach((flag, i) => {
    if (rights.includes(flag!)) planes.fill(1, (13 + i) * 64, (14 + i) * 64);
  });
  return planes;
}

export function moveIndex(uci: string, turn: "w" | "b"): number {
  const black = turn === "b";
  return squareIndex(uci.slice(0, 2), black) * 64 + squareIndex(uci.slice(2, 4), black);
}

/** Legal moves as { index → uci }. Under-promotions share the queen's index; keep the queen. */
export function legalMoves(fen: string): Map<number, string> {
  const chess = new Chess(fen);
  const out = new Map<number, string>();
  for (const m of chess.moves({ verbose: true })) {
    if (m.promotion && m.promotion !== "q") continue;
    out.set(moveIndex(m.from + m.to, chess.turn()), m.from + m.to + (m.promotion ?? ""));
  }
  return out;
}

export function decodeMove(index: number, fen: string): string {
  const black = fen.split(" ")[1] === "b";
  return squareName(Math.floor(index / 64), black) + squareName(index % 64, black);
}

/**
 * Pick a move from raw model logits: drop illegal moves, softmax with
 * `temperature`, then sample. Sampling (not argmax) is what makes the bot
 * human — argmax would play its single best guess every time.
 * temperature 1 = the model's own distribution; lower = more predictable.
 */
export function pickMove(
  fen: string,
  logits: Float32Array,
  temperature = 1,
  random: () => number = Math.random,
): string {
  const legal = legalMoves(fen);
  if (legal.size === 0) throw new Error("No legal moves");
  const t = Math.max(0.05, temperature);
  const entries = [...legal.entries()];
  const scaled = entries.map(([i]) => logits[i]! / t);
  const max = Math.max(...scaled);
  const weights = scaled.map((s) => Math.exp(s - max));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = random() * total;
  for (let k = 0; k < entries.length; k++) {
    r -= weights[k]!;
    if (r <= 0) return entries[k]![1];
  }
  return entries[entries.length - 1]![1];
}
