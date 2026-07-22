import { describe, expect, it } from "vitest";
import { parseServerOptions } from "./server-options.js";

describe("parseServerOptions", () => {
  it("accepts a loopback host, ephemeral port, and token", () => {
    expect(
      parseServerOptions([
        "--host",
        "127.0.0.1",
        "--port",
        "0",
        "--token",
        "secret",
      ]),
    ).toEqual({ host: "127.0.0.1", port: 0, token: "secret" });
  });

  it("rejects a non-loopback host", () => {
    expect(() =>
      parseServerOptions([
        "--host",
        "0.0.0.0",
        "--port",
        "43123",
        "--token",
        "secret",
      ]),
    ).toThrow(/127\.0\.0\.1/);
  });

  it("requires a session token", () => {
    expect(() => parseServerOptions(["--port", "0"])).toThrow(/token/i);
  });
});
