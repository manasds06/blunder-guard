import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BOT_ELOS, getBotLevel, pickWeightedIndex } from "./botLevels";

describe("botLevels", () => {
  it("covers 400–2000 in 200 steps", () => {
    assert.deepEqual(BOT_ELOS, [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000]);
  });

  it("uses skill+multipv for sub-1320", () => {
    const low = getBotLevel(400);
    assert.equal(low.limitStrength, false);
    assert.equal(low.pickFromTop, 5);
    assert.equal(low.skillLevel, 0);
  });

  it("uses UCI_LimitStrength for 1400+", () => {
    const high = getBotLevel(1600);
    assert.equal(high.limitStrength, true);
    assert.equal(high.pickFromTop, 1);
    assert.equal(high.movetime, 800);
  });

  it("pickWeightedIndex stays in range", () => {
    for (let i = 0; i < 50; i++) {
      const idx = pickWeightedIndex(5);
      assert.ok(idx >= 0 && idx < 5);
    }
    assert.equal(pickWeightedIndex(1), 0);
  });
});
