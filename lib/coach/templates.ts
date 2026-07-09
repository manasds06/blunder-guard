/**
 * Template fallback explanations — used when offline, rate-limited, or LLM errors.
 * The UI never shows a raw API error.
 */
import type { MistakeReport } from "./detector";

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
  const best = report.bestMove || "the engine move";
  const swing = (Math.abs(report.swingCp) / 100).toFixed(1);

  switch (report.theme) {
    case "hung_piece":
      return `Your ${piece} after ${report.san} looks unsafe — the engine says this costs about ${swing} pawns. Blunder Check question 1: is my piece safe? Prefer ${best} next time, which keeps your material.`;
    case "missed_capture":
      return `You played ${report.san}, but there was a stronger capture/tactic: ${best}. Blunder Check question 2: are their pieces hanging? Look for free material before quiet moves.`;
    case "back_rank":
      return `${report.san} leaves back-rank trouble on the table. Give your king luft (a pawn move like h3/h6) so enemy heavy pieces can't mate on the home rank. Engine idea: ${best}.`;
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
