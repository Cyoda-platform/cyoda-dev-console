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
