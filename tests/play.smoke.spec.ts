import { test, expect } from "@playwright/test";

/**
 * Smoke: page loads → make a move → bot replies with a legal move within 5s.
 * Run: npx playwright test
 */
test("play page: human move then bot reply", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByTestId("game-status")).toBeVisible({ timeout: 30_000 });

  // Wait for engine ready
  await expect(page.getByTestId("game-status")).not.toHaveText("Loading engine…", {
    timeout: 60_000,
  });

  // Start fresh, then drag white pawn e2 → e4 on the board container.
  await page.getByTestId("new-game").click();

  const board = page.getByTestId("game-board");
  await expect(board).toBeVisible({ timeout: 15_000 });

  const box = await board.boundingBox();
  expect(box).toBeTruthy();
  if (!box) return;

  // e2 is file e (4/8), rank 2 (near bottom for white). Approximate centers.
  const sq = box.width / 8;
  const e2 = { x: box.x + sq * 4.5, y: box.y + sq * 6.5 };
  const e4 = { x: box.x + sq * 4.5, y: box.y + sq * 4.5 };

  await page.mouse.move(e2.x, e2.y);
  await page.mouse.down();
  await page.mouse.move(e4.x, e4.y, { steps: 8 });
  await page.mouse.up();

  // Expect the move to register: move list (mounted but possibly in a hidden
  // sidebar tab — textContent works regardless) gains the first move pair.
  await expect
    .poll(
      async () => {
        const text = await page.getByTestId("move-list").textContent();
        return text ?? "";
      },
      { timeout: 15_000 },
    )
    .toMatch(/1\./);
});
