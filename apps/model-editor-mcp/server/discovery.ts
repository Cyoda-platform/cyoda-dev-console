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

export interface EntityFileEntry { relativePath: string; name: string; lastModified: string; sizeBytes: number }

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
    let contents: string, lastModified: string, sizeBytes: number;
    try {
      ({ contents, lastModified, sizeBytes } = await readConfined(root, rel));
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
    out.push({ relativePath: rel, name: fileStem(rel), lastModified, sizeBytes });
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

function directoryOf(relativePath: string): string {
  return relativePath.split("/").slice(0, -1).join("/");
}

/**
 * The directory a NEW file should join when files already exist: the MAJORITY
 * parent directory among `existing`'s `relativePath`s (most frequently
 * occurring), with the sorted-first entry's directory (`existing[0]`, per the
 * discovery functions' sort-ascending-by-relativePath contract) as the
 * deterministic tiebreak. Iterating `existing` in its given order and keeping
 * the first directory to reach the max count implements that tiebreak
 * directly: `existing[0]`'s directory always wins ties it's part of, since it
 * is necessarily the first candidate `find` considers.
 */
function majorityDirectory(existing: readonly { relativePath: string }[]): string {
  const dirs = existing.map((e) => directoryOf(e.relativePath));
  const counts = new Map<string, number>();
  for (const d of dirs) counts.set(d, (counts.get(d) ?? 0) + 1);
  const maxCount = Math.max(...counts.values());
  return dirs.find((d) => counts.get(d) === maxCount)!;
}

/**
 * Derive a NEW file's destination path from `name` alone. Shared by
 * {@link resolveEntityCreatePath} and {@link resolveWorkflowCreatePath} — both
 * name-based create tools (`create_entity`/`create_workflow`) have no explicit
 * destination-path argument, so this is the concrete rule that makes them
 * buildable.
 *
 * When files already exist (`existing` non-empty), target the MAJORITY
 * directory those files actually live in (see {@link majorityDirectory}) —
 * this is what fixes the `**`-glob wart: a glob like `models/workflow/**\/*.json`
 * matches a versioned/nested layout (`models/workflow/v1/`) just fine, but its
 * literal-prefix-before-`**` rule alone would land a new file one directory
 * ABOVE where the rest actually live. Only when discovery is empty (nothing to
 * sit "next to") does this fall back to that literal-prefix rule: the path
 * segments of the FIRST configured glob pattern before its first wildcard (`*`)
 * segment.
 */
function resolveCreatePath(
  globs: string[],
  name: string,
  existing: readonly { relativePath: string }[],
  globsParamName: string,
): string {
  if (existing.length > 0) {
    const dir = majorityDirectory(existing);
    return dir ? `${dir}/${name}.json` : `${name}.json`;
  }
  const pattern = globs[0];
  if (pattern === undefined) throw new Error(`no ${globsParamName} configured — call configure_project first`);
  const segments = pattern.split("/");
  const wildcardIdx = segments.findIndex((seg) => seg.includes("*"));
  const dirSegments = wildcardIdx === -1 ? segments.slice(0, -1) : segments.slice(0, wildcardIdx);
  return dirSegments.length > 0 ? `${dirSegments.join("/")}/${name}.json` : `${name}.json`;
}

/** Derive a NEW entity's destination path — see {@link resolveCreatePath}. */
export function resolveEntityCreatePath(
  entityGlobs: string[],
  name: string,
  existing: readonly { relativePath: string }[],
): string {
  return resolveCreatePath(entityGlobs, name, existing, "entityGlobs");
}

/**
 * Derive a NEW workflow's destination path — mirrors {@link resolveEntityCreatePath}
 * exactly (both delegate to the shared {@link resolveCreatePath}), but reads
 * `workflowGlobs` instead of `entityGlobs`. Used by `create_workflow`, which —
 * like `create_entity` — is a name-based tool with no explicit
 * destination-path argument.
 */
export function resolveWorkflowCreatePath(
  workflowGlobs: string[],
  name: string,
  existing: readonly { relativePath: string }[],
): string {
  return resolveCreatePath(workflowGlobs, name, existing, "workflowGlobs");
}
