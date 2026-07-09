import { Chess, type Square } from "chess.js";
import { LOCAL_PUZZLES } from "../lib/puzzles/bank";

for (const p of LOCAL_PUZZLES) {
  const c = new Chess(p.fen);
  let ok = true;
  for (const u of p.moves.split(/\s+/)) {
    try {
      c.move({
        from: u.slice(0, 2) as Square,
        to: u.slice(2, 4) as Square,
        promotion: u[4] as "q" | undefined,
      });
    } catch {
      ok = false;
      console.log("FAIL", p.id, u);
      break;
    }
  }
  if (ok) console.log("OK", p.id);
}
