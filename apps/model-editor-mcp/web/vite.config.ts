import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react()],
  // sourcemap:false — the published web bundle otherwise ships .map files that expose
  // the source of private internal packages (console-design-system, workflow-editor-host).
  build: { outDir: resolve(here, "dist"), emptyOutDir: true, target: "esnext", sourcemap: false },
});
