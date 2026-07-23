import { expect, test } from "@playwright/test";
import { openFixture, reopenFixture } from "./helpers.js";

test("resizes and restores the information panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFixture(page);
  const panel = page.getByRole("complementary", { name: "工程信息" });
  const separator = page.getByRole("separator", {
    name: "调整工程信息宽度",
  });
  const before = await panel.boundingBox();
  const handle = await separator.boundingBox();
  if (!before || !handle) {
    throw new Error("information panel is not measurable");
  }

  await page.mouse.move(handle.x + handle.width / 2, handle.y + 80);
  await page.mouse.down();
  await page.mouse.move(handle.x - 120, handle.y + 80);
  await page.mouse.up();

  const resized = await panel.boundingBox();
  expect(resized?.width).toBeGreaterThan(before.width + 100);

  await reopenFixture(page);
  await expect
    .poll(async () => (await panel.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before.width + 100);
});
