import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expectedScore, updatePuzzleRating } from "./rating";

describe("puzzle rating", () => {
  it("expected is 0.5 when ratings equal", () => {
    assert.equal(expectedScore(600, 600), 0.5);
  });

  it("solve raises rating, fail lowers it", () => {
    assert.equal(updatePuzzleRating(600, 600, true), 616);
    assert.equal(updatePuzzleRating(600, 600, false), 584);
  });
});
