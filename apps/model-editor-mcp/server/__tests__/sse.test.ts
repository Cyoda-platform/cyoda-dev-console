import { describe, it, expect } from "vitest";
import { createSseHub } from "../sse.js";
import type { SseClient, SseEvent } from "../sse.js";

function client(): SseClient & { events: SseEvent[] } {
  const events: SseEvent[] = [];
  return { events, write: (e) => { events.push(e); } };
}

describe("SseHub", () => {
  it("replays the current shown workflow to a newly connected client", () => {
    const hub = createSseHub();
    const show: Extract<SseEvent, { type: "show" }> = { type: "show", workflow: "Pledge", revision: 1, content: "{}", layout: {} };
    hub.setShown(show);
    const c = client();
    hub.addClient(c, "A");
    expect(c.events).toEqual([show]);
  });
  it("echo-suppresses a layout push to the originating tab but delivers to others", () => {
    const hub = createSseHub();
    const a = client(), b = client();
    hub.addClient(a, "A"); hub.addClient(b, "B");
    const layout: SseEvent = { type: "layout", workflow: "Pledge", revision: 2, layout: {}, origin: "A" };
    hub.broadcast(layout, "A");
    expect(a.events).toEqual([]);
    expect(b.events).toEqual([layout]);
  });
  it("stops delivering after removeClient", () => {
    const hub = createSseHub();
    const a = client();
    hub.addClient(a, "A"); hub.removeClient(a);
    hub.broadcast({ type: "content", workflow: "P", revision: 3, content: "{}" });
    expect(a.events).toEqual([]);
  });
});
