import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  optimizeDeps: { exclude: ["@cyoda/entity-model-viewer"] },
  envPrefix: ["VITE_", "TAURI_"],
  build: { target: "esnext", sourcemap: true, outDir: "dist" },
  test: {
    environment: "happy-dom",
    globals: true,
    css: false,
    server: {
      deps: {
        inline: [/@cyoda\/workflow-react/],
      },
    },
    alias: [
      {
        find: /^monaco-editor(\/.*)?$/,
        replacement: new URL("src/__tests__/stubs/monacoStub.ts", import.meta.url).pathname,
      },
    ],
  },
});
