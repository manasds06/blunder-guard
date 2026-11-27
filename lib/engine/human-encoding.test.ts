import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decodeMove,
  encodeBoard,
  legalMoves,
  moveIndex,
  pickMove,
  N_MOVES,
} from "./human-encoding";

type Case = {
  fen: string;
  on: number[];
  legal: number[];
  moves: Record<string, number>;
  top: Record<string, { index: number; logit: number }>;
};

// Written by ml/export_onnx.py from the PYTHON encoder the model was trained with.
const fixture: { cases: Case[] } = JSON.parse(
  readFileSync(join(process.cwd(), "lib/engine/__fixtures__/human-bot.json"), "utf8"),
);

describe("human-encoding matches the Python training encoder", () => {
  it("has fixture cases, including Black to move", () => {
    assert.ok(fixture.cases.length >= 10);
    assert.ok(fixture.cases.some((c) => c.fen.split(" ")[1] === "b"));
  });

  for (const c of fixture.cases) {
    it(`planes, legal ids and move ids: ${c.fen}`, () => {
      const planes = encodeBoard(c.fen);
      const on = [...planes.keys()].filter((i) => planes[i] === 1);
      assert.deepEqual(on, c.on);

      const legal = [...legalMoves(c.fen).keys()].sort((a, b) => a - b);
      assert.deepEqual(legal, c.legal);

      const turn = c.fen.split(" ")[1] as "w" | "b";
      for (const [uci, id] of Object.entries(c.moves)) {
        assert.equal(moveIndex(uci, turn), id, uci);
        // round trip (promotions decode without the piece letter)
        assert.equal(decodeMove(id, c.fen), uci.slice(0, 4), uci);
      }
    });
  }
});

describe("pickMove", () => {
  const start = fixture.cases[0]!.fen;

  it("never returns an illegal move, even when illegal logits are huge", () => {
    const logits = new Float32Array(N_MOVES).fill(50);
    const legal = new Set(legalMoves(start).values());
    for (let i = 0; i < 200; i++) assert.ok(legal.has(pickMove(start, logits)));
  });

  it("follows the distribution: a dominant move is picked, low temperature sharpens", () => {
    const logits = new Float32Array(N_MOVES);
    logits[moveIndex("e2e4", "w")] = 5;
    const seq = [0.001, 0.5, 0.999];
    let k = 0;
    const rng = () => seq[k++ % seq.length]!;
    assert.equal(pickMove(start, logits, 0.1, rng), "e2e4");
    assert.equal(pickMove(start, logits, 0.1, rng), "e2e4");
    assert.equal(pickMove(start, logits, 0.1, rng), "e2e4");
  });

  it("returns queen promotions with the piece letter", () => {
    const fen = "1r5k/P7/8/8/8/8/p7/1R5K w - - 0 1";
    const logits = new Float32Array(N_MOVES).fill(-50);
    logits[moveIndex("a7a8", "w")] = 10;
    assert.equal(pickMove(fen, logits, 0.1), "a7a8q");
  });
});
