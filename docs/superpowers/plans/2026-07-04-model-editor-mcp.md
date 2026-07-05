# Model Editor MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `apps/model-editor-mcp/` — a headless Node MCP server (stdio to Claude) that atomic-writes/validates Cyoda workflow files and serves a live, browser-rendered `@cyoda/workflow-react` editor (editor mode, no Monaco) over HTTP+SSE, so a developer watches and arranges the canvas while Claude drives content and layout.

**Architecture:** One long-lived Node process with two faces — north: MCP stdio JSON-RPC (`list_workflows`/`show_workflow`/`update_workflow`/`optimize_layout`/`validate_workflow`/`connection_info`); south: `127.0.0.1:<port>` HTTP serving `web/dist/` + an SSE `/events` stream (replay-on-connect) + a hardened `POST /layout` for human layout write-back. A `node:fs` recursive watch is the single SSE writer, so the browser reflects every disk writer (Claude's tools, the human's drags, the desktop app). Content is single-writer (Claude); layout is two-writer last-writer-wins.

**Tech Stack:** Node ≥22 (`node:fs`/`http`/`crypto`/`readline`/`util`); `@cyoda/workflow-core@0.4.0`, `@cyoda/workflow-graph@0.2.2`, `@cyoda/workflow-layout@0.1.3` (elkjs), `@cyoda/workflow-react@0.4.1`, `@cyoda/workflow-editor-host` (workspace), `@cyoda/workflow-file-indexer` (workspace), `@cyoda/agent-bridge-contract` (workspace, `McpResult` only), `@cyoda/console-design-system` (workspace, `ThemeProvider`); `react@19.2.7`, `react-dom@19.2.7`, `reactflow@11.11.4`, `zod@4.4.3`, `uuid@14.0.1`; build with `vite@8.1.2` + `@vitejs/plugin-react@6.0.3` + `typescript@6.0.3`; test with `vitest@4.1.9` (node env) + `@playwright/test@1.61.1` (headless Chromium).

## Global Constraints
- Workflows only in v1; entities/project-config are follow-ons (same tool shape, same server).
- Browser runs the real `@cyoda/workflow-react` editor in `mode:"editor"` (full UX, human-drag works) — **no change to `@cyoda/workflow-react`**; content read-only-ness is a convention enforced by warning.
- Content is single-writer = Claude (`update_workflow`, validated); browser content edits warn ("changes go through Claude"), they do not save and are not stripped.
- Layout is human-arrangeable and persists: node drags → `POST /layout` → server writes `.layout.json`; the browser never touches disk.
- `update_workflow` does validated whole-document writes (no PATCH) via `parseImportPayload`/`serializeImportPayload` + `validateAll`, returns a JSON diff (old→new); malformed Cyoda JSON never lands on disk (writes nothing on failure).
- Reuse `McpResult` from `@cyoda/agent-bridge-contract`; define our **own** stdio request shape (the contract's `McpToolInput` carries a webview `callId` with no stdio meaning — not reused).
- `POST /layout` is hardened: loopback Origin/Host only + `X-Session-Token` header + `workflow` name allowlisted against discovered workflows before it becomes a path.
- Deterministic port = `49152 + (fnv1a(absoluteProjectPath) mod 16384)`; on bind-in-use `GET /_id` detects a duplicate instance (same root → exit with the existing URL; hash collision → next free port).
- `files.ts` is a faithful TS port of `confined.rs`: canonicalize + root-prefix check + atomic temp-then-rename; the sandbox is a second layer.
- Crossing-count metric is deferred (not open): `optimize_layout` returns updated positions only; ELK returns no crossing count and v1 computes none — the human's eyes close the layout loop.

---

### Task 1: Scaffold `apps/model-editor-mcp/` + workspace wiring

**Files:**
- Create `apps/model-editor-mcp/package.json`
- Create `apps/model-editor-mcp/tsconfig.json`
- Create `apps/model-editor-mcp/tsconfig.build.json`
- Create `apps/model-editor-mcp/vitest.config.ts`
- Create `apps/model-editor-mcp/server/version.ts`
- Test `apps/model-editor-mcp/server/__tests__/version.test.ts`

**Interfaces:**
- Produces `export const SERVER_NAME = "model-editor-mcp"; export const SERVER_VERSION = "0.1.0";`

**Steps:**
- [ ] Write `apps/model-editor-mcp/package.json`:
  ```json
  {
    "name": "model-editor-mcp",
    "private": true,
    "type": "module",
    "scripts": {
      "build": "tsc -p tsconfig.build.json && vite build --config web/vite.config.ts",
      "typecheck": "tsc --noEmit",
      "test": "vitest run --passWithNoTests",
      "test:e2e": "playwright test"
    },
    "dependencies": {
      "@cyoda/agent-bridge-contract": "workspace:*",
      "@cyoda/console-design-system": "workspace:*",
      "@cyoda/workflow-core": "0.4.0",
      "@cyoda/workflow-editor-host": "workspace:*",
      "@cyoda/workflow-file-indexer": "workspace:*",
      "@cyoda/workflow-graph": "0.2.2",
      "@cyoda/workflow-layout": "0.1.3",
      "@cyoda/workflow-react": "0.4.1",
      "react": "catalog:",
      "react-dom": "catalog:",
      "reactflow": "catalog:",
      "uuid": "catalog:",
      "zod": "catalog:"
    },
    "devDependencies": {
      "@playwright/test": "catalog:",
      "@types/node": "catalog:",
      "@types/react": "catalog:",
      "@types/react-dom": "catalog:",
      "@vitejs/plugin-react": "catalog:",
      "typescript": "catalog:",
      "vite": "catalog:",
      "vitest": "catalog:"
    }
  }
  ```
- [ ] Write `apps/model-editor-mcp/tsconfig.json` (typecheck: server + web):
  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": { "noEmit": true, "types": ["node"] },
    "include": ["server", "web/src", "e2e"]
  }
  ```
- [ ] Write `apps/model-editor-mcp/tsconfig.build.json` (emit server → `dist/`; keep `.js` specifiers so Node ESM resolves at runtime):
  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "noEmit": false,
      "outDir": "dist",
      "rootDir": "server",
      "declaration": false,
      "sourceMap": true,
      "types": ["node"]
    },
    "include": ["server"],
    "exclude": ["server/__tests__"]
  }
  ```
- [ ] Write `apps/model-editor-mcp/vitest.config.ts`:
  ```ts
  import { defineConfig } from "vitest/config";

  export default defineConfig({
    test: {
      environment: "node",
      globals: true,
      include: ["server/**/*.test.ts"],
      exclude: ["e2e/**", "web/**", "node_modules/**", "dist/**"],
    },
  });
  ```
- [ ] Write the failing test `server/__tests__/version.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { SERVER_NAME, SERVER_VERSION } from "../version.js";

  describe("server identity", () => {
    it("advertises a stable name and semver version", () => {
      expect(SERVER_NAME).toBe("model-editor-mcp");
      expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/version.test.ts` → expect FAIL (module `../version.js` not found).
- [ ] Add `apps/model-editor-mcp` to the workspace: it is already matched by `pnpm-workspace.yaml`'s `apps/*`. Run `pnpm install` to link workspace deps.
- [ ] Write minimal impl `server/version.ts`:
  ```ts
  export const SERVER_NAME = "model-editor-mcp";
  export const SERVER_VERSION = "0.1.0";
  ```
- [ ] Run the test again → expect PASS.
- [ ] `git add apps/model-editor-mcp/package.json apps/model-editor-mcp/tsconfig.json apps/model-editor-mcp/tsconfig.build.json apps/model-editor-mcp/vitest.config.ts apps/model-editor-mcp/server/version.ts apps/model-editor-mcp/server/__tests__/version.test.ts pnpm-lock.yaml && git commit -m "feat(model-editor-mcp): scaffold app package + workspace wiring"`

---

### Task 2: `server/files.ts` — confined read/write/atomic (port of `confined.rs`)

**Files:**
- Create `apps/model-editor-mcp/server/files.ts`
- Test `apps/model-editor-mcp/server/__tests__/files.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export class ConfinementError extends Error {}
  export interface ReadResult { path: string; contents: string; lastModified: string; sizeBytes: number }
  export interface WriteResult { path: string; lastModified: string; sizeBytes: number }
  export function resolveInsideRoot(root: string, relativePath: string): Promise<string>;
  export function readConfined(root: string, relativePath: string): Promise<ReadResult>;
  export function writeConfined(root: string, relativePath: string, contents: string): Promise<WriteResult>;
  ```

**Steps:**
- [ ] Write the failing test `server/__tests__/files.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { mkdtemp, rm, mkdir, writeFile, readFile, symlink } from "node:fs/promises";
  import { tmpdir } from "node:os";
  import { join } from "node:path";
  import { ConfinementError, readConfined, writeConfined } from "../files.js";

  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "mem-files-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  describe("readConfined", () => {
    it("reads a file inside the root and reports mtime + size", async () => {
      await writeFile(join(root, "w.json"), "{}");
      const r = await readConfined(root, "w.json");
      expect(r.contents).toBe("{}");
      expect(r.sizeBytes).toBe(2);
      expect(typeof r.lastModified).toBe("string");
    });
    it("rejects a traversal path", async () => {
      await expect(readConfined(root, "../etc/passwd")).rejects.toBeInstanceOf(ConfinementError);
    });
    it("rejects an absolute path", async () => {
      await expect(readConfined(root, "/etc/passwd")).rejects.toBeInstanceOf(ConfinementError);
    });
  });

  describe("writeConfined", () => {
    it("atomically writes a file, creating intermediate dirs", async () => {
      const res = await writeConfined(root, "flows/w.json", '{"a":1}');
      expect(await readFile(join(root, "flows/w.json"), "utf8")).toBe('{"a":1}');
      expect(res.sizeBytes).toBe(7);
    });
    it("leaves no .tmp file behind after a successful write", async () => {
      await writeConfined(root, "w.json", "{}");
      const { readdir } = await import("node:fs/promises");
      const names = await readdir(root);
      expect(names.filter((n) => n.endsWith(".tmp"))).toHaveLength(0);
      expect(names).toContain("w.json");
    });
    it("rejects a traversal path without writing", async () => {
      await expect(writeConfined(root, "../evil.json", "{}")).rejects.toBeInstanceOf(ConfinementError);
    });
    it("rejects a write whose parent symlinks outside the root", async () => {
      const outside = await mkdtemp(join(tmpdir(), "mem-out-"));
      await mkdir(join(root, "sub"), { recursive: true });
      await rm(join(root, "sub"), { recursive: true, force: true });
      await symlink(outside, join(root, "sub"));
      await expect(writeConfined(root, "sub/evil.json", "{}")).rejects.toBeInstanceOf(ConfinementError);
      await rm(outside, { recursive: true, force: true });
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/files.test.ts` → expect FAIL.
- [ ] Write `server/files.ts`:
  ```ts
  import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
  import { basename, dirname, isAbsolute, join, sep } from "node:path";
  import { randomBytes } from "node:crypto";

  /** Thrown when a relative path escapes, or resolves outside, the project root. */
  export class ConfinementError extends Error {}

  export interface ReadResult { path: string; contents: string; lastModified: string; sizeBytes: number }
  export interface WriteResult { path: string; lastModified: string; sizeBytes: number }

  /** Reject absolute paths and any `..` segment before touching the filesystem. */
  function assertRelative(relativePath: string): void {
    if (isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) {
      throw new ConfinementError(`path escapes project root: "${relativePath}"`);
    }
  }

  function isInside(candidate: string, rootReal: string): boolean {
    return candidate === rootReal || candidate.startsWith(rootReal + sep);
  }

  /**
   * Resolve an *existing* `relativePath` inside `root`. Canonicalises both root
   * and candidate (following symlinks) and requires the candidate to equal or
   * descend from the canonical root — the TS analogue of `resolve_confined`.
   */
  export async function resolveInsideRoot(root: string, relativePath: string): Promise<string> {
    assertRelative(relativePath);
    const rootReal = await realpath(root);
    const candidateReal = await realpath(join(rootReal, relativePath)).catch((e: unknown) => {
      throw new ConfinementError(`cannot resolve "${relativePath}": ${(e as Error).message}`);
    });
    if (!isInside(candidateReal, rootReal)) throw new ConfinementError("path outside project root");
    return candidateReal;
  }

  export async function readConfined(root: string, relativePath: string): Promise<ReadResult> {
    const abs = await resolveInsideRoot(root, relativePath);
    const contents = await readFile(abs, "utf8");
    const st = await stat(abs);
    return { path: abs, contents, lastModified: st.mtime.toISOString(), sizeBytes: st.size };
  }

  /**
   * Write `contents` to `relativePath` inside `root`, atomically and confined.
   * Faithful port of `write_confined`: create intermediate dirs, re-canonicalise
   * the parent after creation (defends against a symlinked parent), then temp +
   * rename into the *canonical* parent to close the TOCTOU window.
   */
  export async function writeConfined(root: string, relativePath: string, contents: string): Promise<WriteResult> {
    assertRelative(relativePath);
    const rootReal = await realpath(root);
    const target = join(rootReal, relativePath);
    const parent = dirname(target);
    await mkdir(parent, { recursive: true });
    const parentReal = await realpath(parent);
    if (!isInside(parentReal, rootReal)) throw new ConfinementError("path outside project root");
    const finalTarget = join(parentReal, basename(target));
    const tmp = join(parentReal, `.${basename(target)}.${randomBytes(6).toString("hex")}.tmp`);
    await writeFile(tmp, contents, { encoding: "utf8", mode: 0o600 });
    await rename(tmp, finalTarget);
    const st = await stat(finalTarget);
    return { path: finalTarget, lastModified: st.mtime.toISOString(), sizeBytes: st.size };
  }
  ```
- [ ] Run the test again → expect PASS.
- [ ] `git add apps/model-editor-mcp/server/files.ts apps/model-editor-mcp/server/__tests__/files.test.ts && git commit -m "feat(model-editor-mcp): confined atomic file layer (port of confined.rs)"`

---

### Task 3: `server/glob.ts` + `server/discovery.ts` — workflow discovery (`node:fs` + file-indexer)

**Files:**
- Create `apps/model-editor-mcp/server/glob.ts` (verbatim salvage)
- Create `apps/model-editor-mcp/server/discovery.ts`
- Test `apps/model-editor-mcp/server/__tests__/glob.test.ts` (verbatim salvage)
- Test `apps/model-editor-mcp/server/__tests__/discovery.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function matchGlob(relativePath: string, pattern: string): boolean;                 // glob.ts
  export function discoverWorkflows(root: string, workflowGlobs: string[]): Promise<WorkflowFileIndexEntry[]>;
  export function findByName(entries: WorkflowFileIndexEntry[], name: string): WorkflowFileIndexEntry | undefined;
  ```
- Consumes `classifyWorkflowFile`, `WORKFLOW_STATUSES`, `WorkflowFileIndexEntry` from `@cyoda/workflow-file-indexer`; `readConfined` from `./files.js`.

**Steps:**
- [ ] Create `server/glob.ts` — copy verbatim from the parked `mcp/glob.ts`:
  ```ts
  export function matchGlob(relativePath: string, pattern: string): boolean {
    return globToRegExp(pattern).test(relativePath);
  }

  const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/;

  function globToRegExp(pattern: string): RegExp {
    let source = "";
    let i = 0;
    const n = pattern.length;
    while (i < n) {
      if (pattern.charAt(i) === "*" && pattern.charAt(i + 1) === "*") {
        if (pattern.charAt(i + 2) === "/") { source += "(?:.*/)?"; i += 3; } else { source += ".*"; i += 2; }
        continue;
      }
      const c = pattern.charAt(i);
      if (c === "*") source += "[^/]*";
      else if (REGEXP_SPECIALS.test(c)) source += `\\${c}`;
      else source += c;
      i += 1;
    }
    return new RegExp(`^${source}$`);
  }
  ```
- [ ] Create `server/__tests__/glob.test.ts` — copy verbatim from the parked `glob.test.ts` (imports adjusted to `../glob.js`):
  ```ts
  import { describe, it, expect } from "vitest";
  import { matchGlob } from "../glob.js";

  describe("matchGlob", () => {
    it("matches a top-level file against the default entityGlobs pattern", () => {
      expect(matchGlob("order.json", "**/*.json")).toBe(true);
    });
    it("matches a nested file against **/*.json", () => {
      expect(matchGlob("entities/order.json", "**/*.json")).toBe(true);
    });
    it("matches a deeply nested file against **/*.json", () => {
      expect(matchGlob("a/b/c/order.json", "**/*.json")).toBe(true);
    });
    it("rejects a non-matching extension", () => {
      expect(matchGlob("order.txt", "**/*.json")).toBe(false);
    });
    it("a single * does not cross a path-segment boundary", () => {
      expect(matchGlob("entities/order.json", "*.json")).toBe(false);
      expect(matchGlob("order.json", "*.json")).toBe(true);
    });
    it("matches literal path segments exactly", () => {
      expect(matchGlob("entities/order.json", "entities/*.json")).toBe(true);
      expect(matchGlob("other/order.json", "entities/*.json")).toBe(false);
    });
    it("escapes regex-special characters in the pattern", () => {
      expect(matchGlob("a.b.json", "a.b.json")).toBe(true);
      expect(matchGlob("aXb.json", "a.b.json")).toBe(false);
    });
    it("rejects a path that is only a prefix/suffix match, not a full match", () => {
      expect(matchGlob("entities/order.json.bak", "**/*.json")).toBe(false);
      expect(matchGlob("not-entities/order.json", "entities/*.json")).toBe(false);
    });
    it("an empty pattern only matches an empty path", () => {
      expect(matchGlob("", "")).toBe(true);
      expect(matchGlob("order.json", "")).toBe(false);
    });
  });
  ```
- [ ] Write the failing `server/__tests__/discovery.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
  import { tmpdir } from "node:os";
  import { join } from "node:path";
  import { discoverWorkflows, findByName } from "../discovery.js";

  const PLEDGE = JSON.stringify({
    importMode: "MERGE",
    workflows: [{ version: "1", name: "Pledge", initialState: "none", active: true,
      states: { none: { transitions: [{ name: "create", next: "created", manual: false, disabled: false }] }, created: { transitions: [] } } }],
  });

  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "mem-disc-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  describe("discoverWorkflows", () => {
    it("classifies and returns only workflow-status JSON, excluding sidecars and node_modules", async () => {
      await writeFile(join(root, "Pledge.json"), PLEDGE);
      await writeFile(join(root, "Pledge.layout.json"), "{}");
      await mkdir(join(root, "node_modules/x"), { recursive: true });
      await writeFile(join(root, "node_modules/x/w.json"), PLEDGE);
      const entries = await discoverWorkflows(root, ["**/*.json"]);
      expect(entries.map((e) => e.relativePath)).toEqual(["Pledge.json"]);
      expect(entries[0]!.status).toBe("valid-workflow");
      expect(entries[0]!.workflows[0]!.name).toBe("Pledge");
    });
    it("honours workflowGlobs scoping", async () => {
      await mkdir(join(root, "flows"), { recursive: true });
      await writeFile(join(root, "flows/Pledge.json"), PLEDGE);
      await writeFile(join(root, "other.json"), PLEDGE);
      const entries = await discoverWorkflows(root, ["flows/**/*.json"]);
      expect(entries.map((e) => e.relativePath)).toEqual(["flows/Pledge.json"]);
    });
  });

  describe("findByName", () => {
    it("matches by declared workflow name, then falls back to file basename", async () => {
      await writeFile(join(root, "Pledge.json"), PLEDGE);
      const entries = await discoverWorkflows(root, ["**/*.json"]);
      expect(findByName(entries, "Pledge")?.relativePath).toBe("Pledge.json");
      expect(findByName(entries, "nope")).toBeUndefined();
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/discovery.test.ts` → expect FAIL.
- [ ] Write `server/discovery.ts`:
  ```ts
  import { readdir } from "node:fs/promises";
  import { join, relative, sep } from "node:path";
  import { classifyWorkflowFile, WORKFLOW_STATUSES } from "@cyoda/workflow-file-indexer";
  import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
  import { matchGlob } from "./glob.js";
  import { readConfined } from "./files.js";

  const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "target", ".model-editor"]);

  async function* walk(dir: string): AsyncGenerator<string> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) { if (!EXCLUDED_DIRS.has(e.name)) yield* walk(abs); }
      else if (e.isFile()) yield abs;
    }
  }

  /** Enumerate the project with `node:fs`, scope by `workflowGlobs`, classify with the
   *  file-indexer, and keep only workflow-status files (sidecars excluded). */
  export async function discoverWorkflows(root: string, workflowGlobs: string[]): Promise<WorkflowFileIndexEntry[]> {
    const out: WorkflowFileIndexEntry[] = [];
    for await (const abs of walk(root)) {
      const rel = relative(root, abs).split(sep).join("/");
      if (!rel.endsWith(".json") || rel.endsWith(".layout.json")) continue;
      if (workflowGlobs.length > 0 && !workflowGlobs.some((g) => matchGlob(rel, g))) continue;
      const { contents, lastModified, sizeBytes } = await readConfined(root, rel);
      const entry = classifyWorkflowFile({ path: abs, relativePath: rel, contents, lastModified, sizeBytes });
      if (WORKFLOW_STATUSES.includes(entry.status)) out.push(entry);
    }
    out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return out;
  }

  /** Resolve a workflow by declared name first, then by file basename (`Foo.json` → `Foo`). */
  export function findByName(entries: WorkflowFileIndexEntry[], name: string): WorkflowFileIndexEntry | undefined {
    return (
      entries.find((e) => e.workflows.some((w) => w.name === name)) ??
      entries.find((e) => e.relativePath.replace(/\.json$/, "").split("/").pop() === name)
    );
  }
  ```
- [ ] Run both tests → expect PASS.
- [ ] `git add apps/model-editor-mcp/server/glob.ts apps/model-editor-mcp/server/discovery.ts apps/model-editor-mcp/server/__tests__/glob.test.ts apps/model-editor-mcp/server/__tests__/discovery.test.ts && git commit -m "feat(model-editor-mcp): fs-based workflow discovery + salvaged glob"`

---

### Task 4: `server/envelope.ts` + `server/dispatch.ts` + `server/diff.ts` + `server/schemas.ts` (+ ported tests)

**Files:**
- Create `apps/model-editor-mcp/server/envelope.ts` (verbatim salvage)
- Create `apps/model-editor-mcp/server/dispatch.ts` (verbatim salvage)
- Create `apps/model-editor-mcp/server/diff.ts` (verbatim salvage)
- Create `apps/model-editor-mcp/server/schemas.ts` (v1 name-based subset + new tool schemas)
- Test `apps/model-editor-mcp/server/__tests__/dispatch.test.ts` (verbatim salvage)
- Test `apps/model-editor-mcp/server/__tests__/diff.test.ts` (verbatim salvage)
- Test `apps/model-editor-mcp/server/__tests__/schemas.test.ts` (rewritten for v1 schemas)

**Interfaces:**
- Produces:
  ```ts
  // envelope.ts
  export type { McpResult };
  export type ToolHandler = (args: unknown) => Promise<McpResult>;
  export function ok(data: unknown): McpResult;
  export function err(code: string, message: string): McpResult;
  export function isMcpResult(value: unknown): value is McpResult;
  // dispatch.ts
  export type Dispatch = (name: string, args: unknown) => Promise<McpResult>;
  export function makeDispatcher(map: Record<string, ToolHandler>): Dispatch;
  // diff.ts
  export interface JsonPatchOp { op: "add" | "remove" | "replace"; path: string; value?: unknown }
  export function jsonDiff(before: unknown, after: unknown): JsonPatchOp[];
  // schemas.ts (all zod .strict())
  export const listWorkflowsInput, showWorkflowInput, updateWorkflowInput, optimizeLayoutInput, validateWorkflowInput, connectionInfoInput, layoutPostBody;
  ```

**Steps:**
- [ ] Create `server/envelope.ts` — copy verbatim from parked `mcp/envelope.ts`:
  ```ts
  import type { McpResult } from "@cyoda/agent-bridge-contract";
  export type { McpResult };
  export type ToolHandler = (args: unknown) => Promise<McpResult>;
  export function ok(data: unknown): McpResult {
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
  }
  export function err(code: string, message: string): McpResult {
    return { content: [{ type: "text", text: `${code}: ${message}` }], isError: true };
  }
  export function isMcpResult(value: unknown): value is McpResult {
    return typeof value === "object" && value !== null && Array.isArray((value as { content?: unknown }).content);
  }
  ```
- [ ] Create `server/dispatch.ts` — copy verbatim from parked `mcp/dispatch.ts`:
  ```ts
  import { err, isMcpResult } from "./envelope.js";
  import type { McpResult, ToolHandler } from "./envelope.js";

  export type Dispatch = (name: string, args: unknown) => Promise<McpResult>;

  export function makeDispatcher(map: Record<string, ToolHandler>): Dispatch {
    return async (name, args) => {
      const handler = map[name];
      if (!handler) return err("UNKNOWN_TOOL", `no tool registered for "${name}"`);
      try {
        return await handler(args);
      } catch (thrown) {
        if (isMcpResult(thrown)) return thrown;
        const message = thrown instanceof Error ? thrown.message : String(thrown);
        return err("INTERNAL_ERROR", message);
      }
    };
  }
  ```
- [ ] Create `server/diff.ts` — copy verbatim from parked `mcp/diff.ts` (the full `jsonDiff` + `diffAt`/`diffObjects`/`diffArrays`/`isPlainObject`/`deepEqual`/`escapePointerToken` implementation).
- [ ] Create `server/__tests__/dispatch.test.ts` — copy verbatim from parked `dispatch.test.ts` (imports `../envelope.js`, `../dispatch.js`).
- [ ] Create `server/__tests__/diff.test.ts` — copy verbatim from parked `diff.test.ts` (imports `../diff.js`).
- [ ] Write the failing `server/__tests__/schemas.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import {
    listWorkflowsInput, showWorkflowInput, updateWorkflowInput,
    optimizeLayoutInput, validateWorkflowInput, connectionInfoInput, layoutPostBody,
  } from "../schemas.js";

  describe("listWorkflowsInput / connectionInfoInput", () => {
    it("accept the empty object and reject unknown props", () => {
      expect(listWorkflowsInput.safeParse({}).success).toBe(true);
      expect(connectionInfoInput.safeParse({}).success).toBe(true);
      expect(listWorkflowsInput.safeParse({ x: 1 }).success).toBe(false);
    });
  });

  describe("showWorkflowInput / validateWorkflowInput", () => {
    it("require a non-empty name", () => {
      expect(showWorkflowInput.safeParse({ name: "Pledge" }).success).toBe(true);
      expect(validateWorkflowInput.safeParse({ name: "Pledge" }).success).toBe(true);
      expect(showWorkflowInput.safeParse({ name: "" }).success).toBe(false);
      expect(showWorkflowInput.safeParse({}).success).toBe(false);
      expect(showWorkflowInput.safeParse({ name: "P", extra: 1 }).success).toBe(false);
    });
  });

  describe("updateWorkflowInput", () => {
    it("requires name + content (string), no JSON validation here", () => {
      expect(updateWorkflowInput.safeParse({ name: "P", content: "{not json" }).success).toBe(true);
      expect(updateWorkflowInput.safeParse({ name: "P" }).success).toBe(false);
      expect(updateWorkflowInput.safeParse({ content: "{}" }).success).toBe(false);
    });
  });

  describe("optimizeLayoutInput", () => {
    it("accepts name alone and a full options object", () => {
      expect(optimizeLayoutInput.safeParse({ name: "P" }).success).toBe(true);
      const ok = optimizeLayoutInput.safeParse({
        name: "P",
        options: { orientation: "horizontal", preset: "opsAudit", nodeSize: { width: 160, height: 72 }, pinned: [{ id: "s1", x: 0, y: 0 }] },
      });
      expect(ok.success).toBe(true);
    });
    it("rejects unknown option keys (no `direction`, no `spacing`)", () => {
      expect(optimizeLayoutInput.safeParse({ name: "P", options: { direction: "TB" } }).success).toBe(false);
      expect(optimizeLayoutInput.safeParse({ name: "P", options: { spacing: 20 } }).success).toBe(false);
    });
  });

  describe("layoutPostBody", () => {
    it("accepts { name, workflowUi } and rejects a missing workflowUi", () => {
      expect(layoutPostBody.safeParse({ name: "P", workflowUi: { P: { layout: { nodes: {} } } } }).success).toBe(true);
      expect(layoutPostBody.safeParse({ name: "P" }).success).toBe(false);
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/schemas.test.ts server/__tests__/diff.test.ts server/__tests__/dispatch.test.ts` → expect FAIL (schemas missing).
- [ ] Write `server/schemas.ts`:
  ```ts
  import { z } from "zod";

  /** `list_workflows` / `connection_info` — no input. */
  export const listWorkflowsInput = z.object({}).strict();
  export const connectionInfoInput = z.object({}).strict();

  /** `show_workflow` / `validate_workflow` — workflow name (declared name or file basename). */
  export const showWorkflowInput = z.object({ name: z.string().min(1) }).strict();
  export const validateWorkflowInput = z.object({ name: z.string().min(1) }).strict();

  /** `update_workflow` — name + whole-document JSON string (JSON validity is the handler's job). */
  export const updateWorkflowInput = z.object({ name: z.string().min(1), content: z.string() }).strict();

  /** Real `PinnedNode` from `@cyoda/workflow-layout` — explicit coordinates only. */
  const pinnedNode = z.object({ id: z.string(), x: z.number(), y: z.number() }).strict();

  /**
   * `optimize_layout` — `options` map 1:1 onto the real `LayoutOptions`
   * (`@cyoda/workflow-layout@0.1.3`): orientation | preset | nodeSize | pinned.
   * There is deliberately NO `direction` and NO `spacing`.
   */
  export const optimizeLayoutInput = z
    .object({
      name: z.string().min(1),
      options: z
        .object({
          orientation: z.enum(["vertical", "horizontal"]).optional(),
          preset: z.enum(["websiteCompact", "configuratorReadable", "opsAudit"]).optional(),
          nodeSize: z.object({ width: z.number(), height: z.number() }).strict().optional(),
          pinned: z.array(pinnedNode).optional(),
        })
        .strict()
        .optional(),
    })
    .strict();

  /** `POST /layout` body — the human's debounced layout write-back. */
  export const layoutPostBody = z
    .object({ name: z.string().min(1), workflowUi: z.record(z.string(), z.unknown()) })
    .strict();

  export type ListWorkflowsInput = z.infer<typeof listWorkflowsInput>;
  export type ShowWorkflowInput = z.infer<typeof showWorkflowInput>;
  export type UpdateWorkflowInput = z.infer<typeof updateWorkflowInput>;
  export type OptimizeLayoutInput = z.infer<typeof optimizeLayoutInput>;
  export type ValidateWorkflowInput = z.infer<typeof validateWorkflowInput>;
  export type LayoutPostBody = z.infer<typeof layoutPostBody>;
  ```
- [ ] Run the three tests → expect PASS.
- [ ] `git add apps/model-editor-mcp/server/envelope.ts apps/model-editor-mcp/server/dispatch.ts apps/model-editor-mcp/server/diff.ts apps/model-editor-mcp/server/schemas.ts apps/model-editor-mcp/server/__tests__/dispatch.test.ts apps/model-editor-mcp/server/__tests__/diff.test.ts apps/model-editor-mcp/server/__tests__/schemas.test.ts && git commit -m "feat(model-editor-mcp): salvaged envelope/dispatch/diff + v1 name-based schemas"`

---

### Task 5: `server/context.ts` + `server/layout.ts` (`mergeLayout` salvage + `remapLayoutUuids` port)

**Files:**
- Create `apps/model-editor-mcp/server/context.ts` (shared `ToolContext`)
- Create `apps/model-editor-mcp/server/layout.ts` (`mergeLayout` salvage + `remapLayoutUuids` port + `loadRemappedLayout`)
- Test `apps/model-editor-mcp/server/__tests__/layout.test.ts` (mergeLayout salvage + remapLayoutUuids new)

**Interfaces:**
- Produces:
  ```ts
  // context.ts
  export interface ToolContext {
    root: string; workflowGlobs: string[]; connectionUrl: string;
    read(rel: string): Promise<{ contents: string; lastModified: string; sizeBytes: number }>;
    write(rel: string, contents: string): Promise<{ path: string; lastModified: string; sizeBytes: number }>;
    discover(): Promise<WorkflowFileIndexEntry[]>;
    parseImport: typeof parseImportPayload;
    serializeImport: typeof serializeImportPayload;
    validate: typeof validateAll;
  }
  export function createToolContext(opts: { root: string; workflowGlobs: string[]; connectionUrl: string }): ToolContext;
  // layout.ts
  export function mergeLayout(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown>;
  export function remapLayoutUuids(workflowUi: Record<string, WorkflowUiMeta>, oldIds: Record<string, TransitionPointer>, newIds: Record<string, TransitionPointer>): Record<string, WorkflowUiMeta>;
  export function loadRemappedLayout(ctx: ToolContext, workflowRel: string, currentIds: Record<string, TransitionPointer>): Promise<Record<string, WorkflowUiMeta>>;
  ```

**Steps:**
- [ ] Write `server/context.ts`:
  ```ts
  import { parseImportPayload, serializeImportPayload, validateAll } from "@cyoda/workflow-core";
  import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
  import { readConfined, writeConfined } from "./files.js";
  import { discoverWorkflows } from "./discovery.js";

  export interface ToolContext {
    root: string;
    workflowGlobs: string[];
    connectionUrl: string;
    read(rel: string): Promise<{ contents: string; lastModified: string; sizeBytes: number }>;
    write(rel: string, contents: string): Promise<{ path: string; lastModified: string; sizeBytes: number }>;
    discover(): Promise<WorkflowFileIndexEntry[]>;
    parseImport: typeof parseImportPayload;
    serializeImport: typeof serializeImportPayload;
    validate: typeof validateAll;
  }

  export function createToolContext(opts: { root: string; workflowGlobs: string[]; connectionUrl: string }): ToolContext {
    return {
      root: opts.root,
      workflowGlobs: opts.workflowGlobs,
      connectionUrl: opts.connectionUrl,
      read: (rel) => readConfined(opts.root, rel).then((r) => ({ contents: r.contents, lastModified: r.lastModified, sizeBytes: r.sizeBytes })),
      write: (rel, c) => writeConfined(opts.root, rel, c),
      discover: () => discoverWorkflows(opts.root, opts.workflowGlobs),
      parseImport: parseImportPayload,
      serializeImport: serializeImportPayload,
      validate: validateAll,
    };
  }
  ```
- [ ] Write the failing `server/__tests__/layout.test.ts` (mergeLayout cases salvaged verbatim from the parked `layout.test.ts` `describe("mergeLayout")` block, plus new `remapLayoutUuids` cases):
  ```ts
  import { describe, it, expect } from "vitest";
  import { mergeLayout, remapLayoutUuids } from "../layout.js";

  describe("mergeLayout", () => {
    it("overwrites only layout.nodes, preserving everything else", () => {
      const existing = {
        _transitionIds: { u1: { workflow: "wf", state: "A" } },
        wf: { layout: { nodes: { A: { x: 1, y: 1 } } }, transitionPositions: { u1: { x: 9, y: 9 } }, collapsedStates: ["Z"], comments: [{ id: "c1" }], viewPreset: "compact" },
      };
      const incoming = { wf: { layout: { nodes: { A: { x: 5, y: 5 }, B: { x: 6, y: 6 } } } } };
      const out = mergeLayout(existing, incoming) as typeof existing;
      expect(out.wf.layout.nodes).toEqual({ A: { x: 5, y: 5 }, B: { x: 6, y: 6 } });
      expect(out.wf.transitionPositions).toEqual({ u1: { x: 9, y: 9 } });
      expect(out.wf.collapsedStates).toEqual(["Z"]);
      expect(out.wf.comments).toEqual([{ id: "c1" }]);
      expect(out.wf.viewPreset).toEqual("compact");
      expect(out._transitionIds).toEqual(existing._transitionIds);
    });
    it("creates a fresh workflow entry when the workflow is new", () => {
      const out = mergeLayout({ _transitionIds: {} }, { wf: { layout: { nodes: { A: { x: 1, y: 2 } } } } }) as { wf: { layout: { nodes: unknown } } };
      expect(out.wf.layout.nodes).toEqual({ A: { x: 1, y: 2 } });
    });
    it("never lets incoming clobber _transitionIds", () => {
      const existing = { _transitionIds: { u1: { workflow: "wf", state: "A" } } };
      const out = mergeLayout(existing, { _transitionIds: { evil: "value" } }) as typeof existing;
      expect(out._transitionIds).toEqual(existing._transitionIds);
    });
  });

  describe("remapLayoutUuids", () => {
    it("re-keys transitionPositions/edgeAnchors old→new by ordinal within (workflow,state)", () => {
      const workflowUi = { Pledge: { transitionPositions: { old1: { x: 1, y: 1 } }, edgeAnchors: { old1: { source: "R", target: "L" } } } } as never;
      const oldIds = { old1: { workflow: "Pledge", state: "none", transitionUuid: "old1" } };
      const newIds = { new1: { workflow: "Pledge", state: "none", transitionUuid: "new1" } };
      const out = remapLayoutUuids(workflowUi, oldIds, newIds);
      expect(out.Pledge.transitionPositions).toEqual({ new1: { x: 1, y: 1 } });
      expect(out.Pledge.edgeAnchors).toEqual({ new1: { source: "R", target: "L" } });
    });
    it("returns the input unchanged when oldIds is empty", () => {
      const wf = { A: { transitionPositions: { x: { x: 0, y: 0 } } } } as never;
      expect(remapLayoutUuids(wf, {}, {})).toBe(wf);
    });
    it("keeps an old key (no orphan) when it has no new counterpart", () => {
      const workflowUi = { A: { transitionPositions: { old1: { x: 1, y: 1 }, old2: { x: 2, y: 2 } } } } as never;
      const oldIds = { old1: { workflow: "A", state: "s", transitionUuid: "old1" }, old2: { workflow: "A", state: "s", transitionUuid: "old2" } };
      const newIds = { new1: { workflow: "A", state: "s", transitionUuid: "new1" } };
      const out = remapLayoutUuids(workflowUi, oldIds, newIds);
      expect(out.A.transitionPositions).toEqual({ new1: { x: 1, y: 1 }, old2: { x: 2, y: 2 } });
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/layout.test.ts` → expect FAIL.
- [ ] Write `server/layout.ts` (`mergeLayout` verbatim from parked `tools/layout.ts`; `remapLayoutUuids` ported from `routes/workflow.tsx:26-72`; plus `loadRemappedLayout` reader):
  ```ts
  import type { WorkflowUiMeta, TransitionPointer } from "@cyoda/workflow-core";
  import type { ToolContext } from "./context.js";

  type LayoutNodes = Record<string, unknown>;
  interface WorkflowUiMetaLike { layout?: { nodes?: LayoutNodes }; [key: string]: unknown }
  type Sidecar = Record<string, unknown>;
  const TRANSITION_IDS_KEY = "_transitionIds";

  /** Deep-merge incoming layout into the sidecar, replacing only each workflow's
   *  `layout.nodes` and preserving every sibling field + `_transitionIds`. */
  export function mergeLayout(existing: Sidecar, incoming: Sidecar): Sidecar {
    const result: Sidecar = { ...existing };
    for (const [wf, incomingEntry] of Object.entries(incoming)) {
      if (wf === TRANSITION_IDS_KEY) continue;
      const existingEntry = (existing[wf] as WorkflowUiMetaLike | undefined) ?? {};
      const incomingNodes = (incomingEntry as WorkflowUiMetaLike | undefined)?.layout?.nodes ?? {};
      result[wf] = { ...existingEntry, layout: { ...existingEntry.layout, nodes: incomingNodes } };
    }
    return result;
  }

  /** Re-key transitionPositions/edgeAnchors from old synthetic UUIDs to current
   *  UUIDs by ordinal position within (workflow, state). Ported from
   *  `apps/dev-console/src/routes/workflow.tsx:26-72`. */
  export function remapLayoutUuids(
    workflowUi: Record<string, WorkflowUiMeta>,
    oldIds: Record<string, TransitionPointer>,
    newIds: Record<string, TransitionPointer>,
  ): Record<string, WorkflowUiMeta> {
    if (Object.keys(oldIds).length === 0) return workflowUi;

    const oldByState: Record<string, string[]> = {};
    for (const [uuid, ptr] of Object.entries(oldIds)) (oldByState[`${ptr.workflow}:${ptr.state}`] ??= []).push(uuid);
    const newByState: Record<string, string[]> = {};
    for (const [uuid, ptr] of Object.entries(newIds)) (newByState[`${ptr.workflow}:${ptr.state}`] ??= []).push(uuid);

    const uuidMap: Record<string, string> = {};
    for (const [key, oldUuids] of Object.entries(oldByState)) {
      const newUuids = newByState[key] ?? [];
      oldUuids.forEach((oldUuid, idx) => { const n = newUuids[idx]; if (n) uuidMap[oldUuid] = n; });
    }

    const result: Record<string, WorkflowUiMeta> = {};
    for (const [wfName, ui] of Object.entries(workflowUi)) {
      const transitionPositions = ui.transitionPositions
        ? Object.fromEntries(Object.entries(ui.transitionPositions).map(([uuid, pos]) => [uuidMap[uuid] ?? uuid, pos]))
        : undefined;
      const edgeAnchors = ui.edgeAnchors
        ? Object.fromEntries(Object.entries(ui.edgeAnchors).map(([uuid, anchor]) => [uuidMap[uuid] ?? uuid, anchor]))
        : undefined;
      result[wfName] = {
        ...ui,
        ...(transitionPositions !== undefined ? { transitionPositions } : {}),
        ...(edgeAnchors !== undefined ? { edgeAnchors } : {}),
      };
    }
    return result;
  }

  /** Read `<workflowRel>.layout.json`, strip `_transitionIds`, remap UUID keys to the
   *  document's current transition ids. Missing/invalid sidecar → `{}`. */
  export async function loadRemappedLayout(
    ctx: ToolContext,
    workflowRel: string,
    currentIds: Record<string, TransitionPointer>,
  ): Promise<Record<string, WorkflowUiMeta>> {
    const sidecarRel = workflowRel.replace(/\.json$/, ".layout.json");
    let raw: string;
    try { raw = (await ctx.read(sidecarRel)).contents; } catch { return {}; }
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
    const { _transitionIds, ...rawWorkflowUi } = parsed;
    const workflowUi = rawWorkflowUi as Record<string, WorkflowUiMeta>;
    return _transitionIds && typeof _transitionIds === "object"
      ? remapLayoutUuids(workflowUi, _transitionIds as Record<string, TransitionPointer>, currentIds)
      : workflowUi;
  }
  ```
- [ ] Run the layout test → expect PASS.
- [ ] `git add apps/model-editor-mcp/server/context.ts apps/model-editor-mcp/server/layout.ts apps/model-editor-mcp/server/__tests__/layout.test.ts && git commit -m "feat(model-editor-mcp): ToolContext + layout merge/remap/loader"`

---

### Task 6: `server/tools/{list,show,validate,update}.ts`

**Files:**
- Create `apps/model-editor-mcp/server/tools/list.ts`
- Create `apps/model-editor-mcp/server/tools/show.ts`
- Create `apps/model-editor-mcp/server/tools/validate.ts`
- Create `apps/model-editor-mcp/server/tools/update.ts`
- Test `apps/model-editor-mcp/server/__tests__/tools.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function listWorkflowsTool(args: unknown, ctx: ToolContext): Promise<McpResult>;
  export interface ShownPayload { workflow: string; revision: number; content: string; layout: Record<string, WorkflowUiMeta> }
  export function showWorkflowTool(args: unknown, ctx: ToolContext, setShown: (p: ShownPayload) => void): Promise<McpResult>;
  export function validateWorkflowTool(args: unknown, ctx: ToolContext): Promise<McpResult>;
  export function updateWorkflowTool(args: unknown, ctx: ToolContext): Promise<McpResult>;
  ```
- Consumes `ToolContext` (`./context.js`), `findByName` (`./discovery.js`), `loadRemappedLayout` (`./layout.js`), `jsonDiff` (`./diff.js`), `synthesizeImportPayload` (`@cyoda/workflow-editor-host`), the v1 schemas.

**Steps:**
- [ ] Write the failing `server/__tests__/tools.test.ts`:
  ```ts
  import { describe, it, expect, vi } from "vitest";
  import type { WorkflowEditorDocument } from "@cyoda/workflow-core";
  import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
  import type { ToolContext } from "../context.js";
  import { listWorkflowsTool } from "../tools/list.js";
  import { showWorkflowTool } from "../tools/show.js";
  import { validateWorkflowTool } from "../tools/validate.js";
  import { updateWorkflowTool } from "../tools/update.js";

  const PLEDGE = JSON.stringify({
    importMode: "MERGE",
    workflows: [{ version: "1", name: "Pledge", initialState: "none", active: true,
      states: { none: { transitions: [{ name: "create", next: "created", manual: false, disabled: false }] }, created: { transitions: [] } } }],
  });

  function entry(over: Partial<WorkflowFileIndexEntry> = {}): WorkflowFileIndexEntry {
    return { path: "/r/Pledge.json", relativePath: "Pledge.json", status: "valid-workflow", workflows: [{ name: "Pledge" }], lastModified: "t", sizeBytes: 1, ...over };
  }

  /** A ToolContext backed by an in-memory file map + the REAL workflow-core parse/serialize/validate. */
  function ctx(files: Record<string, string>, over: Partial<ToolContext> = {}): ToolContext {
    const real = require("@cyoda/workflow-core");
    const writes: Record<string, string> = {};
    return {
      root: "/r",
      workflowGlobs: ["**/*.json"],
      connectionUrl: "http://127.0.0.1:50000",
      read: vi.fn(async (rel: string) => {
        const c = writes[rel] ?? files[rel];
        if (c === undefined) throw new Error("not found");
        return { contents: c, lastModified: "t", sizeBytes: c.length };
      }),
      write: vi.fn(async (rel: string, contents: string) => { writes[rel] = contents; return { path: `/r/${rel}`, lastModified: "t", sizeBytes: contents.length }; }),
      discover: vi.fn(async () => [entry()]),
      parseImport: real.parseImportPayload,
      serializeImport: real.serializeImportPayload,
      validate: real.validateAll,
      ...over,
    };
  }

  describe("listWorkflowsTool", () => {
    it("returns { name, path, states, transitions, valid } per discovered workflow", async () => {
      const r = await listWorkflowsTool({}, ctx({ "Pledge.json": PLEDGE }));
      expect(r.isError).toBeFalsy();
      expect(JSON.parse(r.content[0]!.text)).toEqual([{ name: "Pledge", path: "Pledge.json", states: 2, transitions: 1, valid: true }]);
    });
    it("rejects unknown args", async () => {
      await expect(listWorkflowsTool({ x: 1 }, ctx({}))).rejects.toMatchObject({ isError: true });
    });
  });

  describe("showWorkflowTool", () => {
    it("returns the canonical document and calls setShown with content + remapped layout", async () => {
      const setShown = vi.fn();
      const r = await showWorkflowTool({ name: "Pledge" }, ctx({ "Pledge.json": PLEDGE }), setShown);
      expect(r.isError).toBeFalsy();
      const out = JSON.parse(r.content[0]!.text);
      expect(out.name).toBe("Pledge");
      expect(out.content).toContain('"workflows"');
      expect(setShown).toHaveBeenCalledWith(expect.objectContaining({ workflow: "Pledge", content: expect.stringContaining("Pledge") }));
    });
    it("throws NOT_FOUND for an unknown name", async () => {
      await expect(showWorkflowTool({ name: "Nope" }, ctx({ "Pledge.json": PLEDGE }), vi.fn())).rejects.toMatchObject({
        isError: true, content: [{ type: "text", text: expect.stringContaining("NOT_FOUND") }],
      });
    });
  });

  describe("validateWorkflowTool", () => {
    it("reports valid:true with no error diagnostics for a good workflow", async () => {
      const r = await validateWorkflowTool({ name: "Pledge" }, ctx({ "Pledge.json": PLEDGE }));
      const out = JSON.parse(r.content[0]!.text);
      expect(out.valid).toBe(true);
      expect(out.diagnostics.filter((d: { severity: string }) => d.severity === "error")).toHaveLength(0);
    });
  });

  describe("updateWorkflowTool", () => {
    it("writes canonical JSON and returns a diff on success", async () => {
      const c = ctx({ "Pledge.json": PLEDGE });
      const renamed = JSON.parse(PLEDGE);
      renamed.workflows[0].name = "Pledge2";
      const r = await updateWorkflowTool({ name: "Pledge", content: JSON.stringify(renamed) }, c);
      expect(r.isError).toBeFalsy();
      const out = JSON.parse(r.content[0]!.text);
      expect(out.ok).toBe(true);
      expect(out.diff).toContainEqual({ op: "replace", path: "/workflows/0/name", value: "Pledge2" });
      expect(c.write).toHaveBeenCalledWith("Pledge.json", expect.stringContaining("Pledge2"));
    });
    it("rejects invalid JSON without writing", async () => {
      const c = ctx({ "Pledge.json": PLEDGE });
      await expect(updateWorkflowTool({ name: "Pledge", content: "{bad" }, c)).rejects.toMatchObject({ isError: true });
      expect(c.write).not.toHaveBeenCalled();
    });
    it("returns VALIDATION_FAILED (isError, no write) when content is not a parseable workflow", async () => {
      const c = ctx({ "Pledge.json": PLEDGE });
      const r = await updateWorkflowTool({ name: "Pledge", content: '{"foo":"bar"}' }, c);
      expect(r.isError).toBe(true);
      expect((r.structuredContent as { code: string }).code).toBe("VALIDATION_FAILED");
      expect(c.write).not.toHaveBeenCalled();
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/tools.test.ts` → expect FAIL.
- [ ] Write `server/tools/list.ts`:
  ```ts
  import { ok, err } from "../envelope.js";
  import type { McpResult } from "../envelope.js";
  import type { ToolContext } from "../context.js";
  import { listWorkflowsInput } from "../schemas.js";
  import { synthesizeImportPayload } from "@cyoda/workflow-editor-host";

  /** `list_workflows` → `[{ name, path, states, transitions, valid }]`. */
  export async function listWorkflowsTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
    const input = listWorkflowsInput.safeParse(args);
    if (!input.success) throw err("INVALID_ARGS", input.error.message);

    const entries = await ctx.discover();
    const out: Array<{ name: string; path: string; states: number; transitions: number; valid: boolean }> = [];
    for (const entry of entries) {
      let states = 0, transitions = 0, valid = false;
      try {
        const parsed = ctx.parseImport(synthesizeImportPayload((await ctx.read(entry.relativePath)).contents));
        if (parsed.document) {
          for (const wf of parsed.document.session.workflows) {
            const codes = Object.keys(wf.states);
            states += codes.length;
            for (const code of codes) transitions += wf.states[code]!.transitions.length;
          }
          valid = ctx.validate(parsed.document).filter((i) => i.severity === "error").length === 0;
        }
      } catch { /* unreadable/unparseable → zero counts, valid:false */ }
      const name = entry.workflows[0]?.name ?? entry.relativePath.replace(/\.json$/, "").split("/").pop()!;
      out.push({ name, path: entry.relativePath, states, transitions, valid });
    }
    return ok(out);
  }
  ```
- [ ] Write `server/tools/show.ts`:
  ```ts
  import type { WorkflowUiMeta } from "@cyoda/workflow-core";
  import { synthesizeImportPayload } from "@cyoda/workflow-editor-host";
  import { ok, err } from "../envelope.js";
  import type { McpResult } from "../envelope.js";
  import type { ToolContext } from "../context.js";
  import { showWorkflowInput } from "../schemas.js";
  import { findByName } from "../discovery.js";
  import { loadRemappedLayout } from "../layout.js";

  export interface ShownPayload { workflow: string; revision: number; content: string; layout: Record<string, WorkflowUiMeta> }

  /** `show_workflow(name)` — parse + canonicalise, push a "show" (content + remapped
   *  layout) via `setShown`, and return the document to Claude. */
  export async function showWorkflowTool(args: unknown, ctx: ToolContext, setShown: (p: ShownPayload) => void): Promise<McpResult> {
    const input = showWorkflowInput.safeParse(args);
    if (!input.success) throw err("INVALID_ARGS", input.error.message);
    const { name } = input.data;

    const entry = findByName(await ctx.discover(), name);
    if (!entry) throw err("NOT_FOUND", `no workflow named "${name}"`);

    const parsed = ctx.parseImport(synthesizeImportPayload((await ctx.read(entry.relativePath)).contents));
    if (!parsed.document) throw err("PARSE_ERROR", `"${entry.relativePath}" is not a parseable workflow`);

    const content = ctx.serializeImport(parsed.document);
    const layout = await loadRemappedLayout(ctx, entry.relativePath, parsed.document.meta.ids.transitions);
    const revision = Date.now();
    setShown({ workflow: name, revision, content, layout });
    return ok({ name, path: entry.relativePath, content, layout, diagnostics: parsed.issues });
  }
  ```
- [ ] Write `server/tools/validate.ts`:
  ```ts
  import { synthesizeImportPayload } from "@cyoda/workflow-editor-host";
  import { ok, err } from "../envelope.js";
  import type { McpResult } from "../envelope.js";
  import type { ToolContext } from "../context.js";
  import { validateWorkflowInput } from "../schemas.js";
  import { findByName } from "../discovery.js";

  /** `validate_workflow(name)` — parse + `validateAll`, read-only. */
  export async function validateWorkflowTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
    const input = validateWorkflowInput.safeParse(args);
    if (!input.success) throw err("INVALID_ARGS", input.error.message);
    const { name } = input.data;

    const entry = findByName(await ctx.discover(), name);
    if (!entry) throw err("NOT_FOUND", `no workflow named "${name}"`);

    const parsed = ctx.parseImport(synthesizeImportPayload((await ctx.read(entry.relativePath)).contents));
    const diagnostics = parsed.document ? [...parsed.issues, ...ctx.validate(parsed.document)] : parsed.issues;
    const valid = !!parsed.document && diagnostics.filter((i) => i.severity === "error").length === 0;
    return ok({ name, valid, diagnostics });
  }
  ```
- [ ] Write `server/tools/update.ts`:
  ```ts
  import { ok, err } from "../envelope.js";
  import type { McpResult } from "../envelope.js";
  import type { ToolContext } from "../context.js";
  import { updateWorkflowInput } from "../schemas.js";
  import { findByName } from "../discovery.js";
  import { jsonDiff } from "../diff.js";

  /** `update_workflow(name, content)` — validated whole-document write; on any
   *  parse/validation error writes NOTHING and returns diagnostics. */
  export async function updateWorkflowTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
    const input = updateWorkflowInput.safeParse(args);
    if (!input.success) throw err("INVALID_ARGS", input.error.message);
    const { name, content } = input.data;

    try { JSON.parse(content); } catch { throw err("INVALID_JSON", `content for "${name}" is not valid JSON`); }

    const entry = findByName(await ctx.discover(), name);
    if (!entry) throw err("NOT_FOUND", `no workflow named "${name}"`);

    const before = await ctx.read(entry.relativePath);
    const parsed = ctx.parseImport(content);
    if (!parsed.document) {
      return { content: [{ type: "text", text: `VALIDATION_FAILED: ${JSON.stringify(parsed.issues)}` }], isError: true, structuredContent: { code: "VALIDATION_FAILED", diagnostics: parsed.issues } };
    }
    const semantic = ctx.validate(parsed.document);
    if (semantic.some((i) => i.severity === "error")) {
      const diagnostics = [...parsed.issues, ...semantic];
      return { content: [{ type: "text", text: `VALIDATION_FAILED: ${JSON.stringify(diagnostics)}` }], isError: true, structuredContent: { code: "VALIDATION_FAILED", diagnostics } };
    }

    const canonical = ctx.serializeImport(parsed.document);
    await ctx.write(entry.relativePath, canonical);
    let beforeParsed: unknown = {};
    try { beforeParsed = JSON.parse(before.contents); } catch { /* diff against {} */ }
    const diff = jsonDiff(beforeParsed, JSON.parse(canonical));
    return ok({ name, path: entry.relativePath, ok: true, diff, diagnostics: [...parsed.issues, ...semantic] });
  }
  ```
- [ ] Run the tools test → expect PASS.
- [ ] `git add apps/model-editor-mcp/server/tools/list.ts apps/model-editor-mcp/server/tools/show.ts apps/model-editor-mcp/server/tools/validate.ts apps/model-editor-mcp/server/tools/update.ts apps/model-editor-mcp/server/__tests__/tools.test.ts && git commit -m "feat(model-editor-mcp): list/show/validate/update tools"`

---

### Task 7: `server/tools/optimize_layout.ts` — ELK stitch (`projectToGraph` → `layoutGraph` → `mergeLayout`)

**Files:**
- Create `apps/model-editor-mcp/server/tools/optimize_layout.ts`
- Test `apps/model-editor-mcp/server/__tests__/optimize_layout.test.ts`

**Interfaces:**
- Produces `export function optimizeLayoutTool(args: unknown, ctx: ToolContext): Promise<McpResult>;`
- Consumes `projectToGraph` (`@cyoda/workflow-graph`), `layoutGraph`, `LayoutOptions` (`@cyoda/workflow-layout`), `mergeLayout` (`./layout.js`), `findByName` (`./discovery.js`).

**Steps:**
- [ ] Write the failing `server/__tests__/optimize_layout.test.ts` (uses the real elkjs-backed `layoutGraph`, so it is an integration-style unit test):
  ```ts
  import { describe, it, expect, vi } from "vitest";
  import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
  import type { ToolContext } from "../context.js";
  import { optimizeLayoutTool } from "../tools/optimize_layout.js";

  const PLEDGE = JSON.stringify({
    importMode: "MERGE",
    workflows: [{ version: "1", name: "Pledge", initialState: "none", active: true,
      states: { none: { transitions: [{ name: "create", next: "created", manual: false, disabled: false }] }, created: { transitions: [] } } }],
  });

  function ctx(files: Record<string, string>): ToolContext {
    const real = require("@cyoda/workflow-core");
    const writes: Record<string, string> = {};
    const entry: WorkflowFileIndexEntry = { path: "/r/Pledge.json", relativePath: "Pledge.json", status: "valid-workflow", workflows: [{ name: "Pledge" }], lastModified: "t", sizeBytes: 1 };
    return {
      root: "/r", workflowGlobs: ["**/*.json"], connectionUrl: "http://127.0.0.1:50000",
      read: vi.fn(async (rel: string) => { const c = writes[rel] ?? files[rel]; if (c === undefined) throw new Error("nf"); return { contents: c, lastModified: "t", sizeBytes: c.length }; }),
      write: vi.fn(async (rel: string, contents: string) => { writes[rel] = contents; return { path: `/r/${rel}`, lastModified: "t", sizeBytes: contents.length }; }),
      discover: vi.fn(async () => [entry]),
      parseImport: real.parseImportPayload, serializeImport: real.serializeImportPayload, validate: real.validateAll,
    };
  }

  describe("optimizeLayoutTool", () => {
    it("lays out via ELK and merges { x, y } per state code into the sidecar", async () => {
      const c = ctx({ "Pledge.json": PLEDGE });
      const r = await optimizeLayoutTool({ name: "Pledge", options: { orientation: "vertical" } }, c);
      expect(r.isError).toBeFalsy();
      const out = JSON.parse(r.content[0]!.text);
      expect(out.path).toBe("Pledge.layout.json");
      expect(Object.keys(out.positions.Pledge.layout.nodes).sort()).toEqual(["created", "none"]);
      for (const pos of Object.values(out.positions.Pledge.layout.nodes) as Array<{ x: number; y: number }>) {
        expect(typeof pos.x).toBe("number");
        expect(typeof pos.y).toBe("number");
      }
      expect(c.write).toHaveBeenCalledWith("Pledge.layout.json", expect.stringContaining('"nodes"'));
    });
    it("preserves existing sibling sidecar fields via mergeLayout", async () => {
      const c = ctx({ "Pledge.json": PLEDGE, "Pledge.layout.json": JSON.stringify({ _transitionIds: { u: { workflow: "Pledge", state: "none" } }, Pledge: { transitionPositions: { u: { x: 9, y: 9 } } } }) });
      await optimizeLayoutTool({ name: "Pledge" }, c);
      const written = JSON.parse((c.write as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![2] as string);
      expect(written.Pledge.transitionPositions).toEqual({ u: { x: 9, y: 9 } });
      expect(written._transitionIds).toEqual({ u: { workflow: "Pledge", state: "none" } });
    });
    it("throws NOT_FOUND for an unknown name", async () => {
      await expect(optimizeLayoutTool({ name: "Nope" }, ctx({ "Pledge.json": PLEDGE }))).rejects.toMatchObject({ isError: true });
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/optimize_layout.test.ts` → expect FAIL.
- [ ] Write `server/tools/optimize_layout.ts`:
  ```ts
  import { projectToGraph } from "@cyoda/workflow-graph";
  import { layoutGraph } from "@cyoda/workflow-layout";
  import type { LayoutOptions } from "@cyoda/workflow-layout";
  import type { WorkflowUiMeta } from "@cyoda/workflow-core";
  import { synthesizeImportPayload } from "@cyoda/workflow-editor-host";
  import { ok, err } from "../envelope.js";
  import type { McpResult } from "../envelope.js";
  import type { ToolContext } from "../context.js";
  import { optimizeLayoutInput } from "../schemas.js";
  import { findByName } from "../discovery.js";
  import { mergeLayout } from "../layout.js";

  /**
   * `optimize_layout(name, options?)` — NEW code. parse → `projectToGraph` →
   * `layoutGraph` (elkjs) → map node positions (keyed by synthetic node id) back
   * to `layout.nodes` keyed by stateCode, then `mergeLayout` into `.layout.json`.
   */
  export async function optimizeLayoutTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
    const input = optimizeLayoutInput.safeParse(args);
    if (!input.success) throw err("INVALID_ARGS", input.error.message);
    const { name, options } = input.data;

    const entry = findByName(await ctx.discover(), name);
    if (!entry) throw err("NOT_FOUND", `no workflow named "${name}"`);

    const parsed = ctx.parseImport(synthesizeImportPayload((await ctx.read(entry.relativePath)).contents));
    if (!parsed.document) throw err("PARSE_ERROR", `"${entry.relativePath}" is not a parseable workflow`);

    const graph = projectToGraph(parsed.document);
    const result = await layoutGraph(graph, options as LayoutOptions | undefined);

    const idToState = new Map<string, { workflow: string; stateCode: string }>();
    for (const node of graph.nodes) if (node.kind === "state") idToState.set(node.id, { workflow: node.workflow, stateCode: node.stateCode });

    const incoming: Record<string, WorkflowUiMeta> = {};
    for (const [id, pos] of result.positions) {
      const s = idToState.get(id);
      if (!s) continue;
      const wf = (incoming[s.workflow] ??= { layout: { nodes: {} } });
      wf.layout!.nodes[s.stateCode] = { x: Math.round(pos.x), y: Math.round(pos.y) };
    }

    const sidecarRel = entry.relativePath.replace(/\.json$/, ".layout.json");
    let existing: Record<string, unknown> = {};
    try { existing = JSON.parse((await ctx.read(sidecarRel)).contents) as Record<string, unknown>; } catch { existing = {}; }
    const merged = mergeLayout(existing, incoming as Record<string, unknown>);
    await ctx.write(sidecarRel, JSON.stringify(merged, null, 2));

    return ok({ name, path: sidecarRel, positions: merged });
  }
  ```
- [ ] Run the test → expect PASS.
- [ ] `git add apps/model-editor-mcp/server/tools/optimize_layout.ts apps/model-editor-mcp/server/__tests__/optimize_layout.test.ts && git commit -m "feat(model-editor-mcp): optimize_layout ELK stitch (projectToGraph→layoutGraph→mergeLayout)"`

---

### Task 8: `server/sse.ts` + `server/manifest.ts` + `server/mcp.ts` — SSE hub + stdio JSON-RPC (own request shape)

**Files:**
- Create `apps/model-editor-mcp/server/sse.ts`
- Create `apps/model-editor-mcp/server/mcp.ts`
- Create `apps/model-editor-mcp/server/manifest.ts`
- Test `apps/model-editor-mcp/server/__tests__/sse.test.ts`
- Test `apps/model-editor-mcp/server/__tests__/mcp.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // sse.ts
  export type SseEvent =
    | { type: "show"; workflow: string; revision: number; content: string; layout: Record<string, WorkflowUiMeta> }
    | { type: "content"; workflow: string; revision: number; content: string }
    | { type: "layout"; workflow: string; revision: number; layout: Record<string, WorkflowUiMeta>; origin?: string };
  export interface SseClient { write(event: SseEvent): void }
  export interface SseHub {
    addClient(client: SseClient, origin: string): void;
    removeClient(client: SseClient): void;
    broadcast(event: SseEvent, exceptOrigin?: string): void;
    setShown(event: Extract<SseEvent, { type: "show" }>): void;
    currentShown(): Extract<SseEvent, { type: "show" }> | null;
  }
  export function createSseHub(): SseHub;
  // manifest.ts
  export const TOOL_MANIFEST: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  // mcp.ts
  export interface JsonRpcRequest { jsonrpc: "2.0"; id?: number | string | null; method: string; params?: { name?: string; arguments?: unknown } }
  export function startMcpServer(opts: { tools: Record<string, ToolHandler>; connectionUrl: string; input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream }): void;
  ```

**Steps:**
- [ ] Write the failing `server/__tests__/sse.test.ts`:
  ```ts
  import { describe, it, expect, vi } from "vitest";
  import { createSseHub } from "../sse.js";
  import type { SseClient, SseEvent } from "../sse.js";

  function client(): SseClient & { events: SseEvent[] } {
    const events: SseEvent[] = [];
    return { events, write: (e) => { events.push(e); } };
  }

  describe("SseHub", () => {
    it("replays the current shown workflow to a newly connected client", () => {
      const hub = createSseHub();
      const show: Extract<SseEvent, { type: "show" }> = { type: "show", workflow: "Pledge", revision: 1, content: "{}", layout: {} };
      hub.setShown(show);
      const c = client();
      hub.addClient(c, "A");
      expect(c.events).toEqual([show]);
    });
    it("echo-suppresses a layout push to the originating tab but delivers to others", () => {
      const hub = createSseHub();
      const a = client(), b = client();
      hub.addClient(a, "A"); hub.addClient(b, "B");
      const layout: SseEvent = { type: "layout", workflow: "Pledge", revision: 2, layout: {}, origin: "A" };
      hub.broadcast(layout, "A");
      expect(a.events).toEqual([]);
      expect(b.events).toEqual([layout]);
    });
    it("stops delivering after removeClient", () => {
      const hub = createSseHub();
      const a = client();
      hub.addClient(a, "A"); hub.removeClient(a);
      hub.broadcast({ type: "content", workflow: "P", revision: 3, content: "{}" });
      expect(a.events).toEqual([]);
    });
  });
  ```
- [ ] Write the failing `server/__tests__/mcp.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { PassThrough } from "node:stream";
  import { ok } from "../envelope.js";
  import { startMcpServer } from "../mcp.js";

  function drive(lines: string[]): Promise<Record<string, unknown>[]> {
    const input = new PassThrough(), output = new PassThrough();
    const received: Record<string, unknown>[] = [];
    output.on("data", (b: Buffer) => { for (const l of b.toString("utf8").split("\n")) if (l.trim()) received.push(JSON.parse(l)); });
    startMcpServer({
      tools: { show_workflow: async (a) => ok({ echoed: a }) },
      connectionUrl: "http://127.0.0.1:50000",
      input, output,
    });
    for (const l of lines) input.write(`${l}\n`);
    return new Promise((res) => setTimeout(() => res(received), 30));
  }

  describe("startMcpServer (stdio JSON-RPC)", () => {
    it("answers initialize and tools/list", async () => {
      const out = await drive([
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      ]);
      const init = out.find((m) => m.id === 1) as { result: { serverInfo: { name: string } } };
      expect(init.result.serverInfo.name).toBe("model-editor-mcp");
      const list = out.find((m) => m.id === 2) as { result: { tools: { name: string }[] } };
      expect(list.result.tools.map((t) => t.name)).toContain("show_workflow");
    });
    it("dispatches tools/call and injects _connection.url into structuredContent", async () => {
      const out = await drive([JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "show_workflow", arguments: { name: "Pledge" } } })]);
      const call = out.find((m) => m.id === 3) as { result: { structuredContent: { echoed: unknown; _connection: { url: string } } } };
      expect(call.result.structuredContent.echoed).toEqual({ name: "Pledge" });
      expect(call.result.structuredContent._connection.url).toBe("http://127.0.0.1:50000");
    });
  });
  ```
- [ ] Run both tests → expect FAIL.
- [ ] Write `server/sse.ts`:
  ```ts
  import type { WorkflowUiMeta } from "@cyoda/workflow-core";

  export type SseEvent =
    | { type: "show"; workflow: string; revision: number; content: string; layout: Record<string, WorkflowUiMeta> }
    | { type: "content"; workflow: string; revision: number; content: string }
    | { type: "layout"; workflow: string; revision: number; layout: Record<string, WorkflowUiMeta>; origin?: string };

  export interface SseClient { write(event: SseEvent): void }

  export interface SseHub {
    addClient(client: SseClient, origin: string): void;
    removeClient(client: SseClient): void;
    broadcast(event: SseEvent, exceptOrigin?: string): void;
    setShown(event: Extract<SseEvent, { type: "show" }>): void;
    currentShown(): Extract<SseEvent, { type: "show" }> | null;
  }

  export function createSseHub(): SseHub {
    const clients = new Map<SseClient, string>();
    let shown: Extract<SseEvent, { type: "show" }> | null = null;
    return {
      addClient(client, origin) { clients.set(client, origin); if (shown) client.write(shown); },
      removeClient(client) { clients.delete(client); },
      broadcast(event, exceptOrigin) {
        for (const [client, origin] of clients) { if (exceptOrigin && origin === exceptOrigin) continue; client.write(event); }
      },
      setShown(event) { shown = event; for (const [client] of clients) client.write(event); },
      currentShown() { return shown; },
    };
  }
  ```
- [ ] Write `server/manifest.ts` (advertised tool surface — hand-written JSON Schemas mirroring the zod schemas):
  ```ts
  export interface ToolManifestEntry { name: string; description: string; inputSchema: Record<string, unknown> }

  const empty = { type: "object", properties: {}, additionalProperties: false } as const;
  const nameOnly = { type: "object", properties: { name: { type: "string", minLength: 1 } }, required: ["name"], additionalProperties: false } as const;

  export const TOOL_MANIFEST: ToolManifestEntry[] = [
    { name: "list_workflows", description: "List discovered workflows: [{ name, path, states, transitions, valid }].", inputSchema: empty },
    { name: "show_workflow", description: "Render a workflow in the browser editor and return its parsed document.", inputSchema: nameOnly },
    { name: "update_workflow", description: "Validate + whole-document write a workflow; returns a JSON diff. Writes nothing on failure.", inputSchema: { type: "object", properties: { name: { type: "string", minLength: 1 }, content: { type: "string" } }, required: ["name", "content"], additionalProperties: false } },
    { name: "optimize_layout", description: "Re-lay-out a workflow with elkjs and persist node positions to .layout.json.", inputSchema: { type: "object", properties: { name: { type: "string", minLength: 1 }, options: { type: "object", properties: { orientation: { enum: ["vertical", "horizontal"] }, preset: { enum: ["websiteCompact", "configuratorReadable", "opsAudit"] }, nodeSize: { type: "object", properties: { width: { type: "number" }, height: { type: "number" } }, required: ["width", "height"], additionalProperties: false }, pinned: { type: "array", items: { type: "object", properties: { id: { type: "string" }, x: { type: "number" }, y: { type: "number" } }, required: ["id", "x", "y"], additionalProperties: false } } }, additionalProperties: false } }, required: ["name"], additionalProperties: false } },
    { name: "validate_workflow", description: "Parse + validate a workflow; returns diagnostics. Read-only.", inputSchema: nameOnly },
    { name: "connection_info", description: "Return the browser URL/port for the live editor.", inputSchema: empty },
  ];
  ```
- [ ] Write `server/mcp.ts`:
  ```ts
  import { createInterface } from "node:readline";
  import { makeDispatcher } from "./dispatch.js";
  import type { McpResult, ToolHandler } from "./envelope.js";
  import { SERVER_NAME, SERVER_VERSION } from "./version.js";
  import { TOOL_MANIFEST } from "./manifest.js";

  /** Our OWN stdio request shape — deliberately not the contract's `McpToolInput`
   *  (its `callId` is a webview routing detail with no stdio meaning). */
  export interface JsonRpcRequest { jsonrpc: "2.0"; id?: number | string | null; method: string; params?: { name?: string; arguments?: unknown } }

  export interface McpServerOptions {
    tools: Record<string, ToolHandler>;
    connectionUrl: string;
    input?: NodeJS.ReadableStream;
    output?: NodeJS.WritableStream;
  }

  export function startMcpServer(opts: McpServerOptions): void {
    const input = opts.input ?? process.stdin;
    const output = opts.output ?? process.stdout;
    const dispatch = makeDispatcher(opts.tools);
    const send = (msg: unknown): void => { output.write(`${JSON.stringify(msg)}\n`); };

    createInterface({ input }).on("line", (line) => { void handle(line); });

    async function handle(line: string): Promise<void> {
      const trimmed = line.trim();
      if (!trimmed) return;
      let req: JsonRpcRequest;
      try { req = JSON.parse(trimmed) as JsonRpcRequest; } catch { return; }

      switch (req.method) {
        case "initialize":
          send({ jsonrpc: "2.0", id: req.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } } });
          return;
        case "notifications/initialized":
          return;
        case "tools/list":
          send({ jsonrpc: "2.0", id: req.id, result: { tools: TOOL_MANIFEST } });
          return;
        case "tools/call": {
          const result = await dispatch(String(req.params?.name ?? ""), req.params?.arguments);
          send({ jsonrpc: "2.0", id: req.id, result: withConnection(result, opts.connectionUrl) });
          return;
        }
        default:
          if (req.id !== undefined && req.id !== null) send({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `method not found: ${req.method}` } });
      }
    }
  }

  /** Echo the browser URL in every tool result's structured metadata (never to stdout). */
  function withConnection(result: McpResult, url: string): McpResult {
    if (result.structuredContent && typeof result.structuredContent === "object" && !Array.isArray(result.structuredContent)) {
      return { ...result, structuredContent: { ...(result.structuredContent as Record<string, unknown>), _connection: { url } } };
    }
    return result;
  }
  ```
- [ ] Run both tests → expect PASS.
- [ ] `git add apps/model-editor-mcp/server/sse.ts apps/model-editor-mcp/server/manifest.ts apps/model-editor-mcp/server/mcp.ts apps/model-editor-mcp/server/__tests__/sse.test.ts apps/model-editor-mcp/server/__tests__/mcp.test.ts && git commit -m "feat(model-editor-mcp): SSE hub + stdio JSON-RPC server + tool manifest"`

---

### Task 9: `server/http.ts` — static + SSE `/events` + hardened `POST /layout` + `GET /_id`

**Files:**
- Create `apps/model-editor-mcp/server/http.ts`
- Test `apps/model-editor-mcp/server/__tests__/http.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface HttpServerOptions {
    root: string;
    distDir: string;
    token: string;
    hub: SseHub;
    discover: () => Promise<{ relativePath: string; workflows: { name: string }[] }[]>;
    writeLayout: (name: string, workflowUi: Record<string, unknown>, origin: string) => Promise<void>;
  }
  export function createHttpServer(opts: HttpServerOptions): import("node:http").Server;
  export function isLoopback(req: import("node:http").IncomingMessage): boolean;
  ```

**Steps:**
- [ ] Write the failing `server/__tests__/http.test.ts` (drives a real ephemeral-port server with `fetch`):
  ```ts
  import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
  import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
  import { tmpdir } from "node:os";
  import { join } from "node:path";
  import type { AddressInfo } from "node:net";
  import { createHttpServer } from "../http.js";
  import { createSseHub } from "../sse.js";

  let dist: string, server: ReturnType<typeof createHttpServer>, base: string, writeLayout: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    dist = await mkdtemp(join(tmpdir(), "mem-dist-"));
    await writeFile(join(dist, "index.html"), "<html>tok=__SESSION_TOKEN__</html>");
    writeLayout = vi.fn(async () => {});
    server = createHttpServer({
      root: "/proj", distDir: dist, token: "secret", hub: createSseHub(),
      discover: async () => [{ relativePath: "Pledge.json", workflows: [{ name: "Pledge" }] }],
      writeLayout,
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { await new Promise<void>((r) => server.close(() => r())); await rm(dist, { recursive: true, force: true }); });

  it("GET /_id reports the project root", async () => {
    expect(await (await fetch(`${base}/_id`)).json()).toEqual({ root: "/proj" });
  });
  it("serves index.html with the session token injected", async () => {
    expect(await (await fetch(`${base}/`)).text()).toBe("<html>tok=secret</html>");
  });
  it("rejects POST /layout without the session token (401), no write", async () => {
    const res = await fetch(`${base}/layout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Pledge", workflowUi: {} }) });
    expect(res.status).toBe(401);
    expect(writeLayout).not.toHaveBeenCalled();
  });
  it("rejects POST /layout with a non-loopback Origin (403)", async () => {
    const res = await fetch(`${base}/layout`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": "secret", origin: "http://evil.com" }, body: JSON.stringify({ name: "Pledge", workflowUi: {} }) });
    expect(res.status).toBe(403);
    expect(writeLayout).not.toHaveBeenCalled();
  });
  it("rejects an un-allowlisted workflow name (404), no write", async () => {
    const res = await fetch(`${base}/layout`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": "secret" }, body: JSON.stringify({ name: "Ghost", workflowUi: {} }) });
    expect(res.status).toBe(404);
    expect(writeLayout).not.toHaveBeenCalled();
  });
  it("accepts a valid POST /layout (204) and forwards to writeLayout with origin", async () => {
    const res = await fetch(`${base}/layout`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": "secret", "x-origin": "tabA" }, body: JSON.stringify({ name: "Pledge", workflowUi: { Pledge: { layout: { nodes: {} } } } }) });
    expect(res.status).toBe(204);
    expect(writeLayout).toHaveBeenCalledWith("Pledge", { Pledge: { layout: { nodes: {} } } }, "tabA");
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/http.test.ts` → expect FAIL.
- [ ] Write `server/http.ts`:
  ```ts
  import { createServer } from "node:http";
  import type { IncomingMessage, Server, ServerResponse } from "node:http";
  import { readFile, stat } from "node:fs/promises";
  import { extname, join, normalize } from "node:path";
  import type { SseEvent, SseHub, SseClient } from "./sse.js";
  import { layoutPostBody } from "./schemas.js";

  const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".map": "application/json", ".ico": "image/x-icon", ".woff2": "font/woff2" };

  export interface HttpServerOptions {
    root: string;
    distDir: string;
    token: string;
    hub: SseHub;
    discover: () => Promise<{ relativePath: string; workflows: { name: string }[] }[]>;
    writeLayout: (name: string, workflowUi: Record<string, unknown>, origin: string) => Promise<void>;
  }

  /** Loopback-only Origin/Host gate — localhost is not a trust boundary, so this
   *  closes the DNS-rebinding/CSRF surface for `POST /layout` and `/events`. */
  export function isLoopback(req: IncomingMessage): boolean {
    const host = req.headers.host ?? "";
    const origin = req.headers.origin;
    const hostOk = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
    const originOk = origin === undefined || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
    return hostOk && originOk;
  }

  export function createHttpServer(opts: HttpServerOptions): Server {
    return createServer((req, res) => { void handle(req, res); });

    async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/_id") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ root: opts.root })); return; }
      if (req.method === "GET" && url.pathname === "/events") { handleEvents(req, res, url); return; }
      if (req.method === "POST" && url.pathname === "/layout") { await handleLayout(req, res); return; }
      if (req.method === "GET") { await serveStatic(url.pathname, res); return; }
      res.writeHead(405).end();
    }

    function handleEvents(req: IncomingMessage, res: ServerResponse, url: URL): void {
      if (!isLoopback(req)) { res.writeHead(403).end(); return; }
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      res.write(": connected\n\n");
      const client: SseClient = { write: (event: SseEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`) };
      opts.hub.addClient(client, url.searchParams.get("origin") ?? "");
      req.on("close", () => opts.hub.removeClient(client));
    }

    async function handleLayout(req: IncomingMessage, res: ServerResponse): Promise<void> {
      if (!isLoopback(req)) { res.writeHead(403).end("bad origin"); return; }
      if (req.headers["x-session-token"] !== opts.token) { res.writeHead(401).end("bad token"); return; }
      const origin = String(req.headers["x-origin"] ?? "");
      let body = "";
      for await (const chunk of req) body += chunk;
      let json: unknown;
      try { json = JSON.parse(body); } catch { res.writeHead(400).end("bad json"); return; }
      const parsed = layoutPostBody.safeParse(json);
      if (!parsed.success) { res.writeHead(400).end("bad body"); return; }
      const { name, workflowUi } = parsed.data;
      const entries = await opts.discover();
      const allowed = entries.some((e) => e.workflows.some((w) => w.name === name) || e.relativePath.replace(/\.json$/, "").split("/").pop() === name);
      if (!allowed) { res.writeHead(404).end("unknown workflow"); return; }
      await opts.writeLayout(name, workflowUi as Record<string, unknown>, origin);
      res.writeHead(204).end();
    }

    async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
      const rel = pathname === "/" ? "index.html" : normalize(pathname).replace(/^(\.\.[/\\])+/, "").replace(/^\//, "");
      const abs = join(opts.distDir, rel);
      const send = async (file: string, mime: string): Promise<void> => {
        let buf = await readFile(file);
        if (file.endsWith("index.html")) buf = Buffer.from(buf.toString("utf8").replaceAll("__SESSION_TOKEN__", opts.token), "utf8");
        res.writeHead(200, { "content-type": mime }); res.end(buf);
      };
      try {
        if (!abs.startsWith(opts.distDir)) { res.writeHead(403).end(); return; }
        if ((await stat(abs)).isDirectory()) throw new Error("dir");
        await send(abs, MIME[extname(abs)] ?? "application/octet-stream");
      } catch {
        try { await send(join(opts.distDir, "index.html"), "text/html"); } catch { res.writeHead(404).end("not found"); }
      }
    }
  }
  ```
- [ ] Run the test → expect PASS.
- [ ] `git add apps/model-editor-mcp/server/http.ts apps/model-editor-mcp/server/__tests__/http.test.ts && git commit -m "feat(model-editor-mcp): HTTP server — static + SSE + hardened POST /layout + GET /_id"`

---

### Task 10: `server/watch.ts` — `node:fs` recursive watch → scoped change classification

**Files:**
- Create `apps/model-editor-mcp/server/watch.ts`
- Test `apps/model-editor-mcp/server/__tests__/watch.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ChangeKind = "content" | "layout";
  export interface WorkflowChange { kind: ChangeKind; workflowFile: string }   // workflowFile is the .json relative path
  export function classifyChange(root: string, absPath: string, workflowGlobs: string[]): WorkflowChange | null;
  export interface Watcher { close(): void }
  export function createWatcher(opts: { root: string; workflowGlobs: string[]; onChange: (c: WorkflowChange) => void; debounceMs?: number }): Watcher;
  ```

**Steps:**
- [ ] Write the failing `server/__tests__/watch.test.ts` (`classifyChange` is pure → deterministic; the live watcher is smoke-tested against a temp dir):
  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { mkdtemp, rm, writeFile } from "node:fs/promises";
  import { tmpdir } from "node:os";
  import { join } from "node:path";
  import { classifyChange, createWatcher } from "../watch.js";
  import type { WorkflowChange } from "../watch.js";

  describe("classifyChange", () => {
    it("maps a .layout.json change to a layout change on the sibling .json", () => {
      expect(classifyChange("/r", "/r/Pledge.layout.json", ["**/*.json"])).toEqual({ kind: "layout", workflowFile: "Pledge.json" });
    });
    it("maps a globbed .json change to a content change", () => {
      expect(classifyChange("/r", "/r/flows/Pledge.json", ["flows/**/*.json"])).toEqual({ kind: "content", workflowFile: "flows/Pledge.json" });
    });
    it("ignores non-globbed .json and non-json files", () => {
      expect(classifyChange("/r", "/r/other/Pledge.json", ["flows/**/*.json"])).toBeNull();
      expect(classifyChange("/r", "/r/notes.txt", ["**/*.json"])).toBeNull();
    });
    it("ignores paths outside the root", () => {
      expect(classifyChange("/r", "/elsewhere/x.json", ["**/*.json"])).toBeNull();
    });
  });

  describe("createWatcher", () => {
    let root: string, w: { close(): void };
    beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "mem-watch-")); });
    afterEach(async () => { w?.close(); await rm(root, { recursive: true, force: true }); });

    it("debounces and emits a content change when a workflow file is written", async () => {
      const seen: WorkflowChange[] = [];
      w = createWatcher({ root, workflowGlobs: ["**/*.json"], onChange: (c) => seen.push(c), debounceMs: 30 });
      await new Promise((r) => setTimeout(r, 50));
      await writeFile(join(root, "Pledge.json"), "{}");
      await new Promise((r) => setTimeout(r, 300));
      expect(seen).toContainEqual({ kind: "content", workflowFile: "Pledge.json" });
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/watch.test.ts` → expect FAIL.
- [ ] Write `server/watch.ts`:
  ```ts
  import { watch } from "node:fs";
  import { isAbsolute, join, relative, sep } from "node:path";
  import { matchGlob } from "./glob.js";

  export type ChangeKind = "content" | "layout";
  export interface WorkflowChange { kind: ChangeKind; workflowFile: string }

  /** Map a changed absolute path to a scoped workflow change (or null to ignore). */
  export function classifyChange(root: string, absPath: string, workflowGlobs: string[]): WorkflowChange | null {
    const rel = relative(root, absPath).split(sep).join("/");
    if (rel.startsWith("..") || rel === "") return null;
    if (rel.endsWith(".layout.json")) return { kind: "layout", workflowFile: rel.replace(/\.layout\.json$/, ".json") };
    if (rel.endsWith(".json")) {
      if (workflowGlobs.length > 0 && !workflowGlobs.some((g) => matchGlob(rel, g))) return null;
      return { kind: "content", workflowFile: rel };
    }
    return null;
  }

  export interface Watcher { close(): void }

  export function createWatcher(opts: { root: string; workflowGlobs: string[]; onChange: (c: WorkflowChange) => void; debounceMs?: number }): Watcher {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const handle = watch(opts.root, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const name = filename.toString();
      const abs = isAbsolute(name) ? name : join(opts.root, name);
      const change = classifyChange(opts.root, abs, opts.workflowGlobs);
      if (!change) return;
      const key = `${change.kind}:${change.workflowFile}`;
      const prev = timers.get(key);
      if (prev) clearTimeout(prev);
      timers.set(key, setTimeout(() => { timers.delete(key); opts.onChange(change); }, opts.debounceMs ?? 120));
    });
    return { close: () => { for (const t of timers.values()) clearTimeout(t); handle.close(); } };
  }
  ```
- [ ] Run the test → expect PASS.
- [ ] `git add apps/model-editor-mcp/server/watch.ts apps/model-editor-mcp/server/__tests__/watch.test.ts && git commit -m "feat(model-editor-mcp): fs recursive watch + scoped change classification"`

---

### Task 11: `server/port.ts` + `server/index.ts` — deterministic port, duplicate detect, `--project` entry

**Files:**
- Create `apps/model-editor-mcp/server/port.ts`
- Create `apps/model-editor-mcp/server/index.ts`
- Create `apps/model-editor-mcp/server/tools/connection_info.ts`
- Test `apps/model-editor-mcp/server/__tests__/port.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // port.ts
  export function fnv1a(str: string): number;
  export function deterministicPort(absProjectPath: string): number;
  export function probeId(port: number): Promise<{ root: string } | null>;
  export function bindPort(preferred: string, projectRoot: string): Promise<number>;   // resolves a free/duplicate-checked port; throws DuplicateInstanceError
  export class DuplicateInstanceError extends Error { constructor(public port: number, public url: string) }
  // connection_info.ts
  export function connectionInfoTool(args: unknown, ctx: ToolContext): Promise<McpResult>;
  // index.ts — CLI entry: `node dist/index.js --project <dir> [--globs '<glob>,<glob>']`
  export function main(argv: string[]): Promise<void>;
  ```

**Steps:**
- [ ] Write the failing `server/__tests__/port.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { fnv1a, deterministicPort } from "../port.js";

  describe("deterministic port", () => {
    it("fnv1a is stable and 32-bit unsigned", () => {
      expect(fnv1a("/Users/paul/proj")).toBe(fnv1a("/Users/paul/proj"));
      expect(fnv1a("/Users/paul/proj")).toBeGreaterThanOrEqual(0);
      expect(fnv1a("/Users/paul/proj")).toBeLessThanOrEqual(0xffffffff);
    });
    it("maps every path into the private range 49152..65535", () => {
      for (const p of ["/a", "/Users/paul/x", "/very/deep/nested/path/here"]) {
        const port = deterministicPort(p);
        expect(port).toBeGreaterThanOrEqual(49152);
        expect(port).toBeLessThanOrEqual(65535);
      }
    });
    it("is deterministic per path and differs for different paths", () => {
      expect(deterministicPort("/a")).toBe(deterministicPort("/a"));
      expect(deterministicPort("/a")).not.toBe(deterministicPort("/b"));
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/port.test.ts` → expect FAIL.
- [ ] Write `server/port.ts`:
  ```ts
  import { get } from "node:http";
  import { createServer } from "node:net";

  /** 32-bit FNV-1a (unsigned). */
  export function fnv1a(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { hash ^= str.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
    return hash >>> 0;
  }

  /** Stable, bookmarkable port in the dynamic/private range, derived from the abs path. */
  export function deterministicPort(absProjectPath: string): number {
    return 49152 + (fnv1a(absProjectPath) % 16384);
  }

  export class DuplicateInstanceError extends Error {
    constructor(public port: number, public url: string) { super(`a model-editor-mcp instance already serves this project at ${url}`); }
  }

  /** `GET /_id` on a port; resolves its reported root, or null if nothing/again unreachable. */
  export function probeId(port: number): Promise<{ root: string } | null> {
    return new Promise((resolve) => {
      const req = get({ host: "127.0.0.1", port, path: "/_id", timeout: 500 }, (res) => {
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () => { try { resolve(JSON.parse(body) as { root: string }); } catch { resolve(null); } });
      });
      req.on("error", () => resolve(null));
      req.on("timeout", () => { req.destroy(); resolve(null); });
    });
  }

  function isFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const s = createServer();
      s.once("error", () => resolve(false));
      s.once("listening", () => s.close(() => resolve(true)));
      s.listen(port, "127.0.0.1");
    });
  }

  /**
   * Resolve the port to bind: prefer the deterministic port; if it is taken, `GET
   * /_id` — same project root → DuplicateInstanceError (the running server + /_id
   * IS the lock); a hash collision on a different project → next free port.
   */
  export async function bindPort(preferredPath: string, projectRoot: string): Promise<number> {
    const preferred = deterministicPort(preferredPath);
    if (await isFree(preferred)) return preferred;
    const id = await probeId(preferred);
    if (id?.root === projectRoot) throw new DuplicateInstanceError(preferred, `http://127.0.0.1:${preferred}/`);
    for (let port = preferred + 1; port < 65536; port++) if (await isFree(port)) return port;
    for (let port = 49152; port < preferred; port++) if (await isFree(port)) return port;
    throw new Error("no free port in the private range");
  }
  ```
- [ ] Run the port test → expect PASS.
- [ ] Write `server/tools/connection_info.ts`:
  ```ts
  import { ok, err } from "../envelope.js";
  import type { McpResult } from "../envelope.js";
  import type { ToolContext } from "../context.js";
  import { connectionInfoInput } from "../schemas.js";

  /** `connection_info()` — surface the browser URL/port (never printed to stdout). */
  export async function connectionInfoTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
    const input = connectionInfoInput.safeParse(args);
    if (!input.success) throw err("INVALID_ARGS", input.error.message);
    const url = new URL(ctx.connectionUrl);
    return ok({ url: ctx.connectionUrl, port: Number(url.port) });
  }
  ```
- [ ] Write `server/index.ts` (wires everything; the watch is the single SSE writer; `pendingOrigins` carries echo-suppression from `POST /layout` into the watch-driven broadcast):
  ```ts
  import { parseArgs } from "node:util";
  import { realpath } from "node:fs/promises";
  import { fileURLToPath } from "node:url";
  import { dirname, join, resolve } from "node:path";
  import { randomBytes } from "node:crypto";
  import { synthesizeImportPayload } from "@cyoda/workflow-editor-host";
  import { createToolContext } from "./context.js";
  import { createSseHub } from "./sse.js";
  import { createHttpServer } from "./http.js";
  import { createWatcher } from "./watch.js";
  import { bindPort, DuplicateInstanceError } from "./port.js";
  import { mergeLayout, loadRemappedLayout } from "./layout.js";
  import { findByName } from "./discovery.js";
  import { startMcpServer } from "./mcp.js";
  import type { ToolHandler } from "./envelope.js";
  import { listWorkflowsTool } from "./tools/list.js";
  import { showWorkflowTool } from "./tools/show.js";
  import type { ShownPayload } from "./tools/show.js";
  import { updateWorkflowTool } from "./tools/update.js";
  import { validateWorkflowTool } from "./tools/validate.js";
  import { optimizeLayoutTool } from "./tools/optimize_layout.js";
  import { connectionInfoTool } from "./tools/connection_info.js";

  export async function main(argv: string[]): Promise<void> {
    const { values } = parseArgs({ args: argv, options: { project: { type: "string", short: "p" }, globs: { type: "string" } } });
    const root = await realpath(resolve(values.project ?? "."));
    const workflowGlobs = (values.globs ?? "**/*.json").split(",").map((g) => g.trim()).filter(Boolean);

    const token = randomBytes(16).toString("hex");
    let port: number;
    try { port = await bindPort(root, root); }
    catch (e) {
      if (e instanceof DuplicateInstanceError) { process.stderr.write(`${e.message}\n`); process.exit(0); }
      throw e;
    }
    const connectionUrl = `http://127.0.0.1:${port}/?token=${token}`;

    const hub = createSseHub();
    const ctx = createToolContext({ root, workflowGlobs, connectionUrl });
    const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "dist");

    /** workflowFile(.json) → origin, set just before a POST /layout write so the
     *  watch-driven broadcast can echo-suppress the originating tab. */
    const pendingOrigins = new Map<string, string>();

    const writeLayout = async (name: string, workflowUi: Record<string, unknown>, origin: string): Promise<void> => {
      const entry = findByName(await ctx.discover(), name);
      if (!entry) return;
      const sidecarRel = entry.relativePath.replace(/\.json$/, ".layout.json");
      let existing: Record<string, unknown> = {};
      try { existing = JSON.parse((await ctx.read(sidecarRel)).contents) as Record<string, unknown>; } catch { existing = {}; }
      if (origin) pendingOrigins.set(entry.relativePath, origin);
      await ctx.write(sidecarRel, JSON.stringify(mergeLayout(existing, workflowUi), null, 2));
    };

    const nameForFile = async (workflowFile: string): Promise<string | null> => {
      const entry = (await ctx.discover()).find((e) => e.relativePath === workflowFile);
      return entry ? entry.workflows[0]?.name ?? workflowFile.replace(/\.json$/, "").split("/").pop()! : null;
    };

    const onChange = async (change: { kind: "content" | "layout"; workflowFile: string }): Promise<void> => {
      const name = await nameForFile(change.workflowFile);
      if (!name) return;
      if (change.kind === "layout") {
        const origin = pendingOrigins.get(change.workflowFile);
        pendingOrigins.delete(change.workflowFile);
        const parsed = await ctx.read(change.workflowFile).then((f) => ctx.parseImport(synthesizeImportPayload(f.contents))).catch(() => null);
        const layout = await loadRemappedLayout(ctx, change.workflowFile, parsed?.document?.meta.ids.transitions ?? {});
        hub.broadcast({ type: "layout", workflow: name, revision: Date.now(), layout, origin }, origin);
        return;
      }
      const shown = hub.currentShown();
      if (!shown || shown.workflow !== name) return; // browser only cares about the shown workflow
      const parsed = ctx.parseImport(synthesizeImportPayload((await ctx.read(change.workflowFile)).contents));
      const content = parsed.document ? ctx.serializeImport(parsed.document) : (await ctx.read(change.workflowFile)).contents;
      hub.broadcast({ type: "content", workflow: name, revision: Date.now(), content });
    };

    const setShown = (p: ShownPayload): void => hub.setShown({ type: "show", workflow: p.workflow, revision: p.revision, content: p.content, layout: p.layout });

    const tools: Record<string, ToolHandler> = {
      list_workflows: (a) => listWorkflowsTool(a, ctx),
      show_workflow: (a) => showWorkflowTool(a, ctx, setShown),
      update_workflow: (a) => updateWorkflowTool(a, ctx),
      optimize_layout: (a) => optimizeLayoutTool(a, ctx),
      validate_workflow: (a) => validateWorkflowTool(a, ctx),
      connection_info: (a) => connectionInfoTool(a, ctx),
    };

    const http = createHttpServer({ root, distDir, token, hub, discover: ctx.discover, writeLayout });
    await new Promise<void>((r) => http.listen(port, "127.0.0.1", r));
    const watcher = createWatcher({ root, workflowGlobs, onChange: (c) => { void onChange(c); } });
    process.on("SIGINT", () => { watcher.close(); http.close(); process.exit(0); });

    startMcpServer({ tools, connectionUrl });
    process.stderr.write(`model-editor-mcp: ${connectionUrl}\n`);
  }

  if (process.argv[1] && fileURLToPath(import.meta.url) === (await realpath(process.argv[1]).catch(() => process.argv[1]))) {
    void main(process.argv.slice(2));
  }
  ```
- [ ] Run the full server suite `pnpm --filter model-editor-mcp exec vitest run` → expect PASS.
- [ ] `git add apps/model-editor-mcp/server/port.ts apps/model-editor-mcp/server/index.ts apps/model-editor-mcp/server/tools/connection_info.ts apps/model-editor-mcp/server/__tests__/port.test.ts && git commit -m "feat(model-editor-mcp): deterministic port + duplicate detect + --project entry + connection_info"`

---

### Task 12: `web/` — Vite app mounting the real editor (editor mode, no Monaco), SSE, layout write-back

**Files:**
- Create `apps/model-editor-mcp/web/index.html`
- Create `apps/model-editor-mcp/web/vite.config.ts`
- Create `apps/model-editor-mcp/web/tsconfig.json`
- Create `apps/model-editor-mcp/web/src/main.tsx`
- Create `apps/model-editor-mcp/web/src/sseClient.ts`
- Create `apps/model-editor-mcp/web/src/App.tsx`
- Create `apps/model-editor-mcp/web/src/EditorView.tsx`

**Interfaces:**
- Consumes `useEditorSession`, `WorkflowEditorHostPanel`, `ExternalChangeBanner` (`@cyoda/workflow-editor-host`); `ThemeProvider` (`@cyoda/console-design-system`); `parseImportPayload`, `WorkflowUiMeta` (`@cyoda/workflow-core`).
- Server SSE contract (matches `server/sse.ts` `SseEvent`) and `POST /layout` body `{ name, workflowUi }` with `X-Session-Token` + `X-Origin` headers.

**Steps:**
- [ ] Write `web/index.html` (the `__SESSION_TOKEN__` placeholder survives the build into `dist/index.html` and is replaced at serve time by `http.ts`):
  ```html
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Model Editor</title>
      <script>window.__MODEL_EDITOR__ = { token: "__SESSION_TOKEN__" };</script>
      <style>html, body, #root { height: 100%; margin: 0 }</style>
    </head>
    <body>
      <div id="root"></div>
      <script type="module" src="/src/main.tsx"></script>
    </body>
  </html>
  ```
- [ ] Write `web/vite.config.ts` (builds to `web/dist/`; inlines `@cyoda/workflow-react` like the dev-console test config):
  ```ts
  import { defineConfig } from "vite";
  import react from "@vitejs/plugin-react";
  import { fileURLToPath } from "node:url";
  import { dirname, resolve } from "node:path";

  const here = dirname(fileURLToPath(import.meta.url));

  export default defineConfig({
    root: here,
    plugins: [react()],
    build: { outDir: resolve(here, "dist"), emptyOutDir: true, target: "esnext", sourcemap: true },
  });
  ```
- [ ] Write `web/tsconfig.json`:
  ```json
  { "extends": "../../../tsconfig.base.json", "compilerOptions": { "noEmit": true, "types": ["node"] }, "include": ["src"] }
  ```
- [ ] Write `web/src/main.tsx`:
  ```tsx
  import { createRoot } from "react-dom/client";
  import { ThemeProvider } from "@cyoda/console-design-system";
  import { App } from "./App.js";

  createRoot(document.getElementById("root")!).render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
  ```
- [ ] Write `web/src/sseClient.ts`:
  ```tsx
  import type { WorkflowUiMeta } from "@cyoda/workflow-core";

  export type SseEvent =
    | { type: "show"; workflow: string; revision: number; content: string; layout: Record<string, WorkflowUiMeta> }
    | { type: "content"; workflow: string; revision: number; content: string }
    | { type: "layout"; workflow: string; revision: number; layout: Record<string, WorkflowUiMeta>; origin?: string };

  /** Subscribe to `/events` for this tab's origin; the browser auto-retries + the
   *  server replays the shown workflow on (re)connect. */
  export function subscribe(origin: string, onEvent: (e: SseEvent) => void): () => void {
    const es = new EventSource(`/events?origin=${encodeURIComponent(origin)}`);
    es.onmessage = (ev) => { try { onEvent(JSON.parse(ev.data) as SseEvent); } catch { /* ignore keep-alive */ } };
    return () => es.close();
  }
  ```
- [ ] Write `web/src/App.tsx`:
  ```tsx
  import { useEffect, useRef, useState } from "react";
  import type { WorkflowUiMeta } from "@cyoda/workflow-core";
  import { subscribe } from "./sseClient.js";
  import type { SseEvent } from "./sseClient.js";
  import { EditorView } from "./EditorView.js";

  const TOKEN: string = (window as unknown as { __MODEL_EDITOR__?: { token: string } }).__MODEL_EDITOR__?.token ?? "";
  const ORIGIN = crypto.randomUUID();

  interface Shown { workflow: string; content: string; layout: Record<string, WorkflowUiMeta>; layoutRev: number }

  export function App() {
    const [shown, setShown] = useState<Shown | null>(null);
    const [externalContent, setExternalContent] = useState<string | null>(null);
    const draggingRef = useRef(false);
    const deferredRef = useRef<Extract<SseEvent, { type: "layout" }> | null>(null);

    useEffect(() => {
      const onDown = () => { draggingRef.current = true; };
      const onUp = () => {
        draggingRef.current = false;
        const d = deferredRef.current;
        if (d) { deferredRef.current = null; applyLayout(d.layout); }
      };
      window.addEventListener("pointerdown", onDown);
      window.addEventListener("pointerup", onUp);
      return () => { window.removeEventListener("pointerdown", onDown); window.removeEventListener("pointerup", onUp); };
    }, []);

    function applyLayout(layout: Record<string, WorkflowUiMeta>): void {
      setShown((s) => (s ? { ...s, layout, layoutRev: s.layoutRev + 1 } : s));
    }

    useEffect(() => subscribe(ORIGIN, (e) => {
      if (e.type === "show") { setExternalContent(null); setShown({ workflow: e.workflow, content: e.content, layout: e.layout, layoutRev: 0 }); }
      else if (e.type === "content") { setShown((s) => (s && s.workflow === e.workflow ? (setExternalContent(e.content), s) : s)); }
      else if (e.type === "layout") {
        if (e.origin === ORIGIN) return;                       // echo suppression
        setShown((s) => {
          if (!s || s.workflow !== e.workflow) return s;
          if (draggingRef.current) { deferredRef.current = e; return s; } // mid-drag defer
          return { ...s, layout: e.layout, layoutRev: s.layoutRev + 1 };
        });
      }
    }), []);

    if (!shown) {
      return <div style={{ padding: 24, fontFamily: "system-ui" }}>Waiting for Claude to <code>show_workflow</code>…</div>;
    }
    return (
      <EditorView
        key={shown.workflow}
        token={TOKEN}
        origin={ORIGIN}
        workflow={shown.workflow}
        content={shown.content}
        layout={shown.layout}
        layoutRev={shown.layoutRev}
        externalContent={externalContent}
        onDismissExternal={() => setExternalContent(null)}
      />
    );
  }
  ```
- [ ] Write `web/src/EditorView.tsx` (mirrors `routes/workflow.tsx` session wiring: seeds remapped layout into `session.layoutKey`, `WorkflowEditorHostPanel` in editor mode with **no** `jsonEditorConfig`, `ExternalChangeBanner` for Claude-changed-underneath, layout write-back via `onWorkflowUiChange` → `POST /layout`; content-save warns):
  ```tsx
  import { useCallback, useEffect, useMemo, useRef, useState } from "react";
  import type { WorkflowUiMeta } from "@cyoda/workflow-core";
  import { parseImportPayload } from "@cyoda/workflow-core";
  import { useEditorSession, WorkflowEditorHostPanel, ExternalChangeBanner } from "@cyoda/workflow-editor-host";

  export function EditorView({
    token, origin, workflow, content, layout, layoutRev, externalContent, onDismissExternal,
  }: {
    token: string; origin: string; workflow: string; content: string;
    layout: Record<string, WorkflowUiMeta>; layoutRev: number;
    externalContent: string | null; onDismissExternal: () => void;
  }) {
    const contentRef = useRef(content);
    useEffect(() => { contentRef.current = externalContent ?? content; }, [content, externalContent]);

    // Browser is a viewer of disk: read serves the latest pushed content; write is
    // NOT wired in v1 — it warns (content is single-writer = Claude).
    const io = useMemo(() => ({
      read: async () => ({ contents: contentRef.current, lastModified: new Date().toISOString() }),
      write: async () => { throw new Error("Content is read-only here — changes go through Claude."); },
    }), []);

    const session = useEditorSession({ projectId: "model-editor", filePath: `${workflow}.json`, initialContents: content, io });

    // Seed the (already server-remapped) layout into the editor's localStorage key,
    // re-seeding + remounting the canvas when a live layout push bumps layoutRev.
    const [layoutReady, setLayoutReady] = useState(false);
    useEffect(() => {
      localStorage.setItem(session.layoutKey, JSON.stringify(layout));
      setLayoutReady(true);
    }, [session.layoutKey, layoutRev, layout]);

    // Claude changed the shown file underneath the human → ExternalChangeBanner.
    const [banner, setBanner] = useState(false);
    useEffect(() => { if (externalContent != null) setBanner(true); }, [externalContent]);
    const onReload = () => {
      if (externalContent != null) {
        const r = parseImportPayload(externalContent, session.document?.meta);
        if (r.document) session.applyExternalDocument(r.document);
      }
      setBanner(false);
      onDismissExternal();
    };

    // Layout write-back: debounce → POST /layout with the session token + tab origin.
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onWorkflowUiChange = useCallback((workflowUi: Record<string, WorkflowUiMeta>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (Object.keys(workflowUi).length === 0) return;
        void fetch("/layout", {
          method: "POST",
          headers: { "content-type": "application/json", "x-session-token": token, "x-origin": origin },
          body: JSON.stringify({ name: workflow, workflowUi }),
        });
      }, 600);
    }, [token, origin, workflow]);

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {banner ? (
          <ExternalChangeBanner onReload={onReload} onIgnore={() => { setBanner(false); onDismissExternal(); }} dirty={session.dirty} />
        ) : null}
        <div style={{ flex: 1, minHeight: 0 }} key={`${workflow}:${layoutRev}`}>
          {layoutReady ? (
            <WorkflowEditorHostPanel
              session={session}
              onWorkflowUiChange={onWorkflowUiChange}
              onSaveRequest={() => window.alert("Content changes go through Claude — layout drags persist, content edits do not.")}
            />
          ) : null}
        </div>
      </div>
    );
  }
  ```
- [ ] Verify the web bundle builds: `pnpm --filter model-editor-mcp exec vite build --config web/vite.config.ts` → expect `web/dist/index.html` + hashed assets, and grep that `__SESSION_TOKEN__` survives into `web/dist/index.html`.
- [ ] `git add apps/model-editor-mcp/web && git commit -m "feat(model-editor-mcp): browser editor shell — editor mode, SSE, layout write-back, external-change banner"`

---

### Task 13: Browser-render smoke (`@playwright/test`) — headless Chromium over real MCP stdio

**Files:**
- Create `apps/model-editor-mcp/playwright.config.ts`
- Create `apps/model-editor-mcp/e2e/smoke.spec.ts`
- Create `apps/model-editor-mcp/e2e/fixtures/Pledge.json`
- Create `apps/model-editor-mcp/e2e/fixtures/LegalEntity.json`

**Interfaces:**
- Consumes the built `dist/index.js` (server) + `web/dist/` (bundle) — the plan's global build step (`pnpm -r build`) must run first; drives `show_workflow` by writing JSON-RPC lines to the child's stdin.

**Steps:**
- [ ] Write `e2e/fixtures/Pledge.json`:
  ```json
  { "importMode": "MERGE", "workflows": [ { "version": "1", "name": "Pledge", "initialState": "none", "active": true, "states": { "none": { "transitions": [ { "name": "create", "next": "created", "manual": false, "disabled": false } ] }, "created": { "transitions": [ { "name": "settle", "next": "settled", "manual": false, "disabled": false } ] }, "settled": { "transitions": [] } } } ] }
  ```
- [ ] Write `e2e/fixtures/LegalEntity.json`:
  ```json
  { "importMode": "MERGE", "workflows": [ { "version": "1", "name": "LegalEntity", "initialState": "draft", "active": true, "states": { "draft": { "transitions": [ { "name": "submit", "next": "review", "manual": false, "disabled": false } ] }, "review": { "transitions": [ { "name": "approve", "next": "active", "manual": true, "disabled": false } ] }, "active": { "transitions": [] } } } ] }
  ```
- [ ] Write `playwright.config.ts`:
  ```ts
  import { defineConfig } from "@playwright/test";

  export default defineConfig({
    testDir: "e2e",
    fullyParallel: false,
    use: { headless: true },
    reporter: [["list"]],
    timeout: 60_000,
  });
  ```
- [ ] Write `e2e/smoke.spec.ts`:
  ```ts
  import { test, expect } from "@playwright/test";
  import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
  import { mkdtemp, cp, rm } from "node:fs/promises";
  import { tmpdir } from "node:os";
  import { fileURLToPath } from "node:url";
  import { dirname, join } from "node:path";

  const here = dirname(fileURLToPath(import.meta.url));
  const serverEntry = join(here, "..", "dist", "index.js");

  let child: ChildProcessWithoutNullStreams;
  let fixture: string;
  let rpcId = 0;

  function rpc(method: string, params?: unknown): void {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params })}\n`);
  }

  async function waitForUrl(): Promise<string> {
    return new Promise((resolve, reject) => {
      let buf = "";
      const to = setTimeout(() => reject(new Error("server never printed URL")), 20_000);
      child.stderr.on("data", (b: Buffer) => {
        buf += b.toString("utf8");
        const m = buf.match(/model-editor-mcp: (http:\/\/127\.0\.0\.1:\d+\/\S*)/);
        if (m) { clearTimeout(to); resolve(m[1]!); }
      });
    });
  }

  test.beforeAll(async () => {
    fixture = await mkdtemp(join(tmpdir(), "mem-e2e-"));
    await cp(join(here, "fixtures", "Pledge.json"), join(fixture, "Pledge.json"));
    await cp(join(here, "fixtures", "LegalEntity.json"), join(fixture, "LegalEntity.json"));
    child = spawn("node", [serverEntry, "--project", fixture], { stdio: ["pipe", "pipe", "pipe"] });
    rpc("initialize");
  });

  test.afterAll(async () => { child.kill("SIGINT"); await rm(fixture, { recursive: true, force: true }); });

  test("renders reactflow nodes and live-swaps between workflows over MCP stdio", async ({ page }) => {
    const url = await waitForUrl();
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(url);

    rpc("tools/call", { name: "show_workflow", arguments: { name: "Pledge" } });
    await expect(page.locator(".react-flow__node")).toHaveCount(3, { timeout: 15_000 }); // none, created, settled
    const pledgeNodes = await page.locator(".react-flow__node").allInnerTexts();
    expect(pledgeNodes.join(" ")).toContain("none");

    rpc("tools/call", { name: "show_workflow", arguments: { name: "LegalEntity" } });
    await expect(page.locator(".react-flow__node")).toHaveCount(3, { timeout: 15_000 }); // draft, review, active
    const legalNodes = await page.locator(".react-flow__node").allInnerTexts();
    expect(legalNodes.join(" ")).toContain("draft");
    expect(legalNodes.join(" ")).not.toContain("none");

    expect(errors).toEqual([]);
  });
  ```
- [ ] Run `pnpm -r build` (produces `dist/index.js` + `web/dist/`), then `pnpm --filter model-editor-mcp exec playwright install chromium`, then `pnpm --filter model-editor-mcp test:e2e` → expect PASS.
- [ ] `git add apps/model-editor-mcp/playwright.config.ts apps/model-editor-mcp/e2e && git commit -m "test(model-editor-mcp): headless-chromium render smoke over real MCP stdio"`

---

### Task 14: `.mcp.json` example + README + CI wiring

**Files:**
- Create `apps/model-editor-mcp/.mcp.json.example`
- Create `apps/model-editor-mcp/README.md`
- Modify `.github/workflows/ci.yml`

**Interfaces:**
- Consumes the built `dist/index.js`; registers the server for Claude Code.

**Steps:**
- [ ] Write `apps/model-editor-mcp/.mcp.json.example`:
  ```json
  {
    "mcpServers": {
      "model-editor": {
        "command": "node",
        "args": ["apps/model-editor-mcp/dist/index.js", "--project", "."]
      }
    }
  }
  ```
- [ ] Write `apps/model-editor-mcp/README.md` — first line states it is the MCP server; then usage:
  ```markdown
  # model-editor-mcp

  This is the MCP server for a live, browser-rendered Cyoda model editor (workflows, v1).

  Claude Code spawns it over stdio (see `.mcp.json.example`); it serves the real
  `@cyoda/workflow-react` editor at a deterministic `http://127.0.0.1:<port>/` and
  pushes live updates over SSE. Claude drives content (`update_workflow`, validated)
  and layout (`optimize_layout`); the human arranges the canvas (drags persist via
  `POST /layout`). Ask Claude for the URL any time via `connection_info`.

  ## Tools
  - `list_workflows()` → `[{ name, path, states, transitions, valid }]`
  - `show_workflow(name)` — render it in the browser + return the parsed document
  - `update_workflow(name, content)` — validated whole-document write + diff (writes nothing on failure)
  - `optimize_layout(name, options?)` — elkjs re-layout; `options`: `{ orientation?, preset?, nodeSize?, pinned? }`
  - `validate_workflow(name)` — diagnostics, read-only
  - `connection_info()` — the browser URL/port

  ## Develop
  - `pnpm --filter model-editor-mcp build` — compile the server (`dist/`) and the web bundle (`web/dist/`)
  - `pnpm --filter model-editor-mcp test` — unit/integration (vitest, node env)
  - `pnpm --filter model-editor-mcp test:e2e` — headless-chromium render smoke (build first)

  Content is single-writer (Claude) in v1: browser content edits warn and do not
  persist; layout drags do. Register locally by copying `.mcp.json.example` to
  `.mcp.json` at the repo root.
  ```
- [ ] Modify `.github/workflows/ci.yml` — after `pnpm -r test` in the `js` job, add the render-smoke steps (build already ran via `pnpm -r build`; the app's `build` script produces both `dist/` and `web/dist/`):
  ```yaml
      - run: pnpm -r test
      - run: pnpm --filter model-editor-mcp exec playwright install chromium
      - run: pnpm --filter model-editor-mcp test:e2e
  ```
- [ ] Run the full app suite locally to confirm green: `pnpm --filter model-editor-mcp build && pnpm --filter model-editor-mcp test && pnpm --filter model-editor-mcp exec playwright install chromium && pnpm --filter model-editor-mcp test:e2e`.
- [ ] Run `pnpm typecheck` and `pnpm lint` at the repo root → expect PASS (fix any type/lint fallout in the new app before committing).
- [ ] `git add apps/model-editor-mcp/.mcp.json.example apps/model-editor-mcp/README.md .github/workflows/ci.yml && git commit -m "chore(model-editor-mcp): .mcp.json example, README, CI render-smoke on every PR"`

---
