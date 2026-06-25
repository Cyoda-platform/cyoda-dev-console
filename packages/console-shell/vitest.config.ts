import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { include: ["src/**/*.test.{ts,tsx}"], environment: "happy-dom", globals: true, setupFiles: ["./src/__tests__/setup.ts"] },
});
