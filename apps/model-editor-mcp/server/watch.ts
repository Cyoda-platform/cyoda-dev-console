import { watch } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { matchGlob } from "./glob.js";
import { EXCLUDED_DIRS } from "./discovery.js";

export type ChangeKind = "content" | "layout";
export interface WorkflowChange { kind: ChangeKind; workflowFile: string }

/** Map a changed absolute path to a scoped workflow change (or null to ignore). Pure —
 *  no fs access, so it's independently testable from the live watcher below. */
export function classifyChange(root: string, absPath: string, workflowGlobs: string[]): WorkflowChange | null {
  const rel = relative(root, absPath).split(sep).join("/");
  if (rel.startsWith("..") || rel === "") return null;
  if (rel.split("/").some((seg) => EXCLUDED_DIRS.has(seg))) return null;
  if (rel.endsWith(".layout.json")) return { kind: "layout", workflowFile: rel.replace(/\.layout\.json$/, ".json") };
  if (rel.endsWith(".json")) {
    if (workflowGlobs.length > 0 && !workflowGlobs.some((g) => matchGlob(rel, g))) return null;
    return { kind: "content", workflowFile: rel };
  }
  return null;
}

export interface Watcher { close(): void }

/**
 * `node:fs` recursive watch over `root`, scoped/classified via {@link classifyChange} and
 * debounced per (kind, workflowFile) so the several raw fs events one save typically fires
 * collapse into a single `onChange` callback.
 */
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
  return { close: () => { for (const t of timers.values()) clearTimeout(t); timers.clear(); handle.close(); } };
}
