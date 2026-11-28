import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifySwing } from "./detector";
import { templateExplanation } from "./templates";
import type { MistakeReport } from "./detector";
import type { Evaluation } from "@/lib/engine/types";

describe("classifySwing", () => {
  it("marks best when playedBest", () => {
    assert.equal(classifySwing(-500, true), "BEST");
  });
  it("thresholds blunder/mistake/inaccuracy", () => {
    assert.equal(classifySwing(-250, false), "BLUNDER");
    assert.equal(classifySwing(-150, false), "MISTAKE");
    assert.equal(classifySwing(-75, false), "INACCURACY");
    assert.equal(classifySwing(-10, false), "OK");
  });
});

describe("templateExplanation", () => {
  const baseEval: Evaluation = { bestLine: ["e2e4"], depth: 8, cp: 20 };
  const report: MistakeReport = {
    classification: "BLUNDER",
    swingCp: -400,
    theme: "hung_piece",
    bestMove: "e2e4",
    bestLine: ["e2e4"],
    evalBefore: baseEval,
    evalAfter: { ...baseEval, cp: -380 },
    san: "Qh5",
    fenBefore: "start",
    fenAfter: "after",
  };

  it("mentions Blunder Check for hung pieces", () => {
    const text = templateExplanation(report);
    assert.match(text, /Blunder Check/i);
    assert.match(text, /piece safe/i);
  });
});

// ── Regression: coach suggested impossible / nonsensical moves ─────────────
import { analyzeUserMove } from "./detector";
import type { EngineProvider } from "@/lib/engine/provider";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Fake engine: returns canned evaluations keyed by FEN. */
function fakeEngine(evals: Record<string, Evaluation>): EngineProvider {
  return {
    id: "fake",
    init: async () => undefined,
    getMove: async () => ({ uci: "" }),
    evaluate: async (fen: string) => {
      const ev = evals[fen];
      if (!ev) throw new Error(`no eval for ${fen}`);
      return ev;
    },
    dispose: () => undefined,
  } as unknown as EngineProvider;
}

describe("coach on ordinary good moves", () => {
  it("does not warn about the back rank after 1.e4", async () => {
    const after = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const engine = fakeEngine({
      [START]: { bestLine: ["e2e4", "e7e5"], depth: 12, cp: 30 },
      [after]: { bestLine: ["e7e5"], depth: 12, cp: -30 },
    });
    const report = await analyzeUserMove(engine, START, "e4");
    assert.equal(report.classification, "BEST");
    assert.equal(report.theme, "none");
    const text = templateExplanation(report);
    assert.doesNotMatch(text, /back[- ]rank|luft/i);
  });
});

describe("templates name moves the student can actually play", () => {
  const ev: Evaluation = { bestLine: ["g1f3"], depth: 12, cp: 20 };
  const base: MistakeReport = {
    classification: "MISTAKE",
    swingCp: -150,
    theme: "none",
    bestMove: "g1f3",
    bestLine: ["g1f3"],
    evalBefore: ev,
    evalAfter: { ...ev, cp: 130 },
    san: "f3",
    fenBefore: START,
    fenAfter: "rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1",
  };

  it("writes the best move in SAN, not UCI", () => {
    const text = templateExplanation(base);
    assert.match(text, /Nf3/);
    assert.doesNotMatch(text, /g1f3/);
  });

  it("only suggests luft for the mover's own colour", () => {
    const white = templateExplanation({ ...base, theme: "back_rank" });
    assert.doesNotMatch(white, /h6/);
    const blackFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    const black = templateExplanation({
      ...base, theme: "back_rank", fenBefore: blackFen, bestMove: "e7e5", bestLine: ["e7e5"], san: "f6",
    });
    assert.doesNotMatch(black, /h3/);
    assert.match(black, /e5/);
  });
});

describe("back-rank theme needs a real back-rank threat", () => {
  // White: Kg1, pawns f2 g2 h2, rook e1. Black: Kg8, rook a8. White plays Re1-e2?? leaving Ra1#.
  const before = "r5k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1";
  const after = "r5k1/5ppp/8/8/8/8/4RPPP/6K1 b - - 1 1";
  it("flags back_rank when the opponent now mates on the back rank", async () => {
    const engine = fakeEngine({
      [before]: { bestLine: ["h2h3"], depth: 12, cp: 0 },
      [after]: { bestLine: ["a8a1"], depth: 12, mate: 1 },
    });
    const report = await analyzeUserMove(engine, before, "Re2");
    assert.equal(report.classification, "BLUNDER");
    assert.equal(report.theme, "back_rank");
  });
});

describe("LLM output guard", () => {
  const ev: Evaluation = { bestLine: ["g1f3", "b8c6"], depth: 12, cp: 20 };
  const report: MistakeReport = {
    classification: "MISTAKE", swingCp: -150, theme: "none", bestMove: "g1f3",
    bestLine: ["g1f3", "b8c6"], evalBefore: ev, evalAfter: { ...ev, cp: 130 }, san: "f3",
    fenBefore: START,
    fenAfter: "rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1",
  };
  it("accepts moves from the engine line and the played move", async () => {
    const { inventedMoves } = await import("./templates");
    assert.deepEqual(inventedMoves("f3 weakens your king; Nf3 Nc6 was better.", report), []);
  });
  it("catches impossible moves", async () => {
    const { inventedMoves } = await import("./templates");
    assert.deepEqual(inventedMoves("Next time play Bxf7+ or Qh5.", report), ["Bxf7", "Qh5"]);
  });
});
