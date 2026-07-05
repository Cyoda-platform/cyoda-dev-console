import type { WorkflowUiMeta, TransitionPointer } from "@cyoda/workflow-core";
import type { ToolContext } from "./context.js";

type LayoutNodes = Record<string, unknown>;
interface WorkflowUiMetaLike { layout?: { nodes?: LayoutNodes }; [key: string]: unknown }
type Sidecar = Record<string, unknown>;
const TRANSITION_IDS_KEY = "_transitionIds";

/**
 * Deep-merge an incoming layout update into the existing sidecar. For every
 * workflow key present in `incoming`, replaces *only*
 * `existing[wf].layout.nodes` with `incoming[wf].layout.nodes` (creating
 * `existing[wf]`/`.layout` if either is absent) — every other field on that
 * workflow's `WorkflowUiMeta` (`transitionPositions`, `edgeAnchors`,
 * `collapsedStates`, `viewports`, `comments`, `viewPreset`, `selectedId`) is
 * carried over untouched. `_transitionIds` is always preserved from
 * `existing` and is never treated as a workflow key, even if a caller
 * smuggles it into `incoming`.
 *
 * Salvaged verbatim from the parked `docs/mcp-service-design` branch's
 * `apps/dev-console/src/mcp/tools/layout.ts`.
 */
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

/**
 * Re-keys transitionPositions and edgeAnchors from old synthetic UUIDs (saved
 * in the layout file) to current UUIDs (assigned on this load), using
 * ordinal-position matching within (workflow, state) — the same rule
 * `assignSyntheticIds` uses when reusing prior UUIDs. Ported from
 * `apps/dev-console/src/routes/workflow.tsx:26-72`.
 */
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
