import { expect, test } from "@playwright/test";
import { openFixture, reopenFixture } from "./helpers.js";

test("opens code, jumps to a definition, inspects controllers, and restores an enum", async ({ page }) => {
  await openFixture(page);

  await page.keyboard.press("Meta+p");
  const quickOpen = page.getByRole("dialog", { name: "快速打开文件" });
  const quickResults = quickOpen.locator(".quick-open-results");
  await expect(quickOpen).toBeVisible();
  await expect(quickOpen).toHaveCSS("position", "fixed");
  await expect(quickResults).toHaveCSS("overflow-y", "auto");
  await expect(
    quickOpen.getByRole("button", { name: "nest/src/user.dto.ts" }),
  ).toHaveCSS("border-top-width", "0px");
  await quickOpen.getByRole("button", { name: "关闭" }).click();
  await expect(quickOpen).not.toBeVisible();

  await page.getByRole("treeitem", { name: "users.controller.ts" }).click();
  const sourceTab = page.getByRole("tab", { name: "users.controller.ts" });
  const returnTypeLine = page.locator(".view-line").filter({ hasText: "Promise<UserDto>" });
  const userDto = returnTypeLine.getByText("UserDto", { exact: true });

  await expect(userDto).toBeVisible();
  await page.keyboard.down("Meta");
  await userDto.hover();
  await page.waitForTimeout(250);
  await expect(sourceTab).toHaveAttribute("aria-selected", "true");
  await userDto.click();
  await page.keyboard.up("Meta");

  await expect(page.getByRole("tab", { name: "user.dto.ts" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.locator(".monaco-editor").click({ position: { x: 8, y: 8 } });
  await page.keyboard.press("Control+-");
  await expect(sourceTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Control+Shift+-");
  await expect(page.getByRole("tab", { name: "user.dto.ts" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("main", { name: "代码阅读区" })).toContainText(
    "export class UserDto",
  );

  await page.keyboard.press("Control+-");
  await expect(sourceTab).toHaveAttribute("aria-selected", "true");
  await userDto.click();
  await page.keyboard.press("F12");
  await expect(page.getByRole("tab", { name: "user.dto.ts" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.keyboard.press("Control+-");
  const controllerLine = page
    .locator(".view-line")
    .filter({ hasText: '@Controller("users")' });
  const unresolvedController = controllerLine.getByText("Controller", { exact: true });
  await unresolvedController.click({ modifiers: ["Meta"] });
  await expect(page.getByRole("status")).toHaveText(
    "未找到定义，可将光标置于符号上按 F12 重试",
  );
  await expect(sourceTab).toHaveAttribute("aria-selected", "true");

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
