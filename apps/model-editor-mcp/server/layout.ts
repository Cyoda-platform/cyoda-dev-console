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

type SidecarIO = Pick<ToolContext, "read" | "write">;

function sidecarRelFor(contentRel: string): string {
  return contentRel.replace(/\.json$/, ".layout.json");
}

/** Best-effort read→mutate→write of one workflow's `layout.nodes` state key.
 *  Never throws: a missing/corrupt sidecar or a failed write is logged and swallowed
 *  (the content edit already succeeded; the state just loses its saved position). */
async function mutateSidecarNodes(io: SidecarIO, contentRel: string, workflowName: string, mutate: (nodes: Record<string, unknown>) => boolean): Promise<void> {
  const rel = sidecarRelFor(contentRel);
  let raw: string;
  try { raw = (await io.read(rel)).contents; } catch { return; } // no sidecar → nothing to migrate
  let parsed: Record<string, { layout?: { nodes?: Record<string, unknown> } }>;
  try { parsed = JSON.parse(raw); } catch { return; } // corrupt → leave it untouched
  const nodes = parsed[workflowName]?.layout?.nodes;
  if (!nodes) return;
  if (!mutate(nodes)) return; // nothing changed
  try { await io.write(rel, JSON.stringify(parsed, null, 2)); }
  catch (e) { process.stderr.write(`[patch] sidecar update failed for ${rel}: ${String(e)}\n`); }
}

/** Best-effort: migrates `layout.nodes[oldCode]` → `[newCode]` in the workflow's
 *  `.layout.json` sidecar. Never throws — see {@link mutateSidecarNodes}. */
export async function renameSidecarStateNode(io: SidecarIO, contentRel: string, workflowName: string, oldCode: string, newCode: string): Promise<void> {
  await mutateSidecarNodes(io, contentRel, workflowName, (nodes) => {
    if (!(oldCode in nodes)) return false;
    nodes[newCode] = nodes[oldCode];
    delete nodes[oldCode];
    return true;
  });
}

/** Best-effort: deletes `layout.nodes[code]` in the workflow's `.layout.json`
 *  sidecar. Never throws — see {@link mutateSidecarNodes}. */
export async function removeSidecarStateNode(io: SidecarIO, contentRel: string, workflowName: string, code: string): Promise<void> {
  await mutateSidecarNodes(io, contentRel, workflowName, (nodes) => {
    if (!(code in nodes)) return false;
    delete nodes[code];
    return true;
  });
}
