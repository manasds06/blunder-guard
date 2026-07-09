/**
 * Full-game analysis types.
 * analyzeGame(pgn, onProgress) is the seam — a server implementation can
 * replace the client Stockfish sweep later without touching UI.
 */
import type { MistakeReport } from "@/lib/coach/detector";

export type AnalyzedMove = {
  ply: number;
  san: string;
  fenBefore: string;
  fenAfter: string;
  /** Eval after the move, from White's perspective (cp). Mates clamped. */
  evalCpWhite: number;
  classification?: MistakeReport["classification"];
  report?: MistakeReport;
  /** True if this ply was played by the "user" side being coached */
  isUserMove: boolean;
};

export type AnalysisResult = {
  moves: AnalyzedMove[];
  topMistakes: MistakeReport[];
  keyLesson?: string;
  /** 0–100 rough accuracy from average swing on user moves */
  accuracy: number;
  pgn: string;
};
