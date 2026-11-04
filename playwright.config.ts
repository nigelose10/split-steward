import { defineConfig, devices } from "@playwright/test";

const port = 3000;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${port} --hostname 127.0.0.1`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      PAYPAL_MODE: "mock",
      AI_MODE: "mock",
      APP_URL: baseURL,
    },
  },
});
