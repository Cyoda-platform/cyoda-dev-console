import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["server/**/*.test.ts", "web/src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    alias: [
      {
        find: /^monaco-editor(\/.*)?$/,
        replacement: fileURLToPath(new URL("./web/src/__tests__/stubs/monacoStub.ts", import.meta.url)),
      },
    ],
  },
});
