import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["server/**/*.test.ts"],
    exclude: ["e2e/**", "web/**", "node_modules/**", "dist/**"],
  },
});
