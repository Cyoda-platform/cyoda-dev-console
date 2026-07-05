import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { subscribe } from "../sseClient.js";
import type { SseEvent } from "../sseClient.js";

/** Minimal fake `EventSource` — records the constructed URL, lets tests drive
 *  `onmessage` directly, and tracks whether `close()` was called. Real browsers
 *  auto-retry on drop; that reconnect behavior belongs to the browser's own
 *  EventSource implementation, not to `subscribe()`, so it is out of scope here. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((ev: { data: string }) => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("subscribe", () => {
  it("opens /events with the origin URL-encoded as a query param", () => {
    subscribe("tab-1 needs/encoding", () => {});
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]!.url).toBe(
      `/events?origin=${encodeURIComponent("tab-1 needs/encoding")}`,
    );
  });

  it("parses each message and forwards the typed SseEvent to the callback", () => {
    const received: SseEvent[] = [];
    subscribe("origin-a", (e) => received.push(e));
    const es = FakeEventSource.instances[0]!;

    const show: SseEvent = { type: "show", workflow: "Pledge", revision: 1, content: "{}", layout: {} };
    es.onmessage?.({ data: JSON.stringify(show) });

    expect(received).toEqual([show]);
  });

  it("ignores malformed JSON (keep-alive comments) instead of throwing", () => {
    const received: SseEvent[] = [];
    subscribe("origin-a", (e) => received.push(e));
    const es = FakeEventSource.instances[0]!;

    expect(() => es.onmessage?.({ data: "not json" })).not.toThrow();
    expect(received).toEqual([]);
  });

  it("returns a cleanup function that closes the underlying EventSource", () => {
    const unsubscribe = subscribe("origin-a", () => {});
    const es = FakeEventSource.instances[0]!;
    expect(es.closed).toBe(false);
    unsubscribe();
    expect(es.closed).toBe(true);
  });
});
