import { expect, test } from "@playwright/test";
import { openFixture } from "./helpers.js";

test("filters files and directories by name and relative path", async ({ page }) => {
  await openFixture(page);
  const filter = page.getByRole("searchbox", { name: "过滤文件或目录" });

  await filter.fill("nest/src/role");
  await expect(page.getByText("nest", { exact: true })).toBeVisible();
  await expect(page.getByText("src", { exact: true })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "role.enum.ts" })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "users.controller.ts" })).toHaveCount(0);

  await filter.fill("python");
  await expect(page.getByRole("treeitem", { name: "app.py" })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "models.py" })).toBeVisible();

  await filter.fill("missing-service");
  await expect(page.getByText("没有匹配的文件或目录")).toBeVisible();
  await page.getByRole("button", { name: "清空筛选" }).click();
  await expect(page.getByRole("treeitem", { name: "users.controller.ts" })).toBeVisible();
});
