import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  webServer: process.env.CI
    ? {
        command: "npm run start -- -p 3100",
        url: "http://localhost:3100",
        reuseExistingServer: false,
        timeout: 60_000,
      }
    : undefined,
  use: {
    baseURL: process.env.SCENEVOX_TEST_URL ?? "http://localhost:3100",
    viewport: { width: 1440, height: 1100 },
    headless: true,
    launchOptions: {
      executablePath:
        process.env.SCENEVOX_CHROME_PATH ??
        (process.platform === "darwin"
          ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
          : undefined),
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        ...(process.env.SCENEVOX_TEST_AUDIO
          ? [
              `--use-file-for-fake-audio-capture=${process.env.SCENEVOX_TEST_AUDIO}%noloop`,
            ]
          : []),
      ],
    },
    permissions: ["clipboard-read", "clipboard-write"],
    screenshot: "only-on-failure",
  },
});
