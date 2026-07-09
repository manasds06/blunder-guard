/**
 * OnnxBotProvider — Phase 6 custom neural bot.
 *
 * Pattern: Strategy — implements EngineProvider so /play needs zero UI changes.
 * evaluate() throws NotSupportedError (move predictor, not a judge).
 *
 * Until a trained manas-bot.onnx is present, getMove() falls back to a weak
 * Stockfish sample so the bot is selectable and games complete end-to-end.
 */
import { Chess, type Square } from "chess.js";
import type { EngineProvider } from "./provider";
import type { EngineMove, EvalOptions, Evaluation, MoveOptions } from "./types";
import { NotSupportedError } from "./types";
import { StockfishProvider } from "./stockfish";

const MODEL_URL = "/models/manas-bot.onnx";

export class OnnxBotProvider implements EngineProvider {
  readonly id = "manas-bot";
  private fallback: StockfishProvider | null = null;
  private modelReady = false;

  async init(): Promise<void> {
    // Try to detect a shipped ONNX model; if missing, use Stockfish fallback.
    try {
      const res = await fetch(MODEL_URL, { method: "HEAD" });
      this.modelReady = res.ok;
    } catch {
      this.modelReady = false;
    }
    if (!this.modelReady) {
      this.fallback = new StockfishProvider();
      await this.fallback.init();
    }
    // Real path (when model exists): spawn Worker with onnxruntime-web,
    // load WASM backend assets from /public, warm up with a dummy tensor.
  }

  async getMove(fen: string, _opts: MoveOptions): Promise<EngineMove> {
    if (this.modelReady) {
      // Placeholder for ONNX inference + temperature sampling + illegal mask.
      // Keeping the seam explicit so training export drops in cleanly.
      throw new Error(
        "ONNX model detected but inference worker not yet loaded — complete training export.",
      );
    }
    if (!this.fallback) {
      this.fallback = new StockfishProvider();
      await this.fallback.init();
    }
    // Human-like weak play stand-in: Skill 1 + MultiPV sampling (~600–700 feel)
    return this.fallback.getMove(fen, {
      skillLevel: 1,
      multipv: 4,
      movetime: 60,
      limitStrength: false,
    });
  }

  async evaluate(_fen: string, _opts: EvalOptions): Promise<Evaluation> {
    // This provider predicts moves; it does not judge positions.
    throw new NotSupportedError("OnnxBotProvider.evaluate");
  }

  dispose(): void {
    this.fallback?.dispose();
    this.fallback = null;
  }
}

/** Encode FEN → 8×8×17 planes (documented for the learning log / training parity). */
export function encodeFenPlanes(fen: string): Float32Array {
  const chess = new Chess(fen);
  const planes = new Float32Array(8 * 8 * 17);
  const piecePlane: Record<string, number> = {
    P: 0, N: 1, B: 2, R: 3, Q: 4, K: 5,
    p: 6, n: 7, b: 8, r: 9, q: 10, k: 11,
  };
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r]![c];
      if (!p) continue;
      const key = p.color === "w" ? p.type.toUpperCase() : p.type;
      const plane = piecePlane[key];
      if (plane == null) continue;
      planes[plane * 64 + r * 8 + c] = 1;
    }
  }
  // plane 12: side to move
  if (chess.turn() === "w") {
    planes.fill(1, 12 * 64, 13 * 64);
  }
  // planes 13–16: castling rights KQkq
  const rights = fen.split(" ")[2] ?? "-";
  const castlePlanes = [
    rights.includes("K"),
    rights.includes("Q"),
    rights.includes("k"),
    rights.includes("q"),
  ];
  castlePlanes.forEach((on, i) => {
    if (on) planes.fill(1, (13 + i) * 64, (14 + i) * 64);
  });
  return planes;
}

/** Mask illegal UCI moves using chess.js — always apply before sampling. */
export function legalUcis(fen: string): string[] {
  const chess = new Chess(fen);
  return chess.moves({ verbose: true }).map(
    (m) => m.from + m.to + (m.promotion ?? ""),
  );
}

/** Temperature sample over logits for legal moves only. */
export function sampleMove(
  fen: string,
  scores: Map<string, number>,
  temperature = 1.0,
): string {
  const legal = legalUcis(fen);
  const weights = legal.map((u) => {
    const s = scores.get(u) ?? -Infinity;
    return Math.exp(s / Math.max(0.05, temperature));
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < legal.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return legal[i]!;
  }
  return legal[0]!;
}

/** Soft validate a UCI string against the position. */
export function isLegalUci(fen: string, uci: string): boolean {
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: (uci[4] as "q") ?? undefined,
    });
    return Boolean(move);
  } catch {
    return false;
  }
}
