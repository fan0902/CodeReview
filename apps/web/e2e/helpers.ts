import { expect, type Page } from "@playwright/test";

export async function openFixture(page: Page) {
  await page.goto("/?token=e2e-token");
  await page.getByRole("button", { name: "打开工程" }).click();
  await expect(
    page.getByLabel("当前工程").getByText("mixed-project", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "users.controller.ts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "索引就绪" })).toBeVisible();
}

export async function reopenFixture(page: Page) {
  await page.reload();
  await page
    .getByRole("button", { name: "重新打开 mixed-project" })
    .click();
  await expect(
    page.getByLabel("当前工程").getByText("mixed-project", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "索引就绪" })).toBeVisible();
}
