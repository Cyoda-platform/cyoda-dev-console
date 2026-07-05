# Model Editor MCP — Full-Editor Expansion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the already-shipped `apps/model-editor-mcp/` (headless MCP server + browser-rendered `@cyoda/workflow-react` workflow editor, workflows-only, 14 tasks green) into the full-editor scope restored by `docs/superpowers/specs/2026-07-04-model-editor-mcp-design.md`'s "Full-editor scope expansion": Claude CRUDs **entities** (separate plain-JSON object files) alongside workflows via explicit, narrow, Claude-set `entityGlobs`/`workflowGlobs` (`configure_project`/`get_project`, no auto-scan); the browser gains a **read-only Monaco JSON pane**, a **read-only entity JSON-tree view**, and **self-service navigation** (a workflow/entity picker) — all without opening any new content-write surface.

**Architecture:** Same one-process, two-face server (`server/mcp.ts` stdio north to Claude, `server/http.ts` HTTP+SSE south to the browser) and the same "file-watch is the only writer the browser hears from" model. This expansion adds a second discovery axis — `entityGlobs`, narrow-glob only, never a full-tree scan+classify — alongside the existing `workflowGlobs`; both become **runtime-mutable** on `ToolContext` so `configure_project` can update them mid-session, with `discover()`/`discoverEntities()` and the fs watcher always reading the *current* value. Three new loopback-gated, name-allowlisted `GET /api/*` read endpoints let the browser navigate independently of Claude's `show_workflow` push. The browser adds a collapsible picker sidebar and two new read-only view components (`MonacoJsonViewer`, `EntityViewer`+`JsonTree`, both ported from `apps/dev-console`) alongside the unmodified `@cyoda/workflow-react` editor. `POST /layout` remains the *only* state-changing request the browser can make — nothing in this expansion adds a second one.

**Tech Stack:** adds `monaco-editor` (workspace catalog, already pinned at `0.55.1`, matching `apps/dev-console`'s use) and `lucide-react` (`^1.23.0`, matching `apps/dev-console`'s pin — `JsonTree.tsx` uses its `ChevronRight` icon) to `apps/model-editor-mcp/package.json`. No other new runtime or dev dependency: entity/project tools reuse `zod`, `@cyoda/agent-bridge-contract`'s `McpResult`, and the existing confined-IO/discovery/SSE/HTTP plumbing; the two new web view components reuse `@cyoda/console-design-system` (`ThemeProvider`, `useTokens`, `WarningBanner`, `Tabs`) already in the app's dependency tree via `@cyoda/workflow-editor-host`.

## Global Constraints

- **Explicit, narrow, Claude-set discovery locations only — no whole-tree scan+classify, ever.** `discoverWorkflows`/`discoverEntities` glob *only* the current `workflowGlobs`/`entityGlobs`; `configure_project` is the sole way those change, mid-session, **never persisted to disk** (matches the parked branch's D3/§3.6 invariant, re-affirmed for this headless server: no `config.json` write, ever).
- **An entity is a separate plain-JSON *object* file** (e.g. `models/schema/v1/CollateralAsset.json`), never embedded in a workflow. `discoverEntities` takes each `entityGlobs`-matched file that parses to a JSON object as an entity and **skips parse-errors and non-objects silently** — no `classifyWorkflowFile` call, no full-tree walk. Entity tools are **name-based** (name = file stem, resolved against `entityGlobs`), exactly like the workflow tools (`findByName`/`findEntityByName`).
- **Content stays Claude-owned everywhere this expansion touches.** The graph pane is unchanged (still warns, doesn't strip). The new JSON pane and the new entity Tree/JSON panes are **read-only**. There is **no browser content-write path anywhere in this expansion** — `POST /layout` remains the only state-changing request the browser can issue; nothing here adds a second one.
- **The three new `GET /api/*` read endpoints carry the same trust boundary as the existing surface**: loopback-only Origin/Host gate (`isLoopback`, shared with `/events`/`/_id`/`POST /layout`) and the requested `:name` is **allowlisted against live discovery** (`findByName`/`findEntityByName`) before it is ever used to resolve a path — the identical guard `POST /layout` already applies, not a new one.
- **The read-only JSON view is a *separate* `MonacoJsonViewer` pane**, never the `@cyoda/workflow-react` editor's built-in `jsonEditor` tab — that tab is read-only *only* in `mode:"viewer"`, which also freezes the graph (kills layout drag), and there is no upstream change to `@cyoda/workflow-react` in scope.
- **`ToolContext.workflowGlobs`/`entityGlobs` are runtime-mutable**: exposed as live getters backed by a private holder, so a `configure_project` call is visible to the *very next* `discover()`/`discoverEntities()` call and to the fs watcher (which reads them fresh per fs event via a getter function, not a value captured once at startup).
- **Every tool result is still the `@cyoda/agent-bridge-contract` `McpResult` envelope** (`ok`/`err` from `envelope.ts`) — the new tools add no second result shape.
- **All new server-side IO goes through the existing confined layer** (`readConfined`/`writeConfined`/the new `rmConfined`, all gated by `resolveInsideRoot`) — no direct `node:fs` calls inside any tool handler.

---

### Task 15: `files.ts` (`rmConfined`) + `context.ts` (runtime-mutable `workflowGlobs`/`entityGlobs`, `deleteFile`, `discoverEntities`) + `discovery.ts` (`discoverEntities`/`findEntityByName`/`resolveEntityCreatePath`) + `watch.ts`/`index.ts` (live globs, narrow CLI defaults)

This is the plumbing task the whole expansion sits on: making `entityGlobs` exist and making both glob lists genuinely mutable at runtime touches every file that currently captures `workflowGlobs` once at construction, plus every existing test fixture that builds a `ToolContext` literal (adding required fields to that interface is a breaking change for those fixtures — fixed here, in the same task, so the suite stays green throughout).

**Files:**
- Modify `apps/model-editor-mcp/server/files.ts` (add `rmConfined`)
- Modify `apps/model-editor-mcp/server/__tests__/files.test.ts` (add `rmConfined` cases)
- Create `apps/model-editor-mcp/server/cliArgs.ts` (narrow default globs + `parseGlobsArg`)
- Create `apps/model-editor-mcp/server/__tests__/cliArgs.test.ts`
- Modify `apps/model-editor-mcp/server/discovery.ts` (add `discoverEntities`, `findEntityByName`, `resolveEntityCreatePath`)
- Modify `apps/model-editor-mcp/server/__tests__/discovery.test.ts` (add cases for the three new exports)
- Modify `apps/model-editor-mcp/server/context.ts` (add `entityGlobs`, `deleteFile`, `discoverEntities`, `setGlobs`; make globs live getters)
- Create `apps/model-editor-mcp/server/__tests__/context.test.ts`
- Modify `apps/model-editor-mcp/server/watch.ts` (`workflowGlobs: string[]` → `getWorkflowGlobs: () => string[]`)
- Modify `apps/model-editor-mcp/server/__tests__/watch.test.ts` (update the 5 `createWatcher(...)` call sites)
- Modify `apps/model-editor-mcp/server/index.ts` (CLI flags `--workflow-globs`/`--entity-globs`, wire `createToolContext`/`createWatcher`)
- Modify `apps/model-editor-mcp/server/__tests__/tools.test.ts`, `optimize_layout.test.ts`, `index.test.ts` (their local `ctx()` fakes gain `entityGlobs`/`deleteFile`/`discoverEntities`/`setGlobs` to satisfy the widened `ToolContext`)
- Modify `apps/model-editor-mcp/e2e/smoke.spec.ts` (fixtures move under `models/workflow/` to match the new narrow default — otherwise the already-green Task 13 smoke test goes red the moment the CLI default changes)

**Interfaces:**
- Produces (`files.ts`): `export function rmConfined(root: string, relativePath: string): Promise<void>;`
- Produces (`cliArgs.ts`):
  ```ts
  export const DEFAULT_WORKFLOW_GLOBS: string[];
  export const DEFAULT_ENTITY_GLOBS: string[];
  export function parseGlobsArg(raw: string | undefined, fallback: string[]): string[];
  ```
- Produces (`discovery.ts`, additive):
  ```ts
  export interface EntityFileEntry { relativePath: string; name: string }
  export function discoverEntities(root: string, entityGlobs: string[]): Promise<EntityFileEntry[]>;
  export function findEntityByName(entries: EntityFileEntry[], name: string): EntityFileEntry | undefined;
  export function resolveEntityCreatePath(entityGlobs: string[], name: string): string;
  ```
- Produces (`context.ts`, widened):
  ```ts
  export interface ToolContext {
    root: string;
    workflowGlobs: string[];       // live getter in createToolContext's production object
    entityGlobs: string[];         // live getter in createToolContext's production object
    connectionUrl: string;
    read(rel: string): Promise<{ contents: string; lastModified: string; sizeBytes: number }>;
    write(rel: string, contents: string): Promise<{ path: string; lastModified: string; sizeBytes: number }>;
    deleteFile(rel: string): Promise<void>;
    discover(): Promise<WorkflowFileIndexEntry[]>;
    discoverEntities(): Promise<EntityFileEntry[]>;
    setGlobs(patch: { workflowGlobs?: string[]; entityGlobs?: string[] }): void;
    parseImport: typeof parseImportPayload;
    serializeImport: typeof serializeImportPayload;
    validate: typeof validateAll;
  }
  export function createToolContext(opts: { root: string; workflowGlobs: string[]; entityGlobs: string[]; connectionUrl: string }): ToolContext;
  ```
- Produces (`watch.ts`, changed): `export function createWatcher(opts: { root: string; getWorkflowGlobs: () => string[]; onChange: (c: WorkflowChange) => void; debounceMs?: number }): Watcher;`
- Consumed by Tasks 16–19 (`ctx.entityGlobs`, `ctx.deleteFile`, `ctx.discoverEntities`, `ctx.setGlobs`, `resolveEntityCreatePath`, `findEntityByName`).

**Steps:**

- [ ] **`rmConfined`** — write the failing test, appended to `server/__tests__/files.test.ts` (new `describe` block, after the existing `writeConfined` block):
  ```ts
  import { rmConfined } from "../files.js"; // add to the existing named-import line at the top
  ```
  ```ts
  describe("rmConfined", () => {
    it("deletes a file inside the root", async () => {
      await writeFile(join(root, "e.json"), "{}");
      await rmConfined(root, "e.json");
      await expect(readFile(join(root, "e.json"), "utf8")).rejects.toThrow();
    });
    it("rejects a traversal path without deleting anything", async () => {
      await writeFile(join(root, "e.json"), "{}");
      await expect(rmConfined(root, "../e.json")).rejects.toBeInstanceOf(ConfinementError);
      expect(await readFile(join(root, "e.json"), "utf8")).toBe("{}"); // untouched
    });
    it("rejects deleting a path that symlinks outside the root", async () => {
      const outside = await mkdtemp(join(tmpdir(), "mem-out-"));
      await writeFile(join(outside, "secret.json"), "{}");
      await symlink(join(outside, "secret.json"), join(root, "link.json"));
      await expect(rmConfined(root, "link.json")).rejects.toBeInstanceOf(ConfinementError);
      await rm(outside, { recursive: true, force: true });
    });
    it("propagates ENOENT for a nonexistent (but confined) path", async () => {
      await expect(rmConfined(root, "nope.json")).rejects.toThrow();
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/files.test.ts` → expect FAIL (`rmConfined` not exported).
- [ ] Add `rmConfined` to `server/files.ts` (append; reuses the already-imported `rm` and `resolveInsideRoot`):
  ```ts
  /** Delete `relativePath` inside `root`, confined via `resolveInsideRoot` — the
   *  same canonicalize+prefix-check every other confined op uses. Existence is the
   *  CALLER's job (entity tools already check via `findEntityByName` before calling
   *  this); a nonexistent-but-confined path surfaces as a normal ENOENT. */
  export async function rmConfined(root: string, relativePath: string): Promise<void> {
    const abs = await resolveInsideRoot(root, relativePath);
    await rm(abs, { force: false });
  }
  ```
- [ ] Run the test again → expect PASS.

- [ ] **`cliArgs.ts`** — write the failing test `server/__tests__/cliArgs.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { DEFAULT_WORKFLOW_GLOBS, DEFAULT_ENTITY_GLOBS, parseGlobsArg } from "../cliArgs.js";

  describe("parseGlobsArg", () => {
    it("falls back to the given default when the flag is omitted", () => {
      expect(parseGlobsArg(undefined, DEFAULT_WORKFLOW_GLOBS)).toBe(DEFAULT_WORKFLOW_GLOBS);
    });
    it("splits a comma-separated value and trims whitespace", () => {
      expect(parseGlobsArg("a/**/*.json, b/*.json", ["x"])).toEqual(["a/**/*.json", "b/*.json"]);
    });
    it("an explicitly empty string opts out entirely (returns []), not the default", () => {
      expect(parseGlobsArg("", ["x"])).toEqual([]);
    });
  });

  describe("narrow project-convention defaults", () => {
    it("are scoped subdirectories, not a full-tree **/*.json", () => {
      expect(DEFAULT_WORKFLOW_GLOBS).toEqual(["models/workflow/**/*.json"]);
      expect(DEFAULT_ENTITY_GLOBS).toEqual(["models/schema/**/*.json"]);
    });
  });
  ```
- [ ] Run it → expect FAIL (module not found).
- [ ] Write `server/cliArgs.ts`:
  ```ts
  /** Narrow, convention-following defaults — never `**\/*.json` (design: "no
   *  auto-scan"). `--workflow-globs`/`--entity-globs` override these. */
  export const DEFAULT_WORKFLOW_GLOBS: string[] = ["models/workflow/**/*.json"];
  export const DEFAULT_ENTITY_GLOBS: string[] = ["models/schema/**/*.json"];

  /** Parse a comma-separated `--workflow-globs`/`--entity-globs` CLI value into a
   *  glob array, falling back to `fallback` when the flag is omitted entirely. An
   *  explicitly empty string (`--entity-globs ""`) yields `[]` — a deliberate
   *  opt-out of that discovery kind, not "use the default". */
  export function parseGlobsArg(raw: string | undefined, fallback: string[]): string[] {
    if (raw === undefined) return fallback;
    return raw.split(",").map((g) => g.trim()).filter(Boolean);
  }
  ```
- [ ] Run the test again → expect PASS.

- [ ] **`discoverEntities`/`findEntityByName`/`resolveEntityCreatePath`** — write the failing tests, appended to `server/__tests__/discovery.test.ts`:
  ```ts
  import { discoverEntities, findEntityByName, resolveEntityCreatePath } from "../discovery.js"; // extend the existing import line
  ```
  ```ts
  describe("discoverEntities", () => {
    it("takes each entityGlobs-matched JSON OBJECT file as an entity, named by file stem", async () => {
      await mkdir(join(root, "models/schema/v1"), { recursive: true });
      await writeFile(join(root, "models/schema/v1/CollateralAsset.json"), JSON.stringify({ type: "object", properties: {} }));
      await writeFile(join(root, "models/schema/v1/NotAnObject.json"), JSON.stringify(["a", "b"]));
      await writeFile(join(root, "models/schema/v1/Broken.json"), "{not json");
      await writeFile(join(root, "unrelated.json"), JSON.stringify({ foo: "bar" }));
      const entities = await discoverEntities(root, ["models/schema/**/*.json"]);
      expect(entities).toEqual([{ relativePath: "models/schema/v1/CollateralAsset.json", name: "CollateralAsset" }]);
    });
    it("returns nothing when entityGlobs is empty — no full-tree fallback", async () => {
      await writeFile(join(root, "x.json"), JSON.stringify({ a: 1 }));
      expect(await discoverEntities(root, [])).toEqual([]);
    });
    it("excludes node_modules/.git/dist like discoverWorkflows does", async () => {
      await mkdir(join(root, "node_modules/pkg"), { recursive: true });
      await writeFile(join(root, "node_modules/pkg/Fake.json"), JSON.stringify({ a: 1 }));
      expect(await discoverEntities(root, ["**/*.json"])).toEqual([]);
    });
  });

  describe("findEntityByName", () => {
    it("matches by file stem", () => {
      const entities = [{ relativePath: "models/schema/v1/CollateralAsset.json", name: "CollateralAsset" }];
      expect(findEntityByName(entities, "CollateralAsset")?.relativePath).toBe("models/schema/v1/CollateralAsset.json");
      expect(findEntityByName(entities, "Nope")).toBeUndefined();
    });
  });

  describe("resolveEntityCreatePath", () => {
    it("derives the literal directory prefix before the first wildcard segment", () => {
      expect(resolveEntityCreatePath(["models/schema/**/*.json"], "Foo")).toBe("models/schema/Foo.json");
      expect(resolveEntityCreatePath(["models/schema/v1/*.json"], "Foo")).toBe("models/schema/v1/Foo.json");
    });
    it("falls back to the project root when the pattern has no directory", () => {
      expect(resolveEntityCreatePath(["*.json"], "Foo")).toBe("Foo.json");
    });
    it("uses the FIRST configured glob when several are set", () => {
      expect(resolveEntityCreatePath(["a/*.json", "b/*.json"], "Foo")).toBe("a/Foo.json");
    });
    it("throws when no entityGlobs are configured", () => {
      expect(() => resolveEntityCreatePath([], "Foo")).toThrow();
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/discovery.test.ts` → expect FAIL.
- [ ] Append to `server/discovery.ts` (reuses the file's existing private `walk`, `EXCLUDED_DIRS`, and the already-imported `matchGlob`/`readConfined`):
  ```ts
  export interface EntityFileEntry { relativePath: string; name: string }

  function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function fileStem(relativePath: string): string {
    return (relativePath.split("/").pop() ?? relativePath).replace(/\.json$/, "");
  }

  /**
   * Narrow-glob entity discovery (design: "glob only `entityGlobs`; take each
   * matched file that parses to a JSON object as an entity; skip parse-errors" —
   * deliberately NOT the parked branch's full-tree scan+classify). An entity is a
   * separate plain-JSON *object* file, never embedded in a workflow; its name is
   * its file stem, matching the workflow tools' name-based convention. No
   * `classifyWorkflowFile` call here — that machinery answers "is this a
   * workflow?", a different question, and running it over every entity file
   * would be pure waste.
   */
  export async function discoverEntities(root: string, entityGlobs: string[]): Promise<EntityFileEntry[]> {
    if (entityGlobs.length === 0) return [];
    const out: EntityFileEntry[] = [];
    for await (const abs of walk(root)) {
      const rel = relative(root, abs).split(sep).join("/");
      if (!rel.endsWith(".json") || rel.endsWith(".layout.json")) continue;
      if (!entityGlobs.some((g) => matchGlob(rel, g))) continue;
      let contents: string;
      try {
        contents = (await readConfined(root, rel)).contents;
      } catch {
        continue; // vanished mid-scan — same tolerance as discoverWorkflows
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(contents);
      } catch {
        process.stderr.write(`[discovery] skipping entity ${rel}: invalid JSON\n`);
        continue;
      }
      if (!isPlainObject(parsed)) continue; // arrays/primitives are not entities
      out.push({ relativePath: rel, name: fileStem(rel) });
    }
    out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return out;
  }

  /** Entities have no declared-name concept distinct from the file stem (unlike
   *  workflows, which can rename themselves inside the document) — so this is a
   *  plain stem match, no basename fallback needed. */
  export function findEntityByName(entries: EntityFileEntry[], name: string): EntityFileEntry | undefined {
    return entries.find((e) => e.name === name);
  }

  /**
   * Derive a NEW entity's destination path from `name` alone. The name-based tool
   * design (`create_entity(name, content)`, no `path` argument) has no explicit
   * destination input, so this is the concrete rule that makes it buildable: take
   * the FIRST configured `entityGlobs` pattern's literal directory prefix — the
   * path segments before the first one containing a glob wildcard (`*`) — and
   * join `<name>.json` beneath it.
   */
  export function resolveEntityCreatePath(entityGlobs: string[], name: string): string {
    const pattern = entityGlobs[0];
    if (pattern === undefined) throw new Error("no entityGlobs configured — call configure_project first");
    const segments = pattern.split("/");
    const wildcardIdx = segments.findIndex((seg) => seg.includes("*"));
    const dirSegments = wildcardIdx === -1 ? segments.slice(0, -1) : segments.slice(0, wildcardIdx);
    return dirSegments.length > 0 ? `${dirSegments.join("/")}/${name}.json` : `${name}.json`;
  }
  ```
- [ ] Run the test again → expect PASS.

- [ ] **`context.ts`** — write the failing test `server/__tests__/context.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
  import { tmpdir } from "node:os";
  import { join } from "node:path";
  import { createToolContext } from "../context.js";

  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "mem-ctx-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  describe("createToolContext", () => {
    it("deleteFile removes a confined file via rmConfined", async () => {
      await mkdir(join(root, "models/schema"), { recursive: true });
      await writeFile(join(root, "models/schema/Foo.json"), "{}");
      const ctx = createToolContext({ root, workflowGlobs: [], entityGlobs: ["models/schema/**/*.json"], connectionUrl: "http://x" });
      await ctx.deleteFile("models/schema/Foo.json");
      await expect(readFile(join(root, "models/schema/Foo.json"), "utf8")).rejects.toThrow();
    });

    it("discoverEntities scopes to entityGlobs, independent of workflowGlobs", async () => {
      await mkdir(join(root, "models/schema"), { recursive: true });
      await mkdir(join(root, "models/workflow"), { recursive: true });
      await writeFile(join(root, "models/schema/Foo.json"), JSON.stringify({ type: "object" }));
      await writeFile(join(root, "models/workflow/Bar.json"), JSON.stringify({ importMode: "MERGE", workflows: [] }));
      const ctx = createToolContext({ root, workflowGlobs: ["models/workflow/**/*.json"], entityGlobs: ["models/schema/**/*.json"], connectionUrl: "http://x" });
      expect((await ctx.discoverEntities()).map((e) => e.name)).toEqual(["Foo"]);
    });

    it("setGlobs mutates entityGlobs LIVE — the very next discoverEntities() call sees it", async () => {
      await mkdir(join(root, "alt"), { recursive: true });
      await writeFile(join(root, "alt/Extra.json"), JSON.stringify({ type: "object" }));
      const ctx = createToolContext({ root, workflowGlobs: [], entityGlobs: ["models/schema/**/*.json"], connectionUrl: "http://x" });
      expect(await ctx.discoverEntities()).toEqual([]);

      ctx.setGlobs({ entityGlobs: ["alt/*.json"] });

      expect(ctx.entityGlobs).toEqual(["alt/*.json"]);
      expect((await ctx.discoverEntities()).map((e) => e.name)).toEqual(["Extra"]);
    });

    it("setGlobs leaves an omitted glob list unchanged", () => {
      const ctx = createToolContext({ root, workflowGlobs: ["models/workflow/**/*.json"], entityGlobs: ["models/schema/**/*.json"], connectionUrl: "http://x" });
      ctx.setGlobs({ entityGlobs: ["other/**/*.json"] });
      expect(ctx.workflowGlobs).toEqual(["models/workflow/**/*.json"]);
      expect(ctx.entityGlobs).toEqual(["other/**/*.json"]);
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/context.test.ts` → expect FAIL.
- [ ] Rewrite `server/context.ts`:
  ```ts
  import { parseImportPayload, serializeImportPayload, validateAll } from "@cyoda/workflow-core";
  import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
  import { readConfined, writeConfined, rmConfined } from "./files.js";
  import { discoverWorkflows, discoverEntities } from "./discovery.js";
  import type { EntityFileEntry } from "./discovery.js";

  /**
   * Dependency-injected context shared by every tool handler. `workflowGlobs`/
   * `entityGlobs` are LIVE — backed by a private mutable holder inside
   * `createToolContext`, exposed as getters — because `configure_project` (Task
   * 17) mutates them mid-session via `setGlobs`, and every subsequent
   * `discover()`/`discoverEntities()` call, plus the fs watcher (which reads
   * `ctx.workflowGlobs` fresh per event — see `index.ts`), must see the update
   * immediately. Tests construct a `ToolContext` literal directly with plain
   * fields instead of calling {@link createToolContext} — a plain field
   * structurally satisfies the same interface, so those fakes are unaffected by
   * this and don't need to reimplement live mutation unless they're specifically
   * testing it (see `tools/project.ts`'s tests, which use the real factory).
   */
  export interface ToolContext {
    root: string;
    workflowGlobs: string[];
    entityGlobs: string[];
    connectionUrl: string;
    read(rel: string): Promise<{ contents: string; lastModified: string; sizeBytes: number }>;
    write(rel: string, contents: string): Promise<{ path: string; lastModified: string; sizeBytes: number }>;
    deleteFile(rel: string): Promise<void>;
    discover(): Promise<WorkflowFileIndexEntry[]>;
    discoverEntities(): Promise<EntityFileEntry[]>;
    setGlobs(patch: { workflowGlobs?: string[]; entityGlobs?: string[] }): void;
    parseImport: typeof parseImportPayload;
    serializeImport: typeof serializeImportPayload;
    validate: typeof validateAll;
  }

  /** Build the production `ToolContext`: real confined fs I/O + real
   *  workflow-core + runtime-mutable globs (see `setGlobs`). */
  export function createToolContext(opts: {
    root: string;
    workflowGlobs: string[];
    entityGlobs: string[];
    connectionUrl: string;
  }): ToolContext {
    const globs = { workflowGlobs: opts.workflowGlobs, entityGlobs: opts.entityGlobs };
    return {
      root: opts.root,
      get workflowGlobs() { return globs.workflowGlobs; },
      get entityGlobs() { return globs.entityGlobs; },
      connectionUrl: opts.connectionUrl,
      read: (rel) => readConfined(opts.root, rel).then((r) => ({ contents: r.contents, lastModified: r.lastModified, sizeBytes: r.sizeBytes })),
      write: (rel, c) => writeConfined(opts.root, rel, c),
      deleteFile: (rel) => rmConfined(opts.root, rel),
      discover: () => discoverWorkflows(opts.root, globs.workflowGlobs),
      discoverEntities: () => discoverEntities(opts.root, globs.entityGlobs),
      setGlobs(patch) {
        if (patch.workflowGlobs !== undefined) globs.workflowGlobs = patch.workflowGlobs;
        if (patch.entityGlobs !== undefined) globs.entityGlobs = patch.entityGlobs;
      },
      parseImport: parseImportPayload,
      serializeImport: serializeImportPayload,
      validate: validateAll,
    };
  }
  ```
- [ ] Run the test again → expect PASS.

- [ ] **`watch.ts` live globs** — modify `server/watch.ts`'s `createWatcher` to read the CURRENT workflow globs per fs event instead of a value fixed at construction:
  ```ts
  export function createWatcher(opts: { root: string; getWorkflowGlobs: () => string[]; onChange: (c: WorkflowChange) => void; debounceMs?: number }): Watcher {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const handle = watch(opts.root, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const name = filename.toString();
      const abs = isAbsolute(name) ? name : join(opts.root, name);
      const change = classifyChange(opts.root, abs, opts.getWorkflowGlobs());
      if (!change) return;
      const key = `${change.kind}:${change.workflowFile}`;
      const prev = timers.get(key);
      if (prev) clearTimeout(prev);
      timers.set(key, setTimeout(() => { timers.delete(key); opts.onChange(change); }, opts.debounceMs ?? 120));
    });
    handle.on("error", (e) => { process.stderr.write(`[watch] error: ${String(e)}\n`); });
    return { close: () => { for (const t of timers.values()) clearTimeout(t); timers.clear(); handle.close(); } };
  }
  ```
  (`classifyChange`'s own signature is unchanged — still a pure function taking a `workflowGlobs: string[]` parameter; only the wrapper's *source* for that array changes, from a captured value to a live call.)
- [ ] Update the 5 call sites in `server/__tests__/watch.test.ts`: replace every `createWatcher({ root, workflowGlobs: [...], ... })` with `createWatcher({ root, getWorkflowGlobs: () => [...], ... })`, keeping each site's original array literal verbatim, e.g. the first becomes:
  ```ts
  w = createWatcher({ root, getWorkflowGlobs: () => ["**/*.json"], onChange: (c) => seen.push(c), debounceMs: 30 });
  ```
  and the `flows/**/*.json`-scoped one becomes:
  ```ts
  w = createWatcher({ root, getWorkflowGlobs: () => ["flows/**/*.json"], onChange: (c) => seen.push(c), debounceMs: 30 });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/watch.test.ts` → expect PASS (behavior unchanged, only the wiring shape).

- [ ] **`index.ts` CLI + wiring** — replace the `--project`/`--globs` parsing and the `createToolContext`/`createWatcher` calls in `main()`:
  ```ts
  import { DEFAULT_WORKFLOW_GLOBS, DEFAULT_ENTITY_GLOBS, parseGlobsArg } from "./cliArgs.js";
  ```
  ```ts
  const { values } = parseArgs({
    args: argv,
    options: { project: { type: "string", short: "p" }, "workflow-globs": { type: "string" }, "entity-globs": { type: "string" } },
  });
  const root = await realpath(resolve(values.project ?? "."));
  const workflowGlobs = parseGlobsArg(values["workflow-globs"], DEFAULT_WORKFLOW_GLOBS);
  const entityGlobs = parseGlobsArg(values["entity-globs"], DEFAULT_ENTITY_GLOBS);
  ```
  ```ts
  const ctx = createToolContext({ root, workflowGlobs, entityGlobs, connectionUrl });
  ```
  ```ts
  const watcher = createWatcher({ root, getWorkflowGlobs: () => ctx.workflowGlobs, onChange: (c) => { void onChange(c); } });
  ```
  (`workflowGlobs`/`entityGlobs` local `const`s are still used for the initial `createToolContext` call; the watcher now reads `ctx.workflowGlobs` — the live getter — instead of closing over the local `const`, so a later `configure_project` call is visible to it.)
- [ ] Run `pnpm --filter model-editor-mcp exec tsc --noEmit` → expect FAIL (the 3 existing test files' `ctx()` fakes no longer satisfy the widened `ToolContext`).
- [ ] Fix `server/__tests__/tools.test.ts`'s `ctx()` helper — add the 4 new fields to the returned literal:
  ```ts
  function ctx(files: Record<string, string>, over: Partial<ToolContext> = {}): ToolContext {
    const writes: Record<string, string> = {};
    return {
      root: "/r",
      workflowGlobs: ["**/*.json"],
      entityGlobs: [],
      connectionUrl: "http://127.0.0.1:50000",
      read: vi.fn(async (rel: string) => {
        const c = writes[rel] ?? files[rel];
        if (c === undefined) throw new Error("not found");
        return { contents: c, lastModified: "t", sizeBytes: c.length };
      }),
      write: vi.fn(async (rel: string, contents: string) => { writes[rel] = contents; return { path: `/r/${rel}`, lastModified: "t", sizeBytes: contents.length }; }),
      deleteFile: vi.fn(async () => {}),
      discover: vi.fn(async () => [entry()]),
      discoverEntities: vi.fn(async () => []),
      setGlobs: vi.fn(),
      parseImport: parseImportPayload,
      serializeImport: serializeImportPayload,
      validate: validateAll,
      ...over,
    };
  }
  ```
- [ ] Fix `server/__tests__/optimize_layout.test.ts`'s `ctx()` helper the same way (add `entityGlobs: []`, `deleteFile: vi.fn(async () => {})`, `discoverEntities: vi.fn(async () => [])`, `setGlobs: vi.fn()` to its returned literal).
- [ ] Fix `server/__tests__/index.test.ts`'s `ctx()` helper the same way.
- [ ] Run `pnpm --filter model-editor-mcp exec tsc --noEmit` → expect PASS.

- [ ] **Fix the already-green Playwright smoke for the new CLI defaults** — `e2e/smoke.spec.ts` spawns the server with only `--project <fixture>` (no glob flags), so it now uses `DEFAULT_WORKFLOW_GLOBS = ["models/workflow/**/*.json"]` instead of the old `**/*.json`; its fixtures currently sit at the fixture root and would silently stop being discovered. Update `test.beforeAll`:
  ```ts
  test.beforeAll(async () => {
    fixture = await mkdtemp(join(tmpdir(), "mem-e2e-"));
    await mkdir(join(fixture, "models", "workflow"), { recursive: true });
    await cp(join(here, "fixtures", "Pledge.json"), join(fixture, "models", "workflow", "Pledge.json"));
    await cp(join(here, "fixtures", "LegalEntity.json"), join(fixture, "models", "workflow", "LegalEntity.json"));
    child = spawn("node", [serverEntry, "--project", fixture], { stdio: ["pipe", "pipe", "pipe"] });
    rpc("initialize");
  });
  ```
  (add `import { mkdir } from "node:fs/promises";` to the existing `node:fs/promises` import line.)
- [ ] Run `pnpm --filter model-editor-mcp build && pnpm --filter model-editor-mcp test:e2e` → expect PASS (unchanged behavior, new fixture location).
- [ ] Run the full suite: `pnpm --filter model-editor-mcp exec vitest run` → expect PASS.
- [ ] `git add apps/model-editor-mcp/server/files.ts apps/model-editor-mcp/server/__tests__/files.test.ts apps/model-editor-mcp/server/cliArgs.ts apps/model-editor-mcp/server/__tests__/cliArgs.test.ts apps/model-editor-mcp/server/discovery.ts apps/model-editor-mcp/server/__tests__/discovery.test.ts apps/model-editor-mcp/server/context.ts apps/model-editor-mcp/server/__tests__/context.test.ts apps/model-editor-mcp/server/watch.ts apps/model-editor-mcp/server/__tests__/watch.test.ts apps/model-editor-mcp/server/index.ts apps/model-editor-mcp/server/__tests__/tools.test.ts apps/model-editor-mcp/server/__tests__/optimize_layout.test.ts apps/model-editor-mcp/server/__tests__/index.test.ts apps/model-editor-mcp/e2e/smoke.spec.ts && git commit -m "feat(model-editor-mcp): entityGlobs + runtime-mutable discovery globs, rmConfined, narrow CLI defaults"`

---

### Task 16: `server/tools/entities.ts` — entity CRUD (name-based, ported logic)

**Files:**
- Create `apps/model-editor-mcp/server/tools/entities.ts`
- Modify `apps/model-editor-mcp/server/schemas.ts` (add entity input schemas)
- Create `apps/model-editor-mcp/server/__tests__/entities.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function listEntitiesTool(args: unknown, ctx: ToolContext): Promise<McpResult>;
  export function getEntityTool(args: unknown, ctx: ToolContext): Promise<McpResult>;
  export function createEntityTool(args: unknown, ctx: ToolContext): Promise<McpResult>;
  export function updateEntityTool(args: unknown, ctx: ToolContext): Promise<McpResult>;
  export function deleteEntityTool(args: unknown, ctx: ToolContext): Promise<McpResult>;
  ```
- Consumes `ToolContext` (`../context.js`), `findEntityByName`/`resolveEntityCreatePath` (`../discovery.js`), `ok`/`err` (`../envelope.js`), the new schemas below.
- Schemas added to `schemas.ts` are consumed by Task 18's manifest and by this task's handlers.

**Steps:**
- [ ] Append the entity schemas to `server/schemas.ts`:
  ```ts
  /** `list_entities` — no input. */
  export const listEntitiesInput = z.object({}).strict();

  /** `get_entity` / `delete_entity` — name only (name = file stem, resolved against `entityGlobs`). */
  export const getEntityInput = z.object({ name: z.string().min(1) }).strict();
  export const deleteEntityInput = z.object({ name: z.string().min(1) }).strict();

  /** `create_entity` / `update_entity` — name + whole-document JSON string. */
  export const createEntityInput = z.object({ name: z.string().min(1), content: z.string() }).strict();
  export const updateEntityInput = z.object({ name: z.string().min(1), content: z.string() }).strict();

  export type GetEntityInput = z.infer<typeof getEntityInput>;
  export type CreateEntityInput = z.infer<typeof createEntityInput>;
  export type UpdateEntityInput = z.infer<typeof updateEntityInput>;
  export type DeleteEntityInput = z.infer<typeof deleteEntityInput>;
  ```
- [ ] Write the failing `server/__tests__/entities.test.ts`:
  ```ts
  import { describe, it, expect, vi } from "vitest";
  import { parseImportPayload, serializeImportPayload, validateAll } from "@cyoda/workflow-core";
  import type { ToolContext } from "../context.js";
  import type { EntityFileEntry } from "../discovery.js";
  import { listEntitiesTool, getEntityTool, createEntityTool, updateEntityTool, deleteEntityTool } from "../tools/entities.js";

  /** A ToolContext backed by an in-memory file map + a fixed set of discovered entities. */
  function ctx(entities: EntityFileEntry[], files: Record<string, string> = {}, over: Partial<ToolContext> = {}): ToolContext {
    const writes: Record<string, string> = {};
    const deleted = new Set<string>();
    return {
      root: "/r",
      workflowGlobs: [],
      entityGlobs: ["models/schema/**/*.json"],
      connectionUrl: "http://127.0.0.1:50000",
      read: vi.fn(async (rel: string) => {
        if (deleted.has(rel)) throw new Error(`not found: ${rel}`);
        const c = writes[rel] ?? files[rel];
        if (c === undefined) throw new Error(`not found: ${rel}`);
        return { contents: c, lastModified: "t", sizeBytes: c.length };
      }),
      write: vi.fn(async (rel: string, contents: string) => { writes[rel] = contents; deleted.delete(rel); return { path: `/r/${rel}`, lastModified: "t", sizeBytes: contents.length }; }),
      deleteFile: vi.fn(async (rel: string) => { deleted.add(rel); }),
      discover: vi.fn(async () => []),
      discoverEntities: vi.fn(async () => entities),
      setGlobs: vi.fn(),
      parseImport: parseImportPayload,
      serializeImport: serializeImportPayload,
      validate: validateAll,
      ...over,
    };
  }

  describe("listEntitiesTool", () => {
    it("returns { entities: [{ name, path }] } from discoverEntities", async () => {
      const r = await listEntitiesTool({}, ctx([{ relativePath: "models/schema/Foo.json", name: "Foo" }]));
      expect(JSON.parse(r.content[0]!.text)).toEqual({ entities: [{ name: "Foo", path: "models/schema/Foo.json" }] });
    });
    it("rejects unknown args", async () => {
      await expect(listEntitiesTool({ x: 1 }, ctx([]))).rejects.toMatchObject({ isError: true });
    });
  });

  describe("getEntityTool", () => {
    it("reads an existing entity's contents by name", async () => {
      const c = ctx([{ relativePath: "models/schema/Foo.json", name: "Foo" }], { "models/schema/Foo.json": '{"a":1}' });
      const r = await getEntityTool({ name: "Foo" }, c);
      expect(JSON.parse(r.content[0]!.text)).toMatchObject({ name: "Foo", path: "models/schema/Foo.json", contents: '{"a":1}' });
    });
    it("throws NOT_FOUND for an unknown name", async () => {
      await expect(getEntityTool({ name: "Nope" }, ctx([]))).rejects.toMatchObject({
        isError: true, content: [{ type: "text", text: expect.stringContaining("NOT_FOUND") }],
      });
    });
  });

  describe("createEntityTool", () => {
    it("creates a new entity at a path derived from entityGlobs", async () => {
      const c = ctx([]);
      const r = await createEntityTool({ name: "Foo", content: '{"a":1}' }, c);
      expect(JSON.parse(r.content[0]!.text)).toEqual({ ok: true, name: "Foo", path: "models/schema/Foo.json" });
      expect(c.write).toHaveBeenCalledWith("models/schema/Foo.json", '{"a":1}');
    });
    it("rejects invalid JSON without writing", async () => {
      const c = ctx([]);
      await expect(createEntityTool({ name: "Foo", content: "{bad" }, c)).rejects.toMatchObject({ isError: true });
      expect(c.write).not.toHaveBeenCalled();
    });
    it("rejects a JSON array (not an object) without writing", async () => {
      const c = ctx([]);
      await expect(createEntityTool({ name: "Foo", content: "[1,2,3]" }, c)).rejects.toMatchObject({ isError: true });
      expect(c.write).not.toHaveBeenCalled();
    });
    it("rejects an already-existing name (ALREADY_EXISTS) without writing", async () => {
      const c = ctx([{ relativePath: "models/schema/Foo.json", name: "Foo" }]);
      const r = createEntityTool({ name: "Foo", content: "{}" }, c);
      await expect(r).rejects.toMatchObject({ isError: true, content: [{ type: "text", text: expect.stringContaining("ALREADY_EXISTS") }] });
      expect(c.write).not.toHaveBeenCalled();
    });
  });

  describe("updateEntityTool", () => {
    it("overwrites an existing entity's whole-document contents", async () => {
      const c = ctx([{ relativePath: "models/schema/Foo.json", name: "Foo" }], { "models/schema/Foo.json": "{}" });
      const r = await updateEntityTool({ name: "Foo", content: '{"a":2}' }, c);
      expect(JSON.parse(r.content[0]!.text)).toEqual({ ok: true, name: "Foo", path: "models/schema/Foo.json" });
      expect(c.write).toHaveBeenCalledWith("models/schema/Foo.json", '{"a":2}');
    });
    it("throws NOT_FOUND without writing when the entity does not exist", async () => {
      const c = ctx([]);
      await expect(updateEntityTool({ name: "Nope", content: "{}" }, c)).rejects.toMatchObject({ isError: true });
      expect(c.write).not.toHaveBeenCalled();
    });
    it("rejects invalid JSON without writing, even for an existing entity", async () => {
      const c = ctx([{ relativePath: "models/schema/Foo.json", name: "Foo" }], { "models/schema/Foo.json": "{}" });
      await expect(updateEntityTool({ name: "Foo", content: "{bad" }, c)).rejects.toMatchObject({ isError: true });
      expect(c.write).not.toHaveBeenCalled();
    });
  });

  describe("deleteEntityTool", () => {
    it("deletes an existing entity", async () => {
      const c = ctx([{ relativePath: "models/schema/Foo.json", name: "Foo" }]);
      const r = await deleteEntityTool({ name: "Foo" }, c);
      expect(JSON.parse(r.content[0]!.text)).toEqual({ ok: true, name: "Foo" });
      expect(c.deleteFile).toHaveBeenCalledWith("models/schema/Foo.json");
    });
    it("throws NOT_FOUND without deleting when the entity does not exist", async () => {
      const c = ctx([]);
      await expect(deleteEntityTool({ name: "Nope" }, c)).rejects.toMatchObject({ isError: true });
      expect(c.deleteFile).not.toHaveBeenCalled();
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/entities.test.ts` → expect FAIL.
- [ ] Write `server/tools/entities.ts` (logic ported from `docs/mcp-service-design:apps/dev-console/src/mcp/tools/entities.ts`'s `listEntitiesTool`/`getEntityTool`/`createEntityTool`/`updateEntityTool`/`deleteEntityTool` — Tauri IPC/`DevProject`/activity-store imports excised, path-based args swapped for name-based, IO swapped to `ctx`):
  ```ts
  import { ok, err } from "../envelope.js";
  import type { McpResult } from "../envelope.js";
  import type { ToolContext } from "../context.js";
  import { listEntitiesInput, getEntityInput, createEntityInput, updateEntityInput, deleteEntityInput } from "../schemas.js";
  import { findEntityByName, resolveEntityCreatePath } from "../discovery.js";

  function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /** `list_entities()` → `{ entities: [{ name, path }] }`. */
  export async function listEntitiesTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
    const input = listEntitiesInput.safeParse(args);
    if (!input.success) throw err("INVALID_ARGS", input.error.message);
    const entries = await ctx.discoverEntities();
    return ok({ entities: entries.map((e) => ({ name: e.name, path: e.relativePath })) });
  }

  /** `get_entity(name)` — read a single entity's raw JSON contents. */
  export async function getEntityTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
    const input = getEntityInput.safeParse(args);
    if (!input.success) throw err("INVALID_ARGS", input.error.message);
    const { name } = input.data;
    const entry = findEntityByName(await ctx.discoverEntities(), name);
    if (!entry) throw err("NOT_FOUND", `no entity named "${name}"`);
    const { contents, lastModified } = await ctx.read(entry.relativePath);
    return ok({ name, path: entry.relativePath, contents, lastModified });
  }

  /** `create_entity(name, content)` — write a NEW entity file. Rejects invalid/non-object
   *  JSON (`INVALID_JSON`) or an already-existing name (`ALREADY_EXISTS`); writes nothing
   *  on either rejection. The destination path is derived from `entityGlobs` — see
   *  `resolveEntityCreatePath`. */
  export async function createEntityTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
    const input = createEntityInput.safeParse(args);
    if (!input.success) throw err("INVALID_ARGS", input.error.message);
    const { name, content } = input.data;

    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw err("INVALID_JSON", `content for "${name}" is not valid JSON`); }
    if (!isPlainObject(parsed)) throw err("INVALID_JSON", `content for "${name}" must be a JSON object`);

    const existing = findEntityByName(await ctx.discoverEntities(), name);
    if (existing) throw err("ALREADY_EXISTS", `an entity named "${name}" already exists at "${existing.relativePath}"`);

    const path = resolveEntityCreatePath(ctx.entityGlobs, name);
    await ctx.write(path, content);
    return ok({ ok: true, name, path });
  }

  /** `update_entity(name, content)` — overwrite an EXISTING entity's whole-document contents. */
  export async function updateEntityTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
    const input = updateEntityInput.safeParse(args);
    if (!input.success) throw err("INVALID_ARGS", input.error.message);
    const { name, content } = input.data;

    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw err("INVALID_JSON", `content for "${name}" is not valid JSON`); }
    if (!isPlainObject(parsed)) throw err("INVALID_JSON", `content for "${name}" must be a JSON object`);

    const entry = findEntityByName(await ctx.discoverEntities(), name);
    if (!entry) throw err("NOT_FOUND", `no entity named "${name}"`);

    await ctx.write(entry.relativePath, content);
    return ok({ ok: true, name, path: entry.relativePath });
  }

  /** `delete_entity(name)` — delete an existing entity file. */
  export async function deleteEntityTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
    const input = deleteEntityInput.safeParse(args);
    if (!input.success) throw err("INVALID_ARGS", input.error.message);
    const { name } = input.data;

    const entry = findEntityByName(await ctx.discoverEntities(), name);
    if (!entry) throw err("NOT_FOUND", `no entity named "${name}"`);

    await ctx.deleteFile(entry.relativePath);
    return ok({ ok: true, name });
  }
  ```
- [ ] Run the test again → expect PASS.
- [ ] `git add apps/model-editor-mcp/server/tools/entities.ts apps/model-editor-mcp/server/schemas.ts apps/model-editor-mcp/server/__tests__/entities.test.ts && git commit -m "feat(model-editor-mcp): entity CRUD tools (name-based, ported from parked branch)"`

---

### Task 17: `server/tools/project.ts` — `configure_project`/`get_project`

**Files:**
- Create `apps/model-editor-mcp/server/tools/project.ts`
- Modify `apps/model-editor-mcp/server/schemas.ts` (add `getProjectInput`/`configureProjectInput`)
- Create `apps/model-editor-mcp/server/__tests__/project.test.ts` (uses the REAL `createToolContext` over a temp dir — the strongest proof that `setGlobs` genuinely changes live discovery, not a mocked assertion)

**Interfaces:**
- Produces:
  ```ts
  export function getProjectTool(args: unknown, ctx: ToolContext): Promise<McpResult>;
  export function configureProjectTool(args: unknown, ctx: ToolContext): Promise<McpResult>;
  ```
- Consumes `ToolContext` (`../context.js`), `ok`/`err` (`../envelope.js`), the new schemas below.

**Steps:**
- [ ] Append the project schemas to `server/schemas.ts`:
  ```ts
  /** `get_project` — no input. */
  export const getProjectInput = z.object({}).strict();

  /**
   * `configure_project` — updates the session's `workflowGlobs`/`entityGlobs`
   * (all fields optional; only supplied fields change) and never persists to
   * disk. `name` is accepted for parity with the parked branch's schema/design
   * text but is currently a no-op: this headless server has no project-"name"
   * concept to store it in, and `get_project`'s own return shape (below) has no
   * `name` field either — it's forward-compatible surface, not a bug.
   */
  export const configureProjectInput = z
    .object({
      name: z.string().min(1).max(200).optional(),
      workflowGlobs: z.array(z.string()).optional(),
      entityGlobs: z.array(z.string()).optional(),
    })
    .strict();

  export type GetProjectInput = z.infer<typeof getProjectInput>;
  export type ConfigureProjectInput = z.infer<typeof configureProjectInput>;
  ```
- [ ] Write the failing `server/__tests__/project.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach, afterEach } from "vitest";
  import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
  import { tmpdir } from "node:os";
  import { join } from "node:path";
  import { createToolContext } from "../context.js";
  import { getProjectTool, configureProjectTool } from "../tools/project.js";

  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "mem-proj-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  describe("getProjectTool", () => {
    it("reports root, current globs, and workflow/entity counts from real discovery", async () => {
      await mkdir(join(root, "models/workflow"), { recursive: true });
      await mkdir(join(root, "models/schema"), { recursive: true });
      await writeFile(
        join(root, "models/workflow/Pledge.json"),
        JSON.stringify({ importMode: "MERGE", workflows: [{ version: "1", name: "Pledge", initialState: "none", active: true, states: { none: { transitions: [] } } }] }),
      );
      await writeFile(join(root, "models/schema/Foo.json"), JSON.stringify({ type: "object" }));
      const ctx = createToolContext({ root, workflowGlobs: ["models/workflow/**/*.json"], entityGlobs: ["models/schema/**/*.json"], connectionUrl: "http://x" });

      const r = await getProjectTool({}, ctx);
      expect(JSON.parse(r.content[0]!.text)).toEqual({
        root, workflowGlobs: ["models/workflow/**/*.json"], entityGlobs: ["models/schema/**/*.json"],
        counts: { workflows: 1, entities: 1 },
      });
    });
    it("rejects unknown args", async () => {
      const ctx = createToolContext({ root, workflowGlobs: [], entityGlobs: [], connectionUrl: "http://x" });
      await expect(getProjectTool({ x: 1 }, ctx)).rejects.toMatchObject({ isError: true });
    });
  });

  describe("configureProjectTool", () => {
    it("updates entityGlobs live — the VERY NEXT get_project call reflects the new globs and counts", async () => {
      await mkdir(join(root, "alt"), { recursive: true });
      await writeFile(join(root, "alt/Bar.json"), JSON.stringify({ type: "object" }));
      const ctx = createToolContext({ root, workflowGlobs: [], entityGlobs: ["models/schema/**/*.json"], connectionUrl: "http://x" });

      const before = JSON.parse((await getProjectTool({}, ctx)).content[0]!.text);
      expect(before.counts.entities).toBe(0);

      const r = await configureProjectTool({ entityGlobs: ["alt/*.json"] }, ctx);
      expect(JSON.parse(r.content[0]!.text)).toMatchObject({ entityGlobs: ["alt/*.json"] });

      const after = JSON.parse((await getProjectTool({}, ctx)).content[0]!.text);
      expect(after.entityGlobs).toEqual(["alt/*.json"]);
      expect(after.counts.entities).toBe(1);
    });

    it("leaves workflowGlobs untouched when only entityGlobs is supplied", async () => {
      const ctx = createToolContext({ root, workflowGlobs: ["a/*.json"], entityGlobs: ["b/*.json"], connectionUrl: "http://x" });
      const r = await configureProjectTool({ entityGlobs: ["c/*.json"] }, ctx);
      expect(JSON.parse(r.content[0]!.text)).toEqual({ root, workflowGlobs: ["a/*.json"], entityGlobs: ["c/*.json"] });
    });

    it("accepts an optional display name as a no-op (no globs change, no crash)", async () => {
      const ctx = createToolContext({ root, workflowGlobs: ["a/*.json"], entityGlobs: ["b/*.json"], connectionUrl: "http://x" });
      const r = await configureProjectTool({ name: "My Project" }, ctx);
      expect(JSON.parse(r.content[0]!.text)).toEqual({ root, workflowGlobs: ["a/*.json"], entityGlobs: ["b/*.json"] });
    });

    it("rejects unknown args", async () => {
      const ctx = createToolContext({ root, workflowGlobs: [], entityGlobs: [], connectionUrl: "http://x" });
      await expect(configureProjectTool({ bogus: 1 }, ctx)).rejects.toMatchObject({ isError: true });
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/project.test.ts` → expect FAIL.
- [ ] Write `server/tools/project.ts` (logic ported from `docs/mcp-service-design:apps/dev-console/src/mcp/tools/project.ts`'s `getProjectTool`/`configureProjectTool` — `DevProject`/`projectStore`/`queryClient`/`scanProject` imports excised; `enumerateEntities` reuse becomes `ctx.discoverEntities()`; `setActive`/`invalidate` become `ctx.setGlobs`):
  ```ts
  import { ok, err } from "../envelope.js";
  import type { McpResult } from "../envelope.js";
  import type { ToolContext } from "../context.js";
  import { getProjectInput, configureProjectInput } from "../schemas.js";

  /**
   * `get_project()` — root, current globs, and workflow/entity counts.
   * `counts.workflows`/`counts.entities` come straight from `ctx.discover()`/
   * `ctx.discoverEntities()` — the SAME enumeration `list_workflows`/
   * `list_entities` use — so the two can never drift (the parked branch's
   * whole-branch review flagged exactly this drift risk when the old code
   * re-implemented a second, narrower scan just for the count).
   */
  export async function getProjectTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
    const input = getProjectInput.safeParse(args);
    if (!input.success) throw err("INVALID_ARGS", input.error.message);

    const [workflows, entities] = await Promise.all([ctx.discover(), ctx.discoverEntities()]);
    return ok({
      root: ctx.root,
      workflowGlobs: ctx.workflowGlobs,
      entityGlobs: ctx.entityGlobs,
      counts: { workflows: workflows.length, entities: entities.length },
    });
  }

  /**
   * `configure_project({ name?, workflowGlobs?, entityGlobs? })` — updates the
   * session's mutable globs via `ctx.setGlobs` (only supplied fields change);
   * NEVER persisted to disk (session-only, matching the parked branch's D3/§3.6
   * invariant — this headless server has no `config.json` to accidentally
   * corrupt, but the rule is the same: an agent's project locations must not
   * outlive its session). `name` is parsed but not applied anywhere — see the
   * schema's doc comment in `schemas.ts`.
   */
  export async function configureProjectTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
    const input = configureProjectInput.safeParse(args);
    if (!input.success) throw err("INVALID_ARGS", input.error.message);
    const patch = input.data;

    ctx.setGlobs({
      ...(patch.workflowGlobs !== undefined ? { workflowGlobs: patch.workflowGlobs } : {}),
      ...(patch.entityGlobs !== undefined ? { entityGlobs: patch.entityGlobs } : {}),
    });

    return ok({ root: ctx.root, workflowGlobs: ctx.workflowGlobs, entityGlobs: ctx.entityGlobs });
  }
  ```
- [ ] Run the test again → expect PASS.
- [ ] `git add apps/model-editor-mcp/server/tools/project.ts apps/model-editor-mcp/server/schemas.ts apps/model-editor-mcp/server/__tests__/project.test.ts && git commit -m "feat(model-editor-mcp): configure_project/get_project (session-only, ported from parked branch)"`

---

### Task 18: register the 7 new tools — `manifest.ts` + `index.ts` dispatcher

Schemas were added alongside their tools in Tasks 16–17 so each of those tasks compiled and tested standalone; this task is purely the advertise-and-wire step.

**Files:**
- Modify `apps/model-editor-mcp/server/manifest.ts` (append 7 `ToolManifestEntry`s)
- Modify `apps/model-editor-mcp/server/index.ts` (import + register the 7 handlers in the `tools` map)
- Create `apps/model-editor-mcp/server/__tests__/manifest.test.ts`

**Interfaces:**
- Consumes `listEntitiesTool`/`getEntityTool`/`createEntityTool`/`updateEntityTool`/`deleteEntityTool` (`./tools/entities.js`), `getProjectTool`/`configureProjectTool` (`./tools/project.js`).
- `TOOL_MANIFEST` grows from 6 to 13 entries; the `tools` map in `main()` grows to match.

**Steps:**
- [ ] Write the failing `server/__tests__/manifest.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { TOOL_MANIFEST } from "../manifest.js";

  const EXPECTED = [
    "list_workflows", "show_workflow", "update_workflow", "optimize_layout", "validate_workflow", "connection_info",
    "list_entities", "get_entity", "create_entity", "update_entity", "delete_entity",
    "configure_project", "get_project",
  ];

  describe("TOOL_MANIFEST", () => {
    it("advertises exactly the full-editor-expansion tool surface, once each", () => {
      const names = TOOL_MANIFEST.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length); // no duplicates
      expect([...names].sort()).toEqual([...EXPECTED].sort());
    });
    it("every entry has a non-empty description and a JSON-Schema object inputSchema", () => {
      for (const entry of TOOL_MANIFEST) {
        expect(entry.description.length).toBeGreaterThan(0);
        expect(entry.inputSchema).toMatchObject({ type: "object" });
      }
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/manifest.test.ts` → expect FAIL.
- [ ] Append to `server/manifest.ts` (add two shared shape consts near the existing `empty`/`nameOnly`, then 7 entries to `TOOL_MANIFEST`):
  ```ts
  const nameAndContent = {
    type: "object",
    properties: { name: { type: "string", minLength: 1 }, content: { type: "string" } },
    required: ["name", "content"],
    additionalProperties: false,
  } as const;
  const stringArray = { type: "array", items: { type: "string" } } as const;
  ```
  ```ts
  // append inside the existing TOOL_MANIFEST array literal:
  { name: "list_entities", description: "List discovered entities (separate plain-JSON object files matched by entityGlobs): { entities: [{ name, path }] }.", inputSchema: empty },
  { name: "get_entity", description: "Read a single entity's raw JSON contents by name.", inputSchema: nameOnly },
  { name: "create_entity", description: "Create a new entity file (name-based; destination directory derived from entityGlobs). Rejects if an entity with that name already exists.", inputSchema: nameAndContent },
  { name: "update_entity", description: "Overwrite an existing entity's whole-document JSON contents.", inputSchema: nameAndContent },
  { name: "delete_entity", description: "Delete an existing entity file.", inputSchema: nameOnly },
  { name: "configure_project", description: "Update the session's workflowGlobs/entityGlobs (and an optional display name) — never persisted to disk.", inputSchema: { type: "object", properties: { name: { type: "string", minLength: 1, maxLength: 200 }, workflowGlobs: stringArray, entityGlobs: stringArray }, additionalProperties: false } },
  { name: "get_project", description: "Report the project root, current workflowGlobs/entityGlobs, and workflow/entity counts.", inputSchema: empty },
  ```
- [ ] Run the manifest test again → expect PASS.
- [ ] Wire the handlers into `server/index.ts`'s `main()`:
  ```ts
  import { listEntitiesTool, getEntityTool, createEntityTool, updateEntityTool, deleteEntityTool } from "./tools/entities.js";
  import { getProjectTool, configureProjectTool } from "./tools/project.js";
  ```
  ```ts
  const tools: Record<string, ToolHandler> = {
    list_workflows: (a) => listWorkflowsTool(a, ctx),
    show_workflow: (a) => showWorkflowTool(a, ctx, setShown),
    update_workflow: (a) => updateWorkflowTool(a, ctx),
    optimize_layout: (a) => optimizeLayoutTool(a, ctx),
    validate_workflow: (a) => validateWorkflowTool(a, ctx),
    connection_info: (a) => connectionInfoTool(a, ctx),
    list_entities: (a) => listEntitiesTool(a, ctx),
    get_entity: (a) => getEntityTool(a, ctx),
    create_entity: (a) => createEntityTool(a, ctx),
    update_entity: (a) => updateEntityTool(a, ctx),
    delete_entity: (a) => deleteEntityTool(a, ctx),
    configure_project: (a) => configureProjectTool(a, ctx),
    get_project: (a) => getProjectTool(a, ctx),
  };
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec tsc --noEmit && pnpm --filter model-editor-mcp exec vitest run` → expect PASS.
- [ ] `git add apps/model-editor-mcp/server/manifest.ts apps/model-editor-mcp/server/index.ts apps/model-editor-mcp/server/__tests__/manifest.test.ts && git commit -m "feat(model-editor-mcp): register entity CRUD + configure_project/get_project tools"`

---

### Task 19: `http.ts` — `GET /api/index` + `GET /api/workflow/:name` + `GET /api/entity/:name`

**Files:**
- Modify `apps/model-editor-mcp/server/http.ts` (new `/api/*` routes, loopback-gated + name-allowlisted)
- Modify `apps/model-editor-mcp/server/__tests__/http.test.ts` (extend `beforeEach` wiring + new cases)
- Modify `apps/model-editor-mcp/server/index.ts` (inject `discoverEntities`/`readWorkflow`/`readEntity` into `createHttpServer`)

**Interfaces:**
- `HttpServerOptions` grows:
  ```ts
  export interface HttpServerOptions {
    root: string;
    distDir: string;
    token: string;
    hub: SseHub;
    discover: () => Promise<{ relativePath: string; workflows: { name: string }[] }[]>;
    discoverEntities: () => Promise<{ relativePath: string; name: string }[]>;
    readWorkflow: (name: string) => Promise<{ name: string; path: string; content: string; layout: Record<string, unknown> } | null>;
    readEntity: (name: string) => Promise<{ name: string; path: string; contents: string } | null>;
    writeLayout: (name: string, workflowUi: Record<string, unknown>, origin: string) => Promise<void>;
  }
  ```
- Consumes `findByName`/`findEntityByName` (`./discovery.js`, already imported for `findByName`).

**Steps:**
- [ ] Extend `server/__tests__/http.test.ts`'s `beforeEach` with the 3 new options (declare the mocks alongside the existing `writeLayout` mock):
  ```ts
  let discoverEntities: Mock<() => Promise<{ relativePath: string; name: string }[]>>;
  let readWorkflow: Mock<(name: string) => Promise<{ name: string; path: string; content: string; layout: Record<string, unknown> } | null>>;
  let readEntity: Mock<(name: string) => Promise<{ name: string; path: string; contents: string } | null>>;
  ```
  ```ts
  beforeEach(async () => {
    dist = await mkdtemp(join(tmpdir(), "mem-dist-"));
    await writeFile(join(dist, "index.html"), "<html>tok=__SESSION_TOKEN__</html>");
    writeLayout = vi.fn(async () => {});
    discoverEntities = vi.fn(async () => [{ relativePath: "models/schema/Foo.json", name: "Foo" }]);
    readWorkflow = vi.fn(async (name: string) => (name === "Pledge" ? { name: "Pledge", path: "Pledge.json", content: '{"workflows":[]}', layout: {} } : null));
    readEntity = vi.fn(async (name: string) => (name === "Foo" ? { name: "Foo", path: "models/schema/Foo.json", contents: '{"a":1}' } : null));
    server = createHttpServer({
      root: "/proj", distDir: dist, token: "secret", hub: createSseHub(),
      discover: async () => [{ relativePath: "Pledge.json", workflows: [{ name: "Pledge" }] }],
      discoverEntities, readWorkflow, readEntity, writeLayout,
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  ```
- [ ] Add the new cases (append near the existing `/_id`/static tests):
  ```ts
  it("GET /api/index returns the current workflow + entity lists", async () => {
    const res = await fetch(`${base}/api/index`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workflows: [{ name: "Pledge", path: "Pledge.json" }], entities: [{ name: "Foo", path: "models/schema/Foo.json" }] });
  });
  it("GET /api/workflow/:name returns the item for an allowlisted name", async () => {
    const res = await fetch(`${base}/api/workflow/Pledge`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Pledge", path: "Pledge.json", content: '{"workflows":[]}', layout: {} });
  });
  it("GET /api/workflow/:name 404s for a name not in discovery, and never calls readWorkflow", async () => {
    const res = await fetch(`${base}/api/workflow/Ghost`);
    expect(res.status).toBe(404);
    expect(readWorkflow).not.toHaveBeenCalled();
  });
  it("GET /api/entity/:name returns the item for an allowlisted name", async () => {
    const res = await fetch(`${base}/api/entity/Foo`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Foo", path: "models/schema/Foo.json", contents: '{"a":1}' });
  });
  it("GET /api/entity/:name 404s for a name not in discovery, and never calls readEntity", async () => {
    const res = await fetch(`${base}/api/entity/Ghost`);
    expect(res.status).toBe(404);
    expect(readEntity).not.toHaveBeenCalled();
  });
  it("rejects GET /api/index with a non-loopback Host (403), same gate as /_id", async () => {
    const res = await raw("/api/index", { headers: { host: "evil.com" } });
    expect(res.status).toBe(403);
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run server/__tests__/http.test.ts` → expect FAIL (new options/routes don't exist).
- [ ] Modify `server/http.ts`: extend `HttpServerOptions`, add `findEntityByName` to the existing `discovery.js` import, insert an `/api/*` branch in `handle()` before the generic-static fallback, and add `handleApi`:
  ```ts
  import { findByName, findEntityByName } from "./discovery.js"; // extend the existing import
  ```
  ```ts
  export interface HttpServerOptions {
    root: string;
    distDir: string;
    token: string;
    hub: SseHub;
    discover: () => Promise<{ relativePath: string; workflows: { name: string }[] }[]>;
    discoverEntities: () => Promise<{ relativePath: string; name: string }[]>;
    readWorkflow: (name: string) => Promise<{ name: string; path: string; content: string; layout: Record<string, unknown> } | null>;
    readEntity: (name: string) => Promise<{ name: string; path: string; contents: string } | null>;
    writeLayout: (name: string, workflowUi: Record<string, unknown>, origin: string) => Promise<void>;
  }
  ```
  In `handle()`, insert before the existing generic `if (req.method === "GET") { ...serveStatic... }` branch:
  ```ts
  if (req.method === "GET" && url.pathname.startsWith("/api/")) {
    if (!isLoopback(req)) { res.writeHead(403).end(); return; }
    await handleApi(url, res);
    return;
  }
  ```
  and add the handler function alongside `handleEvents`/`handleLayout`/`serveStatic`:
  ```ts
  async function handleApi(url: URL, res: ServerResponse): Promise<void> {
    if (url.pathname === "/api/index") {
      const [workflows, entities] = await Promise.all([opts.discover(), opts.discoverEntities()]);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        workflows: workflows.map((w) => ({ name: w.workflows[0]?.name ?? w.relativePath.replace(/\.json$/, "").split("/").pop(), path: w.relativePath })),
        entities: entities.map((e) => ({ name: e.name, path: e.relativePath })),
      }));
      return;
    }
    const wfMatch = /^\/api\/workflow\/(.+)$/.exec(url.pathname);
    if (wfMatch) {
      const name = decodeURIComponent(wfMatch[1]!);
      if (!findByName(await opts.discover(), name)) { res.writeHead(404).end("unknown workflow"); return; }
      const item = await opts.readWorkflow(name);
      if (!item) { res.writeHead(404).end("unknown workflow"); return; }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(item));
      return;
    }
    const enMatch = /^\/api\/entity\/(.+)$/.exec(url.pathname);
    if (enMatch) {
      const name = decodeURIComponent(enMatch[1]!);
      if (!findEntityByName(await opts.discoverEntities(), name)) { res.writeHead(404).end("unknown entity"); return; }
      const item = await opts.readEntity(name);
      if (!item) { res.writeHead(404).end("unknown entity"); return; }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(item));
      return;
    }
    res.writeHead(404).end("not found");
  }
  ```
- [ ] Run the http test suite again → expect PASS.
- [ ] Wire real `readWorkflow`/`readEntity`/`discoverEntities` in `server/index.ts`'s `main()` (add near the existing `writeLayout`/`onChange` closures, before the `createHttpServer` call; `findEntityByName` extends the existing `discovery.js` import there too):
  ```ts
  import { findByName, findEntityByName } from "./discovery.js"; // extend the existing import
  ```
  ```ts
  const readWorkflowForApi = async (name: string): Promise<{ name: string; path: string; content: string; layout: Record<string, unknown> } | null> => {
    const entry = findByName(await ctx.discover(), name);
    if (!entry) return null;
    const parsed = ctx.parseImport(synthesizeImportPayload((await ctx.read(entry.relativePath)).contents));
    if (!parsed.document) return null;
    const content = ctx.serializeImport(parsed.document);
    const layout = await loadRemappedLayout(ctx, entry.relativePath, parsed.document.meta.ids.transitions);
    return { name, path: entry.relativePath, content, layout };
  };

  const readEntityForApi = async (name: string): Promise<{ name: string; path: string; contents: string } | null> => {
    const entry = findEntityByName(await ctx.discoverEntities(), name);
    if (!entry) return null;
    const { contents } = await ctx.read(entry.relativePath);
    return { name, path: entry.relativePath, contents };
  };
  ```
  ```ts
  const http = createHttpServer({
    root, distDir, token, hub,
    discover: ctx.discover, discoverEntities: ctx.discoverEntities,
    readWorkflow: readWorkflowForApi, readEntity: readEntityForApi,
    writeLayout,
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec tsc --noEmit && pnpm --filter model-editor-mcp exec vitest run` → expect PASS.
- [ ] `git add apps/model-editor-mcp/server/http.ts apps/model-editor-mcp/server/__tests__/http.test.ts apps/model-editor-mcp/server/index.ts && git commit -m "feat(model-editor-mcp): loopback-gated, name-allowlisted GET /api/index|workflow/:name|entity/:name"`

---

### Task 20: web — `monacoRuntime.ts` + `MonacoJsonViewer.tsx` (read-only), bundled correctly

`MonacoJsonViewer` cannot be safely rendered under vitest+happy-dom even with a stub — real `monaco.editor.create(...)` needs browser APIs happy-dom doesn't implement (no layout, no `ResizeObserver`, no real `Worker`). `apps/dev-console` never renders it in a test either; every test that could reach it mocks `../monacoRuntime.js` away entirely. This task follows the same discipline: verify by building (mirroring Task 12's `web/` verification), and add the `monaco-editor` test-alias stub as the same defensive infrastructure `apps/dev-console` carries, ready for Task 22's shell tests to lean on.

**Files:**
- Modify `apps/model-editor-mcp/package.json` (add `monaco-editor: catalog:` dependency)
- Modify `apps/model-editor-mcp/vitest.config.ts` (add the `monaco-editor` → stub test alias)
- Create `apps/model-editor-mcp/web/src/__tests__/stubs/monacoStub.ts`
- Create `apps/model-editor-mcp/web/src/monacoRuntime.ts` (ported verbatim from `apps/dev-console/src/monacoRuntime.ts`)
- Create `apps/model-editor-mcp/web/src/MonacoJsonViewer.tsx` (ported from `apps/dev-console/src/components/MonacoJsonViewer.tsx`, hardcoded `readOnly: true`, save/dirty machinery dropped — there is nothing to save to)

**Interfaces:**
- Produces: `export function getMonacoRuntime(): WorkflowJsonMonacoRuntime;` and `export function MonacoJsonViewer({ contents }: { contents: string }): JSX.Element;`
- Consumed by Task 22's `WorkflowPane`/`EntityPane`.

**Steps:**
- [ ] Add the dependency to `apps/model-editor-mcp/package.json`'s `dependencies` (alongside the existing `"@cyoda/workflow-react": "0.4.1"` line):
  ```json
  "monaco-editor": "catalog:",
  ```
  Run `pnpm install` to link it.
- [ ] Create `web/src/__tests__/stubs/monacoStub.ts` (mirrors `apps/dev-console/src/__tests__/stubs/monacoStub.ts` verbatim):
  ```ts
  // Stub for monaco-editor in test environment
  export default {};
  export const editor = {};
  export const languages = {};
  ```
- [ ] Modify `apps/model-editor-mcp/vitest.config.ts` to alias `monaco-editor` (and any subpath) to the stub, mirroring `apps/dev-console/vite.config.ts`'s `test.alias`:
  ```ts
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
  ```
- [ ] Create `web/src/monacoRuntime.ts` (ported verbatim from `apps/dev-console/src/monacoRuntime.ts` — same relative import depth, no changes needed):
  ```ts
  /// <reference types="vite/client" />
  import * as monaco from "monaco-editor";
  import type { WorkflowJsonMonacoRuntime } from "@cyoda/workflow-react";
  import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
  import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

  let configured = false;

  export function getMonacoRuntime(): WorkflowJsonMonacoRuntime {
    const target = window as Window & {
      MonacoEnvironment?: {
        getWorker(_: string, label: string): Worker;
      };
    };

    if (!configured) {
      target.MonacoEnvironment = {
        getWorker(_workerId: string, label: string) {
          if (label === "json") return new jsonWorker();
          return new editorWorker();
        },
      };
      configured = true;
    }
    return monaco as unknown as WorkflowJsonMonacoRuntime;
  }
  ```
- [ ] Create `web/src/MonacoJsonViewer.tsx` (ported from `apps/dev-console/src/components/MonacoJsonViewer.tsx`; drops `onSave`/`onDirtyChange`/baseline-dirty-tracking — this pane is ALWAYS read-only, there is nothing to save to):
  ```tsx
  import { useEffect, useRef } from "react";
  import * as monaco from "monaco-editor";
  import { getMonacoRuntime } from "./monacoRuntime.js";

  getMonacoRuntime();

  /**
   * A read-only JSON pane — a SEPARATE plain `monaco.editor.create(...)` instance,
   * deliberately NOT the `@cyoda/workflow-react` editor's built-in `jsonEditor` tab
   * (that tab is read-only only in `mode:"viewer"`, which also freezes the graph).
   * `readOnly: true` is hardcoded, not a prop: content is Claude-owned everywhere
   * in this app — there is no save/dirty machinery here at all, unlike the
   * editable `apps/dev-console` original this was ported from.
   */
  export function MonacoJsonViewer({ contents }: { contents: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

    useEffect(() => {
      if (!containerRef.current) return;
      const editor = monaco.editor.create(containerRef.current, {
        value: contents,
        language: "json",
        theme: "vs",
        readOnly: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineHeight: 20,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        renderLineHighlight: "line",
        wordWrap: "off",
        folding: true,
        automaticLayout: true,
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        overviewRulerLanes: 0,
      });
      editorRef.current = editor;
      return () => { editor.dispose(); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Live pushes / view switches replace the model value in place, no remount.
    useEffect(() => {
      const editor = editorRef.current;
      if (!editor) return;
      const model = editor.getModel();
      if (model && model.getValue() !== contents) model.setValue(contents);
    }, [contents]);

    return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
  }
  ```
- [ ] Verify the web bundle still builds AND now emits the two monaco worker chunks: `pnpm --filter model-editor-mcp exec vite build --config web/vite.config.ts` then `ls web/dist/assets | grep -i worker` → expect at least one matching filename (Vite's default `?worker` handling names the chunk after the source file, e.g. `editor.worker-<hash>.js`). No `web/vite.config.ts` changes are needed for this — confirmed against `apps/dev-console/vite.config.ts`, which has no worker-specific settings either; Vite 8's built-in `?worker` import handling covers it.
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run` (server + existing web tests) → expect PASS (nothing yet imports the new files, so this just confirms no regression).
- [ ] `git add apps/model-editor-mcp/package.json apps/model-editor-mcp/vitest.config.ts apps/model-editor-mcp/web/src/__tests__/stubs/monacoStub.ts apps/model-editor-mcp/web/src/monacoRuntime.ts apps/model-editor-mcp/web/src/MonacoJsonViewer.tsx pnpm-lock.yaml && git commit -m "feat(model-editor-mcp): read-only MonacoJsonViewer pane + monaco worker runtime, ported from dev-console"`

---

### Task 21: web — `EntityViewer.tsx` + `JsonTree.tsx` (searchable JSON tree, DOM-safe)

Unlike Monaco, the ported tree view is plain React + design-system tokens — no workers, no canvas — so it renders correctly under happy-dom and gets a real render test.

**Files:**
- Modify `apps/model-editor-mcp/package.json` (add `lucide-react` dependency)
- Create `apps/model-editor-mcp/web/src/JsonTree.tsx` (ported verbatim from `apps/dev-console/src/components/JsonTree.tsx`)
- Create `apps/model-editor-mcp/web/src/EntityViewer.tsx` (ported verbatim from `apps/dev-console/src/components/EntityViewer.tsx`)
- Create `apps/model-editor-mcp/web/src/__tests__/EntityViewer.test.tsx`

**Interfaces:**
- Produces: `export function EntityViewer({ contents }: { contents: string }): JSX.Element;` (and the `JsonTree`/`JsonTreeProvider` it uses internally).
- Consumes `useTokens`/`WarningBanner` (`@cyoda/console-design-system`, already a dependency), `ChevronRight` (`lucide-react`, new dependency).
- Consumed by Task 22's `EntityPane`.

**Steps:**
- [ ] Add the dependency to `apps/model-editor-mcp/package.json`'s `dependencies` (alphabetical, alongside `"@cyoda/workflow-react"`/`"reactflow"`):
  ```json
  "lucide-react": "^1.23.0",
  ```
  Run `pnpm install`.
- [ ] Create `web/src/JsonTree.tsx` — copy `apps/dev-console/src/components/JsonTree.tsx` verbatim (no import-path changes needed: it only imports `react`, `@cyoda/console-design-system`, and `lucide-react`, all already resolvable from `web/src/`). Full contents (302 lines) — the module exports `JsonTree`, `JsonTreeProvider`; internal helpers `Highlight`, `CopyBtn`, `Row`, `Collapsible`, and the `TreeContext`/`CODE` constants are unexported, exactly as in the source.
- [ ] Create `web/src/EntityViewer.tsx` — copy `apps/dev-console/src/components/EntityViewer.tsx` verbatim:
  ```tsx
  import { useMemo, useState } from "react";
  import { WarningBanner, useTokens } from "@cyoda/console-design-system";
  import { JsonTree, JsonTreeProvider } from "./JsonTree.js";

  export function EntityViewer({ contents }: { contents: string }) {
    const t = useTokens();
    const [search, setSearch] = useState("");

    const parsed = useMemo(() => {
      try {
        return { ok: true as const, value: JSON.parse(contents) as unknown };
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      }
    }, [contents]);

    if (!parsed.ok)
      return <WarningBanner severity="caution">Invalid JSON: {parsed.error}</WarningBanner>;

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8 }}>
        <div style={{ flexShrink: 0 }}>
          <input
            type="search"
            placeholder="Search keys and values…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              height: 28,
              padding: "0 8px",
              fontFamily: t.font.mono,
              fontSize: t.font.sizes.sm,
              border: `1px solid ${t.color.border}`,
              borderRadius: 2,
              background: t.color.surfaceAlt,
              color: t.color.text,
              outline: "none",
            }}
          />
        </div>

        <JsonTreeProvider query={search}>
          <JsonTree value={parsed.value as never} />
        </JsonTreeProvider>
      </div>
    );
  }
  ```
- [ ] Write the failing `web/src/__tests__/EntityViewer.test.tsx`:
  ```tsx
  /** @vitest-environment happy-dom */
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@testing-library/react";
  import { ThemeProvider } from "@cyoda/console-design-system";
  import { EntityViewer } from "../EntityViewer.js";

  describe("EntityViewer", () => {
    it("renders a JSON object's keys and values as a tree", () => {
      render(
        <ThemeProvider>
          <EntityViewer contents={JSON.stringify({ name: "CollateralAsset", version: 1 })} />
        </ThemeProvider>,
      );
      expect(screen.getByText(/name/)).toBeInTheDocument();
      expect(screen.getByText(/CollateralAsset/)).toBeInTheDocument();
      expect(screen.getByText(/version/)).toBeInTheDocument();
    });

    it("shows a warning banner for invalid JSON instead of throwing", () => {
      render(
        <ThemeProvider>
          <EntityViewer contents="{not json" />
        </ThemeProvider>,
      );
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/Invalid JSON/)).toBeInTheDocument();
    });

    it("renders a search box for filtering keys/values", () => {
      render(
        <ThemeProvider>
          <EntityViewer contents={JSON.stringify({ alpha: 1, beta: 2 })} />
        </ThemeProvider>,
      );
      expect(screen.getByPlaceholderText("Search keys and values…")).toBeInTheDocument();
    });

    it("collapses/expands a nested object on click", () => {
      render(
        <ThemeProvider>
          <EntityViewer contents={JSON.stringify({ nested: { a: 1, b: 2, c: 3, d: 4 } })} />
        </ThemeProvider>,
      );
      // depth < 2 starts expanded, so all 4 keys are visible initially.
      expect(screen.getByText(/^a$/)).toBeInTheDocument();
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run web/src/__tests__/EntityViewer.test.tsx` → expect FAIL (module not found).
- [ ] Run it again after the two files above are in place → expect PASS.
- [ ] `git add apps/model-editor-mcp/package.json apps/model-editor-mcp/web/src/JsonTree.tsx apps/model-editor-mcp/web/src/EntityViewer.tsx apps/model-editor-mcp/web/src/__tests__/EntityViewer.test.tsx pnpm-lock.yaml && git commit -m "feat(model-editor-mcp): read-only EntityViewer JSON tree, ported from dev-console"`

---

### Task 22: web shell — collapsible picker sidebar + contextual Graph|JSON / Tree|JSON tabs

The biggest single piece of new web code: `App.tsx` grows from "always show whatever Claude pushed" into a real navigable shell with independent browser-driven state. Existing SSE/drag/echo-suppression/dirty-banner logic in `App.tsx`/`EditorView.tsx` is preserved unchanged; it is now *gated* on "is the currently-viewed item this workflow" rather than unconditionally applied.

**Files:**
- Create `apps/model-editor-mcp/web/src/api.ts` (thin `fetch` wrappers for the Task 19 endpoints)
- Create `apps/model-editor-mcp/web/src/Sidebar.tsx`
- Create `apps/model-editor-mcp/web/src/WorkflowPane.tsx` (Graph|JSON tabs wrapping the existing `EditorView` + new `MonacoJsonViewer`)
- Create `apps/model-editor-mcp/web/src/EntityPane.tsx` (Tree|JSON tabs wrapping `EntityViewer` + `MonacoJsonViewer`)
- Modify `apps/model-editor-mcp/web/src/App.tsx` (owns sidebar/index/current-view state; SSE `show` still wins over the human's pick)
- Modify `apps/model-editor-mcp/web/src/__tests__/App.test.tsx` (existing SSE-state tests now exercise `App` through the new shell — mocks extended)
- Create `apps/model-editor-mcp/web/src/__tests__/AppShell.test.tsx`

**Interfaces:**
- Produces (`api.ts`):
  ```ts
  export interface IndexItem { name: string; path: string }
  export interface IndexResponse { workflows: IndexItem[]; entities: IndexItem[] }
  export interface WorkflowApiPayload { name: string; path: string; content: string; layout: Record<string, unknown> }
  export interface EntityApiPayload { name: string; path: string; contents: string }
  export function fetchIndex(): Promise<IndexResponse>;
  export function fetchWorkflow(name: string): Promise<WorkflowApiPayload>;
  export function fetchEntity(name: string): Promise<EntityApiPayload>;
  ```
- Produces (`Sidebar.tsx`): `export function Sidebar(props: SidebarProps): JSX.Element;` — see below.
- Produces (`WorkflowPane.tsx`/`EntityPane.tsx`): presentational wrappers, no new state contract beyond their props.
- Consumes `EditorView` (unchanged, `./EditorView.js`), `MonacoJsonViewer` (`./MonacoJsonViewer.js`), `EntityViewer` (`./EntityViewer.js`), `Tabs`/`TabItem` (`@cyoda/console-design-system`).

**Steps:**
- [ ] Write `web/src/api.ts`:
  ```ts
  export interface IndexItem { name: string; path: string }
  export interface IndexResponse { workflows: IndexItem[]; entities: IndexItem[] }
  export interface WorkflowApiPayload { name: string; path: string; content: string; layout: Record<string, unknown> }
  export interface EntityApiPayload { name: string; path: string; contents: string }

  async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return (await res.json()) as T;
  }

  export const fetchIndex = (): Promise<IndexResponse> => getJson("/api/index");
  export const fetchWorkflow = (name: string): Promise<WorkflowApiPayload> => getJson(`/api/workflow/${encodeURIComponent(name)}`);
  export const fetchEntity = (name: string): Promise<EntityApiPayload> => getJson(`/api/entity/${encodeURIComponent(name)}`);
  ```
- [ ] Write `web/src/Sidebar.tsx`:
  ```tsx
  import { useState } from "react";
  import { useTokens } from "@cyoda/console-design-system";
  import type { IndexItem } from "./api.js";

  export interface CurrentSelection { kind: "workflow" | "entity"; name: string }

  export interface SidebarProps {
    workflows: IndexItem[];
    entities: IndexItem[];
    current: CurrentSelection | null;
    onSelect: (kind: "workflow" | "entity", name: string) => void;
    onRefresh: () => void;
    collapsed: boolean;
    onToggleCollapsed: () => void;
  }

  /** Collapsible left picker: Workflows/Entities groups, filterable by name.
   *  Toggling collapsed hides the list entirely so the main pane goes full-width. */
  export function Sidebar({ workflows, entities, current, onSelect, onRefresh, collapsed, onToggleCollapsed }: SidebarProps) {
    const t = useTokens();
    const [filter, setFilter] = useState("");

    if (collapsed) {
      return (
        <button onClick={onToggleCollapsed} aria-label="Show sidebar" style={{ width: 28, border: "none", background: t.color.surfaceAlt, cursor: "pointer" }}>
          »
        </button>
      );
    }

    const q = filter.trim().toLowerCase();
    const matches = (item: IndexItem) => q === "" || item.name.toLowerCase().includes(q);

    return (
      <div style={{ width: 240, display: "flex", flexDirection: "column", borderRight: `1px solid ${t.color.border}`, height: "100%", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: 8 }}>
          <input
            type="search"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ flex: 1, height: 26, padding: "0 6px", border: `1px solid ${t.color.border}`, borderRadius: 2 }}
          />
          <button onClick={onRefresh} aria-label="Refresh list" style={{ border: "none", background: "none", cursor: "pointer" }}>⟳</button>
          <button onClick={onToggleCollapsed} aria-label="Hide sidebar" style={{ border: "none", background: "none", cursor: "pointer" }}>«</button>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          <Group title="Workflows" items={workflows.filter(matches)} kind="workflow" current={current} onSelect={onSelect} />
          <Group title="Entities" items={entities.filter(matches)} kind="entity" current={current} onSelect={onSelect} />
        </div>
      </div>
    );
  }

  function Group({ title, items, kind, current, onSelect }: {
    title: string; items: IndexItem[]; kind: "workflow" | "entity";
    current: CurrentSelection | null;
    onSelect: (kind: "workflow" | "entity", name: string) => void;
  }) {
    const t = useTokens();
    return (
      <div>
        <div style={{ padding: "6px 8px", fontSize: 11, textTransform: "uppercase", color: t.color.textMuted }}>{title}</div>
        {items.map((item) => {
          const active = current?.kind === kind && current.name === item.name;
          return (
            <button
              key={item.name}
              onClick={() => onSelect(kind, item.name)}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "6px 8px",
                border: "none", background: active ? t.color.surfaceAlt : "transparent",
                cursor: "pointer", fontSize: 13, color: t.color.text,
              }}
            >
              {item.name}
            </button>
          );
        })}
        {items.length === 0 ? <div style={{ padding: "4px 8px", fontSize: 12, color: t.color.textMuted }}>None</div> : null}
      </div>
    );
  }
  ```
- [ ] Write `web/src/WorkflowPane.tsx`:
  ```tsx
  import { useState } from "react";
  import type { WorkflowUiMeta } from "@cyoda/workflow-core";
  import { Tabs } from "@cyoda/console-design-system";
  import { EditorView } from "./EditorView.js";
  import { MonacoJsonViewer } from "./MonacoJsonViewer.js";

  export function WorkflowPane({
    token, origin, workflow, content, layout, layoutRev, contentRev, externalContent, onDismissExternal, onDirtyChange,
  }: {
    token: string; origin: string; workflow: string; content: string;
    layout: Record<string, WorkflowUiMeta>; layoutRev: number; contentRev: number;
    externalContent: string | null; onDismissExternal: () => void; onDirtyChange: (dirty: boolean) => void;
  }) {
    const [tab, setTab] = useState<"graph" | "json">("graph");
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <Tabs tabs={[{ id: "graph", label: "Graph" }, { id: "json", label: "JSON" }]} activeId={tab} onChange={(id) => setTab(id as "graph" | "json")} />
        <div style={{ flex: 1, minHeight: 0 }}>
          {tab === "graph" ? (
            <EditorView
              key={`${workflow}:${contentRev}`}
              token={token} origin={origin} workflow={workflow} content={content} layout={layout}
              layoutRev={layoutRev} externalContent={externalContent} onDismissExternal={onDismissExternal} onDirtyChange={onDirtyChange}
            />
          ) : (
            <MonacoJsonViewer contents={externalContent ?? content} />
          )}
        </div>
      </div>
    );
  }
  ```
- [ ] Write `web/src/EntityPane.tsx`:
  ```tsx
  import { useState } from "react";
  import { Tabs } from "@cyoda/console-design-system";
  import { EntityViewer } from "./EntityViewer.js";
  import { MonacoJsonViewer } from "./MonacoJsonViewer.js";

  export function EntityPane({ contents }: { contents: string }) {
    const [tab, setTab] = useState<"tree" | "json">("tree");
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <Tabs tabs={[{ id: "tree", label: "Tree" }, { id: "json", label: "JSON" }]} activeId={tab} onChange={(id) => setTab(id as "tree" | "json")} />
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {tab === "tree" ? (
            <div style={{ padding: 16, height: "100%", boxSizing: "border-box" }}>
              <EntityViewer contents={contents} />
            </div>
          ) : (
            <MonacoJsonViewer contents={contents} />
          )}
        </div>
      </div>
    );
  }
  ```
- [ ] Rewrite `web/src/App.tsx` (preserves every existing SSE/drag/dirty behavior; adds the picker, the index fetch, and the workflow/entity `View` union — Claude's `show` push always overrides the human's current pick, matching "last one wins"; `content`/`layout` pushes for a workflow the human isn't currently viewing are ignored):
  ```tsx
  import { useCallback, useEffect, useRef, useState } from "react";
  import type { WorkflowUiMeta } from "@cyoda/workflow-core";
  import { subscribe } from "./sseClient.js";
  import type { SseEvent } from "./sseClient.js";
  import { fetchIndex, fetchWorkflow, fetchEntity } from "./api.js";
  import type { IndexItem } from "./api.js";
  import { Sidebar } from "./Sidebar.js";
  import { WorkflowPane } from "./WorkflowPane.js";
  import { EntityPane } from "./EntityPane.js";

  const TOKEN: string = (window as unknown as { __MODEL_EDITOR__?: { token: string } }).__MODEL_EDITOR__?.token ?? "";
  const ORIGIN = crypto.randomUUID();

  interface WorkflowView { kind: "workflow"; workflow: string; content: string; layout: Record<string, WorkflowUiMeta>; layoutRev: number; contentRev: number }
  interface EntityView { kind: "entity"; name: string; contents: string }
  type View = WorkflowView | EntityView;

  export function App() {
    const [view, setView] = useState<View | null>(null);
    const [externalContent, setExternalContent] = useState<string | null>(null);
    const [index, setIndex] = useState<{ workflows: IndexItem[]; entities: IndexItem[] }>({ workflows: [], entities: [] });
    const [collapsed, setCollapsed] = useState(false);

    const draggingRef = useRef(false);
    const deferredRef = useRef<Extract<SseEvent, { type: "layout" }> | null>(null);
    const dirtyRef = useRef(false);
    const onDirtyChange = useCallback((dirty: boolean) => { dirtyRef.current = dirty; }, []);

    const refreshIndex = useCallback(() => { void fetchIndex().then(setIndex); }, []);
    useEffect(() => { refreshIndex(); }, [refreshIndex]);

    function applyLayout(layout: Record<string, WorkflowUiMeta>): void {
      setView((v) => (v && v.kind === "workflow" ? { ...v, layout, layoutRev: v.layoutRev + 1 } : v));
    }

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

    useEffect(() => subscribe(ORIGIN, (e) => {
      if (e.type === "show") {
        // Claude's push always wins over whatever the human is currently browsing.
        setExternalContent(null);
        setView({ kind: "workflow", workflow: e.workflow, content: e.content, layout: e.layout, layoutRev: 0, contentRev: 0 });
      } else if (e.type === "content") {
        setView((v) => {
          if (!v || v.kind !== "workflow" || v.workflow !== e.workflow) return v; // not the current view — ignored
          if (dirtyRef.current) { setExternalContent(e.content); return v; }
          return { ...v, content: e.content, contentRev: v.contentRev + 1 };
        });
      } else if (e.type === "layout") {
        if (e.origin === ORIGIN) return; // echo suppression
        setView((v) => {
          if (!v || v.kind !== "workflow" || v.workflow !== e.workflow) return v; // not the current view — ignored
          if (draggingRef.current) { deferredRef.current = e; return v; }
          return { ...v, layout: e.layout, layoutRev: v.layoutRev + 1 };
        });
      }
    }), []);

    const onSelect = useCallback((kind: "workflow" | "entity", name: string) => {
      if (kind === "workflow") {
        void fetchWorkflow(name).then((p) => {
          setExternalContent(null);
          setView({ kind: "workflow", workflow: p.name, content: p.content, layout: p.layout as Record<string, WorkflowUiMeta>, layoutRev: 0, contentRev: 0 });
        });
      } else {
        void fetchEntity(name).then((p) => {
          setExternalContent(null);
          setView({ kind: "entity", name: p.name, contents: p.contents });
        });
      }
    }, []);

    const current = view ? { kind: view.kind, name: view.kind === "workflow" ? view.workflow : view.name } : null;

    return (
      <div style={{ display: "flex", height: "100%" }}>
        <Sidebar
          workflows={index.workflows}
          entities={index.entities}
          current={current}
          onSelect={onSelect}
          onRefresh={refreshIndex}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
        />
        <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
          {!view ? (
            <div style={{ padding: 24, fontFamily: "system-ui" }}>
              Waiting for Claude to <code>show_workflow</code>, or pick a workflow/entity from the sidebar…
            </div>
          ) : view.kind === "workflow" ? (
            <WorkflowPane
              token={TOKEN}
              origin={ORIGIN}
              workflow={view.workflow}
              content={view.content}
              layout={view.layout}
              layoutRev={view.layoutRev}
              contentRev={view.contentRev}
              externalContent={externalContent}
              onDismissExternal={() => setExternalContent(null)}
              onDirtyChange={onDirtyChange}
            />
          ) : (
            <EntityPane contents={view.contents} />
          )}
        </div>
      </div>
    );
  }
  ```
- [ ] Update the existing `web/src/__tests__/App.test.tsx`: it mocks `../EditorView.js` and `../sseClient.js` already; `App` now also imports `./api.js` (for `fetchIndex`, called unconditionally on mount) and renders through `WorkflowPane` rather than `EditorView` directly. Add a `fetch` stub so `refreshIndex()` doesn't reject in every existing test, and re-point the `EditorView` mock capture through `WorkflowPane` (which forwards every relevant prop straight through, so the existing assertions on `capturedProps` keep working unchanged once `WorkflowPane` is NOT mocked — only `EditorView` is):
  ```ts
  // add near the top, alongside the existing two vi.mock calls:
  vi.mock("../monacoRuntime.js", () => ({ getMonacoRuntime: vi.fn() }));
  // (WorkflowPane's "json" tab is never selected in these tests, so MonacoJsonViewer
  // never mounts — but MonacoJsonViewer.tsx calls getMonacoRuntime() at MODULE SCOPE
  // on import, and WorkflowPane imports it unconditionally, so the mock is required
  // regardless of which tab is active — same discipline apps/dev-console uses.)
  ```
  ```ts
  beforeEach(() => {
    capturedProps = null;
    onEventCb = null;
    subscribedOrigin = null;
    unsubscribe.mockClear();
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ workflows: [], entities: [] }) })));
  });
  ```
  ```ts
  afterEach(() => {
    cleanup();
    delete (window as unknown as { __MODEL_EDITOR__?: unknown }).__MODEL_EDITOR__;
    vi.unstubAllGlobals();
  });
  ```
  All existing `expect(capturedProps?...)` assertions in that file continue to pass unchanged: `WorkflowPane` forwards `token`/`origin`/`workflow`/`content`/`layout`/`layoutRev`/`externalContent`/`onDirtyChange` straight to `EditorView` (the mocked component), with only `contentRev` added as a new prop `WorkflowPane` consumes for its own `key` and does NOT forward — none of the existing assertions reference `contentRev` on `capturedProps`, so this is safe.
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run web/src/__tests__/App.test.tsx` → expect PASS (behavior preserved).
- [ ] Write the failing `web/src/__tests__/AppShell.test.tsx` (the new picker/shell behavior):
  ```tsx
  /** @vitest-environment happy-dom */
  import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
  import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
  import { ThemeProvider } from "@cyoda/console-design-system";
  import type { SseEvent } from "../sseClient.js";

  vi.mock("../monacoRuntime.js", () => ({ getMonacoRuntime: vi.fn() }));

  let capturedEditorProps: Record<string, unknown> | null = null;
  vi.mock("../EditorView.js", () => ({
    EditorView: (props: Record<string, unknown>) => { capturedEditorProps = props; return <div data-testid="graph-pane" />; },
  }));

  let onEventCb: ((e: SseEvent) => void) | null = null;
  vi.mock("../sseClient.js", () => ({
    subscribe: (_origin: string, onEvent: (e: SseEvent) => void) => { onEventCb = onEvent; return vi.fn(); },
  }));

  const INDEX = {
    workflows: [{ name: "Pledge", path: "models/workflow/Pledge.json" }],
    entities: [{ name: "CollateralAsset", path: "models/schema/CollateralAsset.json" }],
  };

  function stubFetch() {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/index") return { ok: true, json: async () => INDEX };
      if (url === "/api/workflow/Pledge") return { ok: true, json: async () => ({ name: "Pledge", path: "x", content: "wf-content", layout: {} }) };
      if (url === "/api/entity/CollateralAsset") return { ok: true, json: async () => ({ name: "CollateralAsset", path: "x", contents: '{"a":1}' }) };
      throw new Error(`unexpected fetch: ${url}`);
    }));
  }

  async function importApp() {
    const mod = await import("../App.js");
    return mod.App;
  }

  beforeEach(() => { capturedEditorProps = null; onEventCb = null; vi.resetModules(); stubFetch(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  describe("App shell — picker + navigation", () => {
    it("fetches /api/index on mount and lists workflows/entities in the sidebar", async () => {
      const App = await importApp();
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => expect(screen.getByText("Pledge")).toBeInTheDocument());
      expect(screen.getByText("CollateralAsset")).toBeInTheDocument();
    });

    it("clicking a workflow in the sidebar fetches it and shows the Graph pane", async () => {
      const App = await importApp();
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => expect(screen.getByText("Pledge")).toBeInTheDocument());

      fireEvent.click(screen.getByText("Pledge"));

      await waitFor(() => expect(capturedEditorProps).toMatchObject({ workflow: "Pledge", content: "wf-content" }));
      expect(screen.getByTestId("graph-pane")).toBeInTheDocument();
    });

    it("clicking an entity in the sidebar fetches it and shows the entity Tree pane", async () => {
      const App = await importApp();
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => expect(screen.getByText("CollateralAsset")).toBeInTheDocument());

      fireEvent.click(screen.getByText("CollateralAsset"));

      await waitFor(() => expect(screen.getByPlaceholderText("Search keys and values…")).toBeInTheDocument());
    });

    it("a Claude show push overrides the human's current entity pick — last one wins", async () => {
      const App = await importApp();
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => expect(screen.getByText("CollateralAsset")).toBeInTheDocument());
      fireEvent.click(screen.getByText("CollateralAsset"));
      await waitFor(() => expect(screen.getByPlaceholderText("Search keys and values…")).toBeInTheDocument());

      onEventCb?.({ type: "show", workflow: "Pledge", revision: 1, content: "pushed-content", layout: {} });

      await waitFor(() => expect(capturedEditorProps).toMatchObject({ workflow: "Pledge", content: "pushed-content" }));
    });

    it("a content push for a workflow the human is NOT currently viewing is ignored", async () => {
      const App = await importApp();
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => expect(screen.getByText("CollateralAsset")).toBeInTheDocument());
      fireEvent.click(screen.getByText("CollateralAsset"));
      await waitFor(() => expect(screen.getByPlaceholderText("Search keys and values…")).toBeInTheDocument());

      onEventCb?.({ type: "content", workflow: "Pledge", revision: 1, content: "unrelated" });

      // still on the entity view — no crash, no switch
      expect(screen.getByPlaceholderText("Search keys and values…")).toBeInTheDocument();
    });

    it("the sidebar collapse toggle hides and restores the picker", async () => {
      const App = await importApp();
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => expect(screen.getByText("Pledge")).toBeInTheDocument());

      fireEvent.click(screen.getByLabelText("Hide sidebar"));
      expect(screen.queryByText("Pledge")).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("Show sidebar"));
      await waitFor(() => expect(screen.getByText("Pledge")).toBeInTheDocument());
    });

    it("the filter box narrows the visible workflow/entity list", async () => {
      const App = await importApp();
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => expect(screen.getByText("Pledge")).toBeInTheDocument());

      fireEvent.change(screen.getByPlaceholderText("Filter…"), { target: { value: "Collateral" } });

      expect(screen.queryByText("Pledge")).not.toBeInTheDocument();
      expect(screen.getByText("CollateralAsset")).toBeInTheDocument();
    });
  });
  ```
- [ ] Run `pnpm --filter model-editor-mcp exec vitest run web/src/__tests__/AppShell.test.tsx` → expect FAIL, then PASS once `Sidebar`/`WorkflowPane`/`EntityPane`/`api.ts`/the new `App.tsx` above are all in place.
- [ ] Run the FULL web suite `pnpm --filter model-editor-mcp exec vitest run web/` → expect PASS.
- [ ] Verify the bundle still builds: `pnpm --filter model-editor-mcp exec vite build --config web/vite.config.ts`.
- [ ] `git add apps/model-editor-mcp/web/src/api.ts apps/model-editor-mcp/web/src/Sidebar.tsx apps/model-editor-mcp/web/src/WorkflowPane.tsx apps/model-editor-mcp/web/src/EntityPane.tsx apps/model-editor-mcp/web/src/App.tsx apps/model-editor-mcp/web/src/__tests__/App.test.tsx apps/model-editor-mcp/web/src/__tests__/AppShell.test.tsx && git commit -m "feat(model-editor-mcp): collapsible picker sidebar + contextual Graph|JSON / Tree|JSON tabs"`

---

### Task 23: extend the Playwright smoke — entity into the Tree/JSON view, picker switching (real headless Chromium)

**Files:**
- Modify `apps/model-editor-mcp/e2e/smoke.spec.ts`
- Create `apps/model-editor-mcp/e2e/fixtures/CollateralAsset.json`

**Interfaces:**
- Consumes the same real MCP-stdio-driven server + built `web/dist/` as Task 13; no new interfaces, purely additional assertions against the running app.

**Steps:**
- [ ] Create `e2e/fixtures/CollateralAsset.json`:
  ```json
  { "type": "object", "properties": { "assetId": { "type": "string" }, "valuationCcy": { "type": "string" } }, "required": ["assetId"] }
  ```
- [ ] Extend `test.beforeAll` in `e2e/smoke.spec.ts` to also lay out the entity fixture under `models/schema/` (alongside the `models/workflow/` layout from Task 15):
  ```ts
  test.beforeAll(async () => {
    fixture = await mkdtemp(join(tmpdir(), "mem-e2e-"));
    await mkdir(join(fixture, "models", "workflow"), { recursive: true });
    await mkdir(join(fixture, "models", "schema"), { recursive: true });
    await cp(join(here, "fixtures", "Pledge.json"), join(fixture, "models", "workflow", "Pledge.json"));
    await cp(join(here, "fixtures", "LegalEntity.json"), join(fixture, "models", "workflow", "LegalEntity.json"));
    await cp(join(here, "fixtures", "CollateralAsset.json"), join(fixture, "models", "schema", "CollateralAsset.json"));
    child = spawn("node", [serverEntry, "--project", fixture], { stdio: ["pipe", "pipe", "pipe"] });
    rpc("initialize");
  });
  ```
- [ ] Append a second test to `e2e/smoke.spec.ts` (after the existing `"renders reactflow nodes and live-swaps..."` test), driving the picker instead of MCP stdio for navigation:
  ```ts
  test("self-service picker: browses an entity's read-only Tree/JSON view and switches workflow ↔ entity", async ({ page }) => {
    const url = await waitForUrl();
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(url);

    // Claude shows Pledge first, exactly like the first test — proves the picker
    // and the MCP-driven push coexist in the same session.
    rpc("tools/call", { name: "show_workflow", arguments: { name: "Pledge" } });
    await expect(page.locator(".react-flow__node")).toHaveCount(3, { timeout: 15_000 });

    // Self-service: click the entity in the sidebar picker (no MCP call involved).
    await page.getByRole("button", { name: "CollateralAsset" }).click();
    await expect(page.getByPlaceholderText("Search keys and values…")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("assetId")).toBeVisible();

    // Switch to the entity's read-only JSON tab — a genuinely separate Monaco pane.
    await page.getByRole("tab", { name: "JSON" }).click();
    await expect(page.locator(".monaco-editor")).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => page.locator(".monaco-editor").innerText(), { timeout: 10_000 }).toContain("assetId");

    // Switch back to a workflow via the picker (not MCP) — proves the picker drives
    // the SAME rendering path show_workflow does.
    await page.getByRole("button", { name: "LegalEntity" }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(3, { timeout: 15_000 });
    const legalNodes = await page.locator(".react-flow__node").allInnerTexts();
    expect(legalNodes.join(" ")).toContain("draft");

    expect(errors).toEqual([]);
  });
  ```
- [ ] Run `pnpm -r build && pnpm --filter model-editor-mcp test:e2e` → expect BOTH tests PASS.
- [ ] `git add apps/model-editor-mcp/e2e/smoke.spec.ts apps/model-editor-mcp/e2e/fixtures/CollateralAsset.json && git commit -m "test(model-editor-mcp): headless-chromium smoke for the entity Tree/JSON view + self-service picker"`

---

### Task 24: docs — `.mcp.json.example`, `README.md`

CI already runs `pnpm --filter model-editor-mcp build` → `playwright install --with-deps chromium` → `pnpm --filter model-editor-mcp test:e2e` on every PR (wired in the base plan's Task 14); the Task 23 additions run inside that same invocation, so `.github/workflows/ci.yml` needs no change.

**Files:**
- Modify `apps/model-editor-mcp/.mcp.json.example`
- Modify `apps/model-editor-mcp/README.md`

**Interfaces:** none — documentation only.

**Steps:**
- [ ] Rewrite `.mcp.json.example` to show the new flags explicitly (values shown equal the built-in defaults from `cliArgs.ts` — this is a template to edit, not a required override):
  ```json
  {
    "mcpServers": {
      "model-editor": {
        "command": "node",
        "args": [
          "apps/model-editor-mcp/dist/index.js",
          "--project", ".",
          "--workflow-globs", "models/workflow/**/*.json",
          "--entity-globs", "models/schema/**/*.json"
        ]
      }
    }
  }
  ```
- [ ] Rewrite `README.md`:
  ```markdown
  # model-editor-mcp

  MCP server for a live, browser-rendered Cyoda model editor — workflows AND entities — driven by an AI CLI via `.mcp.json`.

  Claude Code spawns it over stdio (see `.mcp.json.example`); it serves the real
  `@cyoda/workflow-react` editor plus a read-only entity viewer at a deterministic
  `http://127.0.0.1:<port>/` and pushes live updates over SSE. Claude drives all
  content (workflows via `update_workflow`, entities via `create_entity`/
  `update_entity`/`delete_entity`, both validated); the human arranges the canvas
  (drags persist via `POST /layout`) and browses freely — a collapsible sidebar
  picker lets you jump between any discovered workflow or entity without asking
  Claude. Ask Claude for the URL any time via `connection_info`.

  ## Content ownership

  Content is single-writer (Claude) throughout: the workflow graph pane warns on
  local edits (Save doesn't persist); the workflow JSON pane and the entity
  Tree/JSON panes are genuinely **read-only** Monaco/tree views — there is no
  browser content-write path anywhere in this app. Layout drags are the one
  thing the human owns directly, persisted to each workflow's `.layout.json`
  sidecar.

  ## Discovery — explicit, narrow locations only

  There is no whole-project scan. The server globs only `workflowGlobs`/
  `entityGlobs` (defaults: `models/workflow/**/*.json`, `models/schema/**/*.json`
  — override with `--workflow-globs`/`--entity-globs` at startup, or mid-session
  via `configure_project`). An **entity** is a separate plain-JSON *object* file
  (never embedded in a workflow); entity tools are name-based, exactly like the
  workflow tools (name = file stem).

  ## Tools

  Workflows:
  - `list_workflows()` → `{ workflows: [{ name, path, states, transitions, valid }] }`
  - `show_workflow(name)` — render it in the browser + return the parsed document
  - `update_workflow(name, content)` — validated whole-document write + diff (writes nothing on failure)
  - `optimize_layout(name, options?)` — elkjs re-layout; `options`: `{ orientation?, preset?, nodeSize?, pinned? }`
  - `validate_workflow(name)` — diagnostics, read-only

  Entities (separate plain-JSON object files; name = file stem):
  - `list_entities()` → `{ entities: [{ name, path }] }`
  - `get_entity(name)` — read raw JSON contents
  - `create_entity(name, content)` — rejects if the name already exists
  - `update_entity(name, content)` — overwrite an existing entity's whole document
  - `delete_entity(name)`

  Project configuration (session-only, never persisted to disk):
  - `configure_project({ name?, workflowGlobs?, entityGlobs? })` — updates the session's discovery globs
  - `get_project()` → `{ root, workflowGlobs, entityGlobs, counts: { workflows, entities } }`

  Connection:
  - `connection_info()` — the browser URL/port

  ## Browser navigation

  The left sidebar lists discovered Workflows/Entities (filterable; collapsible
  to full-width canvas). Clicking an item fetches it directly from the server
  (`GET /api/workflow/:name` / `GET /api/entity/:name`, loopback-gated and
  name-allowlisted — no new write surface) — this works independently of
  Claude. A workflow opens with **Graph | JSON** tabs (JSON is the read-only
  Monaco pane, a *separate* pane from the graph's own JSON tab, which stays
  read-only-content-with-a-warning as before); an entity opens with **Tree |
  JSON** tabs (both read-only). Claude's `show_workflow` always overrides
  whatever the human is currently browsing — the visual channel stays one-way
  for content, browsable in both directions for navigation.

  ## Register with Claude Code

  Build the server, then copy the example config to the repo root:

  ```bash
  pnpm --filter model-editor-mcp build
  cp apps/model-editor-mcp/.mcp.json.example .mcp.json
  ```

  Claude Code reads `.mcp.json` at the repo root and starts the server over
  stdio the next time you run it there. Watch stderr for the line
  `model-editor-mcp: http://127.0.0.1:<port>/?token=<hex>` and open that URL in
  a browser to see the live editor — it updates as Claude calls tools, with no
  reload needed.

  ## Develop
  - `pnpm --filter model-editor-mcp build` — compile the server (`dist/`) and the web bundle (`web/dist/`)
  - `pnpm --filter model-editor-mcp test` — unit/integration (vitest, node + happy-dom)
  - `pnpm --filter model-editor-mcp test:e2e` — headless-chromium render smoke (build first)
  ```
- [ ] Run `pnpm --filter model-editor-mcp build && pnpm --filter model-editor-mcp test && pnpm --filter model-editor-mcp exec playwright install --with-deps chromium && pnpm --filter model-editor-mcp test:e2e` → expect PASS end to end.
- [ ] Run `pnpm typecheck && pnpm lint` at the repo root → expect PASS (fix any fallout before committing).
- [ ] `git add apps/model-editor-mcp/.mcp.json.example apps/model-editor-mcp/README.md && git commit -m "docs(model-editor-mcp): document entities, project config, and self-service navigation"`

---
