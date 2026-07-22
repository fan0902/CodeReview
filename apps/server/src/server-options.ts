export type ServerOptions = {
  host: "127.0.0.1";
  port: number;
  token: string;
};

export function parseServerOptions(arguments_: string[]): ServerOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid server argument near ${key ?? "end of input"}.`);
    }
    values.set(key.slice(2), value);
  }
  const host = values.get("host") ?? "127.0.0.1";
  if (host !== "127.0.0.1") {
    throw new Error("CR only listens on 127.0.0.1.");
  }
  const rawPort = values.get("port") ?? "0";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("The port must be an integer between 0 and 65535.");
  }
  const token = values.get("token");
  if (!token) throw new Error("A session token is required.");
  const known = new Set(["host", "port", "token"]);
  for (const key of values.keys()) {
    if (!known.has(key)) throw new Error(`Unknown server option --${key}.`);
  }
  return { host, port, token };
}
