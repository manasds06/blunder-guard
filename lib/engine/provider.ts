/**
 * EngineProvider — Strategy pattern.
 *
 * Why: every bot (Stockfish Elo levels, Phase 5 personalities, Phase 6 neural bot)
 * implements this one contract. UI components never import Stockfish/UCI directly —
 * they only call getMove/evaluate. Swapping engines = zero rewiring.
 */
import type { EngineMove, EvalOptions, Evaluation, MoveOptions } from "./types";

export interface EngineProvider {
  /** Stable id, e.g. "stockfish", "manas-bot" */
  readonly id: string;
  init(): Promise<void>;
  getMove(fen: string, opts: MoveOptions): Promise<EngineMove>;
  /** May throw NotSupportedError for move-only providers */
  evaluate(fen: string, opts: EvalOptions): Promise<Evaluation>;
  dispose(): void;
}
