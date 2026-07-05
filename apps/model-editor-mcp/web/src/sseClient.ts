import type { WorkflowUiMeta } from "@cyoda/workflow-core";

export type SseEvent =
  | { type: "show"; workflow: string; revision: number; content: string; layout: Record<string, WorkflowUiMeta> }
  | { type: "content"; workflow: string; revision: number; content: string }
  | { type: "layout"; workflow: string; revision: number; layout: Record<string, WorkflowUiMeta>; origin?: string };

/** Subscribe to `/events` for this tab's origin; the browser auto-retries + the
 *  server replays the shown workflow on (re)connect. */
export function subscribe(origin: string, onEvent: (e: SseEvent) => void): () => void {
  const es = new EventSource(`/events?origin=${encodeURIComponent(origin)}`);
  es.onmessage = (ev) => { try { onEvent(JSON.parse(ev.data) as SseEvent); } catch { /* ignore keep-alive */ } };
  return () => es.close();
}
