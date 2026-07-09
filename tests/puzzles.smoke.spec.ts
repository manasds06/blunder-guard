import { test, expect } from "@playwright/test";

test("puzzles page loads and shows a board", async ({ page }) => {
  await page.goto("/puzzles");
  await expect(page.getByTestId("puzzle-rating")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("puzzle-status")).toBeVisible();
});
