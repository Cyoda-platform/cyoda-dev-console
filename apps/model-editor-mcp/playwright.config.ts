import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  use: { headless: true },
  reporter: [["list"]],
  timeout: 60_000,
});
