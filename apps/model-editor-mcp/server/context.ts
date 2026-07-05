import { parseImportPayload, serializeImportPayload, validateAll } from "@cyoda/workflow-core";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
import { readConfined, writeConfined } from "./files.js";
import { discoverWorkflows } from "./discovery.js";

/**
 * Dependency-injected context shared by every tool handler: filesystem
 * access confined to `root`, workflow discovery, and the real
 * `workflow-core` parse/serialize/validate functions. Tests construct a
 * `ToolContext` literal with fakes for `read`/`write`/`discover` instead of
 * calling {@link createToolContext}, so handlers stay pure and fast to test.
 */
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

/** Build the production `ToolContext`: real confined fs I/O + real workflow-core. */
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
