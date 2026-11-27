/**
 * Shared engine types.
 * Pattern: plain data contracts so every EngineProvider speaks the same language.
 */

export type EngineMove = {
  /** UCI move string, e.g. "e2e4" or "e7e8q" */
  uci: string;
  /** Optional SAN if the caller already converted it */
  san?: string;
};

export type EvalLine = {
  /** Centipawns from the side-to-move perspective (Stockfish convention) */
  cp?: number;
  mate?: number;
  /** Principal variation as UCI moves */
  pv: string[];
  multipv: number;
};

export type Evaluation = {
  cp?: number;
  mate?: number;
  bestLine: string[];
  depth: number;
  multipv?: EvalLine[];
};

export type MoveOptions = {
  /** Soft time budget in ms */
  movetime?: number;
  depth?: number;
  /** MultiPV count — set BEFORE go; reset to 1 after weak-bot sampling */
  multipv?: number;
  /** Target Elo: UCI_LimitStrength (1320–2000) for Stockfish; the rating the human-bot plays as */
  elo?: number;
  /** Human-bot only: the opponent's (player's) rating, a model input */
  opponentElo?: number;
  /** Stockfish Skill Level 0–20 for sub-1320 bots */
  skillLevel?: number;
  /** When true, enable UCI_LimitStrength + UCI_Elo */
  limitStrength?: boolean;
};

export type EvalOptions = {
  movetime?: number;
  depth?: number;
  multipv?: number;
};

/** Thrown by providers that only predict moves (e.g. Phase 6 ONNX bot). */
export class NotSupportedError extends Error {
  constructor(feature: string) {
    super(`NotSupported: ${feature}`);
    this.name = "NotSupportedError";
  }
}
