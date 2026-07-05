import { projectToGraph } from "@cyoda/workflow-graph";
import { layoutGraph } from "@cyoda/workflow-layout";
import type { LayoutOptions } from "@cyoda/workflow-layout";
import type { WorkflowUiMeta } from "@cyoda/workflow-core";
import { synthesizeImportPayload } from "@cyoda/workflow-editor-host/synthesizeImportPayload";
import { ok, err } from "../envelope.js";
import type { McpResult } from "../envelope.js";
import type { ToolContext } from "../context.js";
import { optimizeLayoutInput } from "../schemas.js";
import { findByName } from "../discovery.js";
import { mergeLayout } from "../layout.js";

/**
 * `optimize_layout(name, options?)` — NEW code. parse → `projectToGraph` →
 * `layoutGraph` (elkjs) → map node positions (keyed by synthetic node id) back
 * to `layout.nodes` keyed by stateCode, then `mergeLayout` into `.layout.json`.
 * Returns a lean `{ name, path, ok, nodeCount }` — the full positions blob
 * (and the sidecar's internal `_transitionIds` map) are persisted to disk
 * only, never echoed back in the response.
 */
export async function optimizeLayoutTool(args: unknown, ctx: ToolContext): Promise<McpResult> {
  const input = optimizeLayoutInput.safeParse(args);
  if (!input.success) throw err("INVALID_ARGS", input.error.message);
  const { name, options } = input.data;

  const entry = findByName(await ctx.discover(), name);
  if (!entry) throw err("NOT_FOUND", `no workflow named "${name}"`);

  const parsed = ctx.parseImport(synthesizeImportPayload((await ctx.read(entry.relativePath)).contents));
  if (!parsed.document) throw err("PARSE_ERROR", `"${entry.relativePath}" is not a parseable workflow`);

  const graph = projectToGraph(parsed.document);
  const result = await layoutGraph(graph, options as LayoutOptions | undefined);

  const idToState = new Map<string, { workflow: string; stateCode: string }>();
  for (const node of graph.nodes) if (node.kind === "state") idToState.set(node.id, { workflow: node.workflow, stateCode: node.stateCode });

  const incoming: Record<string, WorkflowUiMeta> = {};
  let nodeCount = 0;
  for (const [id, pos] of result.positions) {
    const s = idToState.get(id);
    if (!s) continue;
    const wf = (incoming[s.workflow] ??= { layout: { nodes: {} } });
    wf.layout!.nodes[s.stateCode] = { x: Math.round(pos.x), y: Math.round(pos.y) };
    nodeCount++;
  }

  const sidecarRel = entry.relativePath.replace(/\.json$/, ".layout.json");
  let existing: Record<string, unknown> = {};
  try { existing = JSON.parse((await ctx.read(sidecarRel)).contents) as Record<string, unknown>; } catch { /* missing/invalid sidecar → {} */ }
  const merged = mergeLayout(existing, incoming as Record<string, unknown>);
  await ctx.write(sidecarRel, JSON.stringify(merged, null, 2));

  // Lean response: the full positions blob (and the internal `_transitionIds`
  // synthetic-UUID map preserved by mergeLayout) stay on disk only — the
  // browser gets the new layout via the fs-watcher → SSE `layout` push.
  return ok({ name, path: sidecarRel, ok: true, nodeCount });
}
