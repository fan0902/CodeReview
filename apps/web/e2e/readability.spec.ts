import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { openFixture } from "./helpers.js";

const screenshotRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../test-results/readability",
);

test.beforeAll(async () => {
  await mkdir(screenshotRoot, { recursive: true });
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
]) {
  test(`remains readable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openFixture(page);
    await page.getByRole("treeitem", { name: "users.controller.ts" }).click();

    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth).toBeLessThanOrEqual(viewport.width);
    const codeBox = await page.getByRole("main", { name: "代码阅读区" }).boundingBox();
    expect(codeBox?.width).toBeGreaterThanOrEqual(560);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus-visible")).toBeVisible();
    if (viewport.width === 1024) {
      const informationBox = await page
        .getByRole("complementary", { name: "工程信息" })
        .boundingBox();
      expect(informationBox?.width).toBeLessThanOrEqual(32);
    } else {
      await expect(page.getByText("GET", { exact: true }).last()).toBeVisible();
    }

    await page.emulateMedia({ colorScheme: "light" });
    await page.screenshot({
      path: path.join(screenshotRoot, `${viewport.width}x${viewport.height}-light.png`),
      fullPage: true,
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect
      .poll(async () =>
        page.locator(".monaco-editor-background").evaluate((element) => {
          const channels = getComputedStyle(element)
            .backgroundColor.match(/\d+/g)
            ?.slice(0, 3)
            .map(Number) ?? [255, 255, 255];
          return channels.reduce((total, channel) => total + channel, 0) / 3 < 80;
        }),
      )
      .toBe(true);
    await page.screenshot({
      path: path.join(screenshotRoot, `${viewport.width}x${viewport.height}-dark.png`),
      fullPage: true,
    });
  });
}
