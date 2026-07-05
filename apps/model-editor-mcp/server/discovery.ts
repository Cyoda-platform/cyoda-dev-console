import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { classifyWorkflowFile, WORKFLOW_STATUSES } from "@cyoda/workflow-file-indexer";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
import { matchGlob } from "./glob.js";
import { readConfined } from "./files.js";

/** Directory names never scanned/watched — shared with `watch.ts` so a live edit inside
 *  one of these can never trigger a push for a file `discoverWorkflows` would never surface. */
export const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "target", ".model-editor"]);

/** `readdir(dir, { withFileTypes: true })`, degraded to `undefined` on failure instead of
 *  throwing. A single unreadable (EACCES) or mid-scan-removed (ENOENT) directory anywhere under
 *  root must not fail the ENTIRE discovery — every tool handler, the `/layout` allowlist, and
 *  the watcher's `onChange` funnel through `discoverWorkflows`, so one transient fs error must
 *  never break the whole server surface. */
async function readdirOrSkip(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (err) {
    process.stderr.write(`[discovery] skipping ${dir}: ${String(err)}\n`);
    return undefined;
  }
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdirOrSkip(dir);
  if (entries === undefined) return;
  for (const e of entries) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      if (!EXCLUDED_DIRS.has(e.name)) yield* walk(abs);
    } else if (e.isFile()) {
      yield abs;
    }
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

/**
 * Resolve a workflow by declared name first, then by file basename (`Foo.json` → `Foo`).
 * Generic over the minimal `{ relativePath, workflows }` shape it actually reads so both the
 * tools (which pass full `WorkflowFileIndexEntry[]`) and `http.ts`'s `POST /layout` allowlist
 * (which passes the narrower `discover` result) share ONE name-resolution rule — no drift.
 */
export function findByName<T extends { relativePath: string; workflows: { name: string }[] }>(
  entries: T[],
  name: string,
): T | undefined {
  return (
    entries.find((e) => e.workflows.some((w) => w.name === name)) ??
    entries.find((e) => e.relativePath.replace(/\.json$/, "").split("/").pop() === name)
  );
}

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

/**
 * Derive a NEW workflow's destination path from `name` alone — mirrors
 * {@link resolveEntityCreatePath} exactly (same derivation rule: the literal
 * directory prefix of the FIRST configured glob pattern, before its first
 * wildcard segment), but reads `workflowGlobs` instead of `entityGlobs`. Used
 * by `create_workflow`, which — like `create_entity` — is a name-based tool
 * with no explicit destination-path argument.
 */
export function resolveWorkflowCreatePath(workflowGlobs: string[], name: string): string {
  const pattern = workflowGlobs[0];
  if (pattern === undefined) throw new Error("no workflowGlobs configured — call configure_project first");
  const segments = pattern.split("/");
  const wildcardIdx = segments.findIndex((seg) => seg.includes("*"));
  const dirSegments = wildcardIdx === -1 ? segments.slice(0, -1) : segments.slice(0, wildcardIdx);
  return dirSegments.length > 0 ? `${dirSegments.join("/")}/${name}.json` : `${name}.json`;
}
