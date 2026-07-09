import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The MCP handshake identity name — stable, independent of the npm package name.
export const SERVER_NAME = "model-editor-mcp";

// Single source of truth = package.json `version`. Read at runtime so it is
// correct whether this runs bundled (dist/index.js -> ../package.json = the
// published package root, always shipped) or unbundled under vitest
// (server/version.ts -> ../package.json = the app manifest). We deliberately do
// NOT use an esbuild `define`: that would leave SERVER_VERSION undefined in
// every non-bundled execution path (vitest, tsx).
const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
export const SERVER_VERSION: string = JSON.parse(readFileSync(pkgPath, "utf8")).version;
