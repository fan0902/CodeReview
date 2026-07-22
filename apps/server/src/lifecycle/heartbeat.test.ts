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
});
