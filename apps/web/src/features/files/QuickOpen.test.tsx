import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileTreeNode } from "../../api/client.js";
import { QuickOpen } from "./QuickOpen.js";

afterEach(cleanup);

describe("QuickOpen", () => {
  it("renders a bounded command-palette result list and opens a selected file", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const tree: FileTreeNode[] = Array.from({ length: 25 }, (_, index) => ({
      name: `file-${String(index).padStart(2, "0")}.py`,
      path: `python/deep/file-${String(index).padStart(2, "0")}.py`,
      type: "file",
    }));

    render(<QuickOpen tree={tree} onOpen={onOpen} />);
    await user.click(screen.getByRole("button", { name: /搜索文件/ }));

    const dialog = screen.getByRole("dialog", { name: "快速打开文件" });
    const results = within(dialog).getByRole("list");
    expect(dialog.classList.contains("quick-open")).toBe(true);
    expect(results.classList.contains("quick-open-results")).toBe(true);
    expect(within(results).getAllByRole("button")).toHaveLength(20);

    const first = within(results).getByRole("button", {
      name: "python/deep/file-00.py",
    });
    expect(first.classList.contains("quick-open-result")).toBe(true);
    expect(first.getAttribute("title")).toBe("python/deep/file-00.py");

    await user.click(first);
    expect(onOpen).toHaveBeenCalledWith("python/deep/file-00.py");
    expect(screen.queryByRole("dialog", { name: "快速打开文件" })).toBeNull();
  });

  it("keeps the close action visually distinct", async () => {
    const user = userEvent.setup();
    render(<QuickOpen tree={[]} onOpen={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /搜索文件/ }));

    const close = screen.getByRole("button", { name: "关闭" });
    expect(close.classList.contains("quick-open-close")).toBe(true);
    await user.click(close);
    expect(screen.queryByRole("dialog", { name: "快速打开文件" })).toBeNull();
  });
});
