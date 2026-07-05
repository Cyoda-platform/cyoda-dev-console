import type { WorkflowUiMeta } from "@cyoda/workflow-core";

export type SseEvent =
  | { type: "show"; workflow: string; revision: number; content: string; layout: Record<string, WorkflowUiMeta> }
  | { type: "content"; workflow: string; revision: number; content: string }
  | { type: "layout"; workflow: string; revision: number; layout: Record<string, WorkflowUiMeta>; origin?: string }
  | { type: "showEntity"; entity: string; revision: number; contents: string };

/** The single "currently shown" replay slot — either Claude's last `show_workflow` OR
 *  `show_entity`. The two are discriminated purely by event `type`; `addClient`/`broadcast`/
 *  `deliver` are event-agnostic, so replaying either is the same code path. */
export type ShownState = Extract<SseEvent, { type: "show" }> | Extract<SseEvent, { type: "showEntity" }>;

export interface SseClient { write(event: SseEvent): void }

export interface SseHub {
  addClient(client: SseClient, origin: string): void;
  removeClient(client: SseClient): void;
  broadcast(event: SseEvent, exceptOrigin?: string): void;
  setShown(event: ShownState): void;
  currentShown(): ShownState | null;
}

export function createSseHub(): SseHub {
  const clients = new Map<SseClient, string>();
  let shown: ShownState | null = null;
  /** Deliver to one client; a dead socket (throwing `write`) evicts itself and never propagates. */
  const deliver = (client: SseClient, event: SseEvent): void => {
    try { client.write(event); } catch { clients.delete(client); }
  };
  return {
    addClient(client, origin) { clients.set(client, origin); if (shown) deliver(client, shown); },
    removeClient(client) { clients.delete(client); },
    broadcast(event, exceptOrigin) {
      for (const [client, origin] of clients) { if (exceptOrigin !== undefined && origin === exceptOrigin) continue; deliver(client, event); }
    },
    setShown(event) { shown = event; for (const [client] of clients) deliver(client, event); },
    currentShown() { return shown; },
  };
}
