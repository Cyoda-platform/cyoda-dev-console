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
 * broadcast the resulting push over `hub`. A `content` change is only pushed when it's for the
 * workflow currently shown in the browser; a `layout` change is pushed regardless (the browser
 * only applies it if it matches what's shown — see `web/src/App.tsx`), echo-suppressing
 * whichever tab's `POST /layout` triggered it via `pendingOrigins`.
 *
 * Deleted/renamed files are handled gracefully, never thrown: if `discover()` no longer lists
 * the file at all (the common case — a real delete/rename settles before this runs), the lookup
 * simply comes up empty and the push is skipped; if a rename/delete instead races the re-read
 * itself (file still listed a moment ago, gone now), the read's `ENOENT` is caught and the push
 * is skipped the same way.
 */
export function createOnChange(
  ctx: Pick<ToolContext, "discover" | "read" | "parseImport" | "serializeImport">,
  hub: Pick<SseHub, "broadcast" | "currentShown">,
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

    const shown = hub.currentShown();
    if (!shown || shown.workflow !== name) return; // browser only cares about the shown workflow

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
  const watcher = createWatcher({ root, getWorkflowGlobs: () => ctx.workflowGlobs, onChange: (c) => { void onChange(c); } });
  process.on("SIGINT", () => { watcher.close(); http.close(); process.exit(0); });

  startMcpServer({ tools, connectionUrl });
  process.stderr.write(`model-editor-mcp: ${connectionUrl}\n`);
}

const entryPath = process.argv[1];
if (entryPath && fileURLToPath(import.meta.url) === (await realpath(entryPath).catch(() => entryPath))) {
  void main(process.argv.slice(2));
}
