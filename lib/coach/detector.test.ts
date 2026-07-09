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
