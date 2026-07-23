import { describe, expect, it, vi } from "vitest";
import { HeartbeatClock } from "./heartbeat.js";

describe("HeartbeatClock", () => {
  it("exits after fifteen minutes without a page heartbeat", () => {
    let now = 0;
    const onIdle = vi.fn();
    const clock = new HeartbeatClock({ idleMs: 15 * 60_000, now: () => now, onIdle });
    clock.beat("page-1");
    now += 14 * 60_000;
    clock.sweep();
    expect(onIdle).not.toHaveBeenCalled();
    now += 61_000;
    clock.sweep();
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it("does not exit while any page remains active", () => {
    let now = 0;
    const onIdle = vi.fn();
    const clock = new HeartbeatClock({ idleMs: 15 * 60_000, now: () => now, onIdle });
    clock.beat("old-page");
    now += 10 * 60_000;
    clock.beat("active-page");
    now += 6 * 60_000;
    clock.sweep();
    expect(onIdle).not.toHaveBeenCalled();
    expect(clock.activePages()).toEqual(["active-page"]);
  });

  it("refreshes only the most recently active connected page", () => {
    let now = 0;
    const clock = new HeartbeatClock({
      idleMs: 60_000,
      now: () => now,
      onIdle: vi.fn(),
    });
    const first = vi.fn();
    const second = vi.fn();
    clock.beat("page-1");
    const disconnectFirst = clock.connect("page-1", first);
    clock.beat("page-2");
    clock.connect("page-2", second);
    now += 1;
    clock.beat("page-1");

    expect(clock.refreshMostRecent()).toBe(true);
    expect(first).toHaveBeenCalledWith({ type: "reload" });
    expect(second).not.toHaveBeenCalled();
    disconnectFirst();
  });

  it("skips disconnected pages and reports when none remain", () => {
    const clock = new HeartbeatClock({
      idleMs: 60_000,
      now: () => 0,
      onIdle: vi.fn(),
    });
    const first = vi.fn();
    const second = vi.fn();
    clock.beat("page-1");
    const disconnectFirst = clock.connect("page-1", first);
    clock.beat("page-2");
    const disconnectSecond = clock.connect("page-2", second);
    disconnectSecond();

    expect(clock.refreshMostRecent()).toBe(true);
    expect(first).toHaveBeenCalledOnce();
    disconnectFirst();
    expect(clock.refreshMostRecent()).toBe(false);
  });
});
