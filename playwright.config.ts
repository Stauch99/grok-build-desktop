import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT || 1422);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.12, animations: "disabled" },
  },
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  ignoreSnapshots: !process.env.CI,
  use: {
    baseURL,
    trace: "off",
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: `npx vite --port ${port} --strictPort --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
