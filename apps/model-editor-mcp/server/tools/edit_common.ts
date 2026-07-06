import { synthesizeImportPayload } from "@cyoda/workflow-editor-host/synthesizeImportPayload";
import type { WorkflowEditorDocument, Workflow, Criterion, ValidationIssue } from "@cyoda/workflow-core";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
import { err, validationFailed } from "../envelope.js";
import type { ToolContext } from "../context.js";
import { findByName } from "../discovery.js";
import { jsonDiff } from "../diff.js";

export interface LoadedWorkflow {
  entry: WorkflowFileIndexEntry;
  document: WorkflowEditorDocument;
  workflow: Workflow;   // a live reference into document.session.workflows — mutate it in place
  before: string;
}

/** Steps 1–2 of the shared pipeline (§5). Throws the error envelope on failure. */
export async function loadWorkflowForEdit(ctx: ToolContext, name: string): Promise<LoadedWorkflow> {
  const entry = findByName(await ctx.discover(), name);
  if (!entry) throw err("NOT_FOUND", `no workflow named "${name}"`);
  const before = (await ctx.read(entry.relativePath)).contents;
  const parsed = ctx.parseImport(synthesizeImportPayload(before));
  if (!parsed.document) throw err("PARSE_ERROR", `workflow "${name}" is not parseable; fix it with update_workflow`);
  const wfs = parsed.document.session.workflows;
  const workflow = wfs.find((w) => w.name === name) ?? (wfs.length === 1 ? wfs[0] : undefined);
  if (!workflow) throw err("NOT_FOUND", `no workflow named "${name}" in "${entry.relativePath}"`);
  return { entry, document: parsed.document, workflow, before };
}

/**
 * Steps 4–5 (§5). Validate the mutated document by re-expressing it as an
 * import-payload string and RE-PARSING it — NOT by serializing first
 * (serialize silently drops a malformed criterion → C2). On any error-severity
 * issue, throw VALIDATION_FAILED (writes nothing). On success, serialize the
 * clean reparsed document and write it, returning a before→after diff.
 */
export async function commitEditedWorkflow(ctx: ToolContext, loaded: LoadedWorkflow): Promise<{ path: string; diff: unknown; diagnostics: ValidationIssue[] }> {
  const { entry, document, before } = loaded;
  const payload = JSON.stringify({ importMode: document.session.importMode ?? "MERGE", workflows: document.session.workflows });
  const parsed = ctx.parseImport(payload);
  if (!parsed.document || parsed.issues.some((i) => i.severity === "error")) {
    throw validationFailed(parsed.issues);
  }
  const canonical = ctx.serializeImport(parsed.document);
  await ctx.write(entry.relativePath, canonical);
  let beforeParsed: unknown = {};
  try { beforeParsed = JSON.parse(before); } catch { /* diff against {} */ }
  const diff = jsonDiff(beforeParsed, JSON.parse(canonical));
  return { path: entry.relativePath, diff, diagnostics: parsed.issues };
}

/** Depth-first visit over a criterion tree, traversing BOTH compound forms. */
export function walkCriteria(criterion: Criterion | undefined, visit: (c: Criterion) => void): void {
  if (!criterion) return;
  visit(criterion);
  if (criterion.type === "group") {
    for (const child of criterion.conditions) walkCriteria(child, visit);
  } else if (criterion.type === "function") {
    walkCriteria(criterion.function.criterion, visit);
  }
}

function eachWorkflowCriterion(workflow: Workflow, visit: (c: Criterion) => void): void {
  walkCriteria(workflow.criterion, visit);
  for (const state of Object.values(workflow.states)) {
    for (const t of state.transitions) walkCriteria(t.criterion, visit);
  }
}

/** Atomic state rename: key (order-preserving), initialState, every next, and
 *  every lifecycle state-criterion value (scalar or array). Closes C1. */
export function cascadeStateRename(workflow: Workflow, oldCode: string, newCode: string): void {
  const rebuilt: Record<string, Workflow["states"][string]> = {};
  for (const [code, state] of Object.entries(workflow.states)) rebuilt[code === oldCode ? newCode : code] = state;
  workflow.states = rebuilt;
  if (workflow.initialState === oldCode) workflow.initialState = newCode;
  for (const state of Object.values(workflow.states)) {
    for (const t of state.transitions) if (t.next === oldCode) t.next = newCode;
  }
  eachWorkflowCriterion(workflow, (c) => {
    if (c.type === "lifecycle" && c.field === "state") {
      if (Array.isArray(c.value)) c.value = c.value.map((v) => (v === oldCode ? newCode : v));
      else if (c.value === oldCode) c.value = newCode;
    }
  });
}

/** True if any lifecycle `state` criterion references `code` (scalar or array). Closes C1 for remove_state. */
export function hasLifecycleStateRef(workflow: Workflow, code: string): boolean {
  let found = false;
  eachWorkflowCriterion(workflow, (c) => {
    if (c.type === "lifecycle" && c.field === "state") {
      if (Array.isArray(c.value) ? c.value.includes(code) : c.value === code) found = true;
    }
  });
  return found;
}

/** True if any lifecycle `previousTransition` criterion references `transitionName`. Drives the rename warning. */
export function hasPreviousTransitionRef(workflow: Workflow, transitionName: string): boolean {
  let found = false;
  eachWorkflowCriterion(workflow, (c) => {
    if (c.type === "lifecycle" && c.field === "previousTransition") {
      if (Array.isArray(c.value) ? c.value.includes(transitionName) : c.value === transitionName) found = true;
    }
  });
  return found;
}
