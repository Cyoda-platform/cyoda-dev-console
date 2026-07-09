// Bundle the MCP server into one self-contained ESM file so the published npm
// package needs no @cyoda/* workspace deps at runtime. `import.meta.url` and the
// entry-module guard both survive because format:esm is preserved.
import { build } from "esbuild";
import { rmSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(appDir, "dist", "index.js");

// Wipe stale output from the previous (per-file tsc) build so nothing extra ships.
rmSync(join(appDir, "dist"), { recursive: true, force: true });

await build({
  entryPoints: [join(appDir, "server", "index.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // No sourcemap in the published bundle: the .map embeds the original TS of the
  // inlined private (`0.0.0`) workspace packages, which we do not publish.
  sourcemap: false,
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});

// A shebang alone isn't runnable via `npx`/bin without the executable bit.
chmodSync(outfile, 0o755);
console.log(`bundled -> ${outfile}`);
