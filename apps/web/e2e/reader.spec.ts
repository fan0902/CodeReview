import { expect, test } from "@playwright/test";
import { openFixture, reopenFixture } from "./helpers.js";

test("opens code, jumps to a definition, inspects controllers, and restores an enum", async ({ page }) => {
  await openFixture(page);

  await page.getByRole("treeitem", { name: "users.controller.ts" }).click();
  const returnTypeLine = page.locator(".view-line").filter({ hasText: "Promise<UserDto>" });
  await returnTypeLine.getByText("UserDto", { exact: true }).click();
  await page.keyboard.press("F12");
  await expect(page.getByRole("tab", { name: "user.dto.ts" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("main", { name: "代码阅读区" })).toContainText(
    "export class UserDto",
  );

  await expect(page.getByText("/users/:id", { exact: true })).toBeVisible();
  await expect(page.getByText("id · path · string · 必填")).toBeVisible();
  await page.getByRole("tab", { name: "Enums" }).click();
  await page.getByRole("combobox", { name: "枚举类" }).fill("Role");
  await page
    .getByRole("option", { name: "Role · typescript · nest/src/role.enum.ts" })
    .click();
  await page.getByRole("button", { name: "保存枚举" }).click();
  await expect(page.getByText("Admin", { exact: true })).toBeVisible();

  await reopenFixture(page);
  await page.getByRole("tab", { name: "Enums" }).click();
  await expect(page.getByText("Admin", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "删除 Role" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByText("Admin", { exact: true })).not.toBeVisible();
});
