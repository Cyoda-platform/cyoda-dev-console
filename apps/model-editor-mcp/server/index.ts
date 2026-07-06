import { parseArgs } from "node:util";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { synthesizeImportPayload } from "@cyoda/workflow-editor-host/synthesizeImportPayload";
import { createToolContext } from "./context.js";
import type { ToolContext } from "./context.js";
import { DEFAULT_WORKFLOW_GLOBS, DEFAULT_ENTITY_GLOBS, parseGlobsArg } from "./cliArgs.js";
import { createSseHub } from "./sse.js";
import type { SseHub } from "./sse.js";
import { createHttpServer } from "./http.js";
import { createWatcher } from "./watch.js";
import type { WorkflowChange } from "./watch.js";
import { bindPort, DuplicateInstanceError } from "./port.js";
import { mergeLayout, loadRemappedLayout } from "./layout.js";
import { findByName, findEntityByName } from "./discovery.js";
import { startMcpServer } from "./mcp.js";
import type { ToolHandler } from "./envelope.js";
import { listWorkflowsTool } from "./tools/list.js";
import { showWorkflowTool } from "./tools/show.js";
import type { ShownPayload } from "./tools/show.js";
import { getWorkflowTool } from "./tools/get_workflow.js";
import { updateWorkflowTool } from "./tools/update.js";
import { createWorkflowTool, deleteWorkflowTool } from "./tools/workflows_crud.js";
import { updateTransitionTool, addTransitionTool, removeTransitionTool } from "./tools/transitions.js";
import { validateWorkflowTool, validateWorkflowsTool } from "./tools/validate.js";
import { optimizeLayoutTool } from "./tools/optimize_layout.js";
import { connectionInfoTool } from "./tools/connection_info.js";
import { listEntitiesTool, getEntityTool, createEntityTool, updateEntityTool, deleteEntityTool } from "./tools/entities.js";
import { showEntityTool } from "./tools/show_entity.js";
import type { ShownEntityPayload } from "./tools/show_entity.js";
import { getProjectTool, configureProjectTool } from "./tools/project.js";

/**
 * ONE monotonic source for every SSE push's `revision` (show / content / layout) — closes the
 * `Date.now()` collision flagged in Tasks 6/8/10: two pushes minted independently within the
 * same millisecond could otherwise carry equal revisions. Never decreases even if the system
 * clock does; ticks forward by at least 1 on every call.
 */
export function createRevisionCounter(): () => number {
  let last = 0;
  return () => {
    const now = Date.now();
    last = now > last ? now : last + 1;
    return last;
  };
}

/** `workflowFile` (content-relative-path) → origin, set immediately before the corresponding
 *  `.layout.json` write so the watch-driven broadcast that write triggers can echo-suppress the
 *  posting tab (and only that tab) once, then forget it. */
export type PendingOrigins = Map<string, string>;

/**
 * Build the `writeLayout` closure `http.ts`'s `POST /layout` forwards `(name, workflowUi,
 * origin)` into: merges the incoming per-workflow node layout into the existing sidecar and
 * writes it back, and — if `origin` is non-empty — records it in `pendingOrigins` keyed by the
 * workflow's *content* relative path (matching the key `createOnChange`'s layout branch looks
 * up). An unknown `name` no-ops (no write, no throw): `http.ts` already 404s an unlisted
 * workflow before ever calling this, so reaching here with no matching entry is a race, not the
 * common path, and dropping the write silently is safer than throwing mid-request.
 */
export function createWriteLayout(
  ctx: Pick<ToolContext, "discover" | "read" | "write">,
  pendingOrigins: PendingOrigins,
): (name: string, workflowUi: Record<string, unknown>, origin: string) => Promise<void> {
  return async (name, workflowUi, origin) => {
    const entry = findByName(await ctx.discover(), name);
    if (!entry) return;
    const sidecarRel = entry.relativePath.replace(/\.json$/, ".layout.json");
    let existing: Record<string, unknown> = {};
    try { existing = JSON.parse((await ctx.read(sidecarRel)).contents) as Record<string, unknown>; } catch { /* missing/invalid sidecar → {} */ }
    await ctx.write(sidecarRel, JSON.stringify(mergeLayout(existing, workflowUi), null, 2));
    // Record the origin ONLY after a successful write: it exists solely to echo-suppress the
    // watch event that write is about to fire. If the write threw, no event will come to consume
    // it — leaving it set would let a LATER unrelated change to this file wrongly suppress the
    // tab. The watch is debounced (~120ms), so setting here still lands well before onChange reads it.
    if (origin) pendingOrigins.set(entry.relativePath, origin);
  };
}

/**
 * Build the watch-driven `onChange`: for every settled `(kind, workflowFile)` change the
 * watcher reports, re-read the file from disk (the browser can never touch it directly) and
 * broadcast the resulting push over `hub`. Both `content` and `layout` changes are pushed
 * UNCONDITIONALLY — regardless of `hub.currentShown()` (which only reflects Claude's last
 * `show_workflow`, never the browser's own sidebar-picker navigation). The browser is the one
 * that gates on its current view (`web/src/App.tsx`'s `content`/`layout` handlers each check
 * `v.workflow === e.workflow` before applying), so a workflow the human is browsing via the
 * picker still gets live content updates even though Claude never `show_workflow`'d it. Layout
 * pushes additionally echo-suppress whichever tab's `POST /layout` triggered them via
 * `pendingOrigins`.
 *
 * Deleted/renamed files are handled gracefully, never thrown: if `discover()` no longer lists
 * the file at all (the common case — a real delete/rename settles before this runs), the lookup
 * simply comes up empty and the push is skipped; if a rename/delete instead races the re-read
 * itself (file still listed a moment ago, gone now), the read's `ENOENT` is caught and the push
 * is skipped the same way.
 */
export function createOnChange(
  ctx: Pick<ToolContext, "discover" | "read" | "parseImport" | "serializeImport">,
  hub: Pick<SseHub, "broadcast">,
  pendingOrigins: PendingOrigins,
  nextRevision: () => number,
): (change: WorkflowChange) => Promise<void> {
  const nameForFile = async (workflowFile: string): Promise<string | null> => {
    const entry = (await ctx.discover()).find((e) => e.relativePath === workflowFile);
    return entry ? entry.workflows[0]?.name ?? workflowFile.replace(/\.json$/, "").split("/").pop()! : null;
  };

  return async (change) => {
    const name = await nameForFile(change.workflowFile);
    if (!name) return; // deleted/renamed out of the discovered set — nothing to push

    if (change.kind === "layout") {
      const origin = pendingOrigins.get(change.workflowFile);
      pendingOrigins.delete(change.workflowFile);
      // Re-parse the content file for its current transition ids so the sidecar's saved
      // synthetic uuids remap correctly; a concurrent delete/rename of the content file is not
      // fatal here — loadRemappedLayout still returns the sidecar's own layout, just unremapped.
      const parsed = await ctx.read(change.workflowFile)
        .then((f) => ctx.parseImport(synthesizeImportPayload(f.contents)))
        .catch(() => null);
      const layout = await loadRemappedLayout(ctx as ToolContext, change.workflowFile, parsed?.document?.meta.ids.transitions ?? {});
      // `exactOptionalPropertyTypes` forbids `origin: undefined` — spread it in only when present.
      hub.broadcast({ type: "layout", workflow: name, revision: nextRevision(), layout, ...(origin !== undefined ? { origin } : {}) }, origin);
      return;
    }

    let contents: string;
    try {
      contents = (await ctx.read(change.workflowFile)).contents;
    } catch {
      return; // ENOENT etc. — a delete/rename raced the debounce; skip the push, don't throw
    }
    const parsed = ctx.parseImport(synthesizeImportPayload(contents));
    const content = parsed.document ? ctx.serializeImport(parsed.document) : contents;
    hub.broadcast({ type: "content", workflow: name, revision: nextRevision(), content });
  };
}

export async function main(argv: string[]): Promise<void> {
  // Belt-and-suspenders process-wide net: nothing below should ever throw past its own
  // try/catch, but if it does, log to STDERR (never stdout — that's the MCP JSON-RPC channel)
  // and keep the process (and the running server) alive rather than crashing silently.
  process.on("unhandledRejection", (reason) => {
    process.stderr.write(`model-editor-mcp: unhandledRejection: ${String(reason)}\n`);
  });
  process.on("uncaughtException", (error) => {
    process.stderr.write(`model-editor-mcp: uncaughtException: ${String((error as Error)?.stack ?? error)}\n`);
  });

  const { values } = parseArgs({
    args: argv,
    options: { project: { type: "string", short: "p" }, "workflow-globs": { type: "string" }, "entity-globs": { type: "string" } },
  });
  const root = await realpath(resolve(values.project ?? "."));
  const workflowGlobs = parseGlobsArg(values["workflow-globs"], DEFAULT_WORKFLOW_GLOBS);
  const entityGlobs = parseGlobsArg(values["entity-globs"], DEFAULT_ENTITY_GLOBS);

  const token = randomBytes(16).toString("hex");
  let port: number;
  try {
    port = await bindPort(root, root);
  } catch (e) {
    if (e instanceof DuplicateInstanceError) {
      process.stderr.write(`${e.message}\n`);
      process.exit(0);
    }
    throw e;
  }
  const connectionUrl = `http://127.0.0.1:${port}/?token=${token}`;

  const hub = createSseHub();
  const ctx = createToolContext({ root, workflowGlobs, entityGlobs, connectionUrl });
  const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "dist");

  const nextRevision = createRevisionCounter();
  const pendingOrigins: PendingOrigins = new Map();
  const writeLayout = createWriteLayout(ctx, pendingOrigins);
  const onChange = createOnChange(ctx, hub, pendingOrigins, nextRevision);
  const setShown = (p: ShownPayload): void =>
    hub.setShown({ type: "show", workflow: p.workflow, revision: nextRevision(), content: p.content, layout: p.layout });
  const setShownEntity = (p: ShownEntityPayload): void =>
    hub.setShown({ type: "showEntity", entity: p.entity, revision: nextRevision(), contents: p.contents });

  /**
   * Read-only browser-navigation backing for `GET /api/workflow/:name` — mirrors
   * `show_workflow`'s parse/serialize/layout-remap pipeline (`tools/show.ts`) but does NOT push a
   * "show" event or bump `nextRevision`: navigating the browser to a workflow via its own `/api/*`
   * fetch must not desync `hub.currentShown()` from what Claude last asked to show, or a later
   * watch-driven content push (`createOnChange`) would compare against the wrong "currently
   * shown" workflow.
   */
  const readWorkflowForApi = async (name: string): Promise<{ name: string; path: string; content: string; layout: Record<string, unknown> } | null> => {
    const entry = findByName(await ctx.discover(), name);
    if (!entry) return null;
    const parsed = ctx.parseImport(synthesizeImportPayload((await ctx.read(entry.relativePath)).contents));
    if (!parsed.document) return null;
    const content = ctx.serializeImport(parsed.document);
    const layout = await loadRemappedLayout(ctx, entry.relativePath, parsed.document.meta.ids.transitions);
    return { name, path: entry.relativePath, content, layout };
  };

  /** Read-only browser-navigation backing for `GET /api/entity/:name` — `name` is resolved
   *  against LIVE discovery by the caller (`http.ts`'s `handleApi`) before this ever runs, so the
   *  read here is always confined to a known, allowlisted entity path. Includes `lastModified`
   *  so this shape matches `get_entity`'s MCP tool result (`tools/entities.ts`) — the two
   *  entity-read paths (browser-navigation vs Claude's tool call) should agree on what an
   *  "entity read" returns. */
  const readEntityForApi = async (name: string): Promise<{ name: string; path: string; contents: string; lastModified: string } | null> => {
    const entry = findEntityByName(await ctx.discoverEntities(), name);
    if (!entry) return null;
    const { contents, lastModified } = await ctx.read(entry.relativePath);
    return { name, path: entry.relativePath, contents, lastModified };
  };

  const tools: Record<string, ToolHandler> = {
    list_workflows: (a) => listWorkflowsTool(a, ctx),
    show_workflow: (a) => showWorkflowTool(a, ctx, setShown),
    get_workflow: (a) => getWorkflowTool(a, ctx),
    create_workflow: (a) => createWorkflowTool(a, ctx),
    update_workflow: (a) => updateWorkflowTool(a, ctx),
    delete_workflow: (a) => deleteWorkflowTool(a, ctx),
    update_transition: (a) => updateTransitionTool(a, ctx),
    add_transition: (a) => addTransitionTool(a, ctx),
    remove_transition: (a) => removeTransitionTool(a, ctx),
    optimize_layout: (a) => optimizeLayoutTool(a, ctx),
    validate_workflow: (a) => validateWorkflowTool(a, ctx),
    validate_workflows: (a) => validateWorkflowsTool(a, ctx),
    connection_info: (a) => connectionInfoTool(a, ctx),
    list_entities: (a) => listEntitiesTool(a, ctx),
    get_entity: (a) => getEntityTool(a, ctx),
    show_entity: (a) => showEntityTool(a, ctx, setShownEntity),
    create_entity: (a) => createEntityTool(a, ctx),
    update_entity: (a) => updateEntityTool(a, ctx),
    delete_entity: (a) => deleteEntityTool(a, ctx),
    configure_project: (a) => configureProjectTool(a, ctx),
    get_project: (a) => getProjectTool(a, ctx),
  };

  const http = createHttpServer({
    root, distDir, token, hub,
    discover: ctx.discover, discoverEntities: ctx.discoverEntities,
    readWorkflow: readWorkflowForApi, readEntity: readEntityForApi,
    writeLayout,
  });
  await new Promise<void>((r) => http.listen(port, "127.0.0.1", r));
  const watcher = createWatcher({ root, getWorkflowGlobs: () => ctx.workflowGlobs, onChange: (c) => { void onChange(c); } });
  process.on("SIGINT", () => { watcher.close(); http.close(); process.exit(0); });

  startMcpServer({ tools, connectionUrl });
  process.stderr.write(`model-editor-mcp: ${connectionUrl}\n`);
}

const entryPath = process.argv[1];
if (entryPath && fileURLToPath(import.meta.url) === (await realpath(entryPath).catch(() => entryPath))) {
  void main(process.argv.slice(2));
}
