import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodeFenPlanes, legalUcis, sampleMove } from "./onnx-bot";

describe("onnx-bot encoding", () => {
  it("encodes startpos to 8*8*17 floats", () => {
    const planes = encodeFenPlanes(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
    assert.equal(planes.length, 8 * 8 * 17);
    // White pawns on rank 2 → plane 0
    assert.equal(planes[0 * 64 + 6 * 8 + 0], 1);
    // Side to move white → plane 12 all ones
    assert.equal(planes[12 * 64], 1);
  });

  it("lists legal ucis from start", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const legal = legalUcis(fen);
    assert.ok(legal.includes("e2e4"));
    assert.ok(legal.length >= 20);
  });

  it("samples only legal moves", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const scores = new Map<string, number>([
      ["e2e4", 2],
      ["d2d4", 1],
      ["a2a3", 0],
    ]);
    const pick = sampleMove(fen, scores, 1);
    assert.ok(legalUcis(fen).includes(pick));
  });
});
