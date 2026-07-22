import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results/playwright",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:43123",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build -w apps/web && npx tsx apps/web/e2e/fixture-server.ts",
    cwd: path.resolve(webRoot, "../.."),
    url: "http://127.0.0.1:43123/api/health",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
