import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseImportPayload, serializeImportPayload, validateAll } from "@cyoda/workflow-core";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
import type { ToolContext } from "../context.js";
import type { SseHub } from "../sse.js";
import { createRevisionCounter, createWriteLayout, createOnChange } from "../index.js";
import type { PendingOrigins } from "../index.js";

const PLEDGE = JSON.stringify({
  importMode: "MERGE",
  workflows: [{ version: "1", name: "Pledge", initialState: "none", active: true,
    states: { none: { transitions: [{ name: "create", next: "created", manual: false, disabled: false }] }, created: { transitions: [] } } }],
});

function entry(over: Partial<WorkflowFileIndexEntry> = {}): WorkflowFileIndexEntry {
  return { path: "/r/Pledge.json", relativePath: "Pledge.json", status: "valid-workflow", workflows: [{ name: "Pledge" }], lastModified: "t", sizeBytes: 1, ...over };
}

/** A ToolContext backed by an in-memory file map + the REAL workflow-core parse/serialize. */
function ctx(files: Record<string, string>, over: Partial<ToolContext> = {}): ToolContext {
  const writes: Record<string, string> = {};
  return {
    root: "/r",
    workflowGlobs: ["**/*.json"],
    entityGlobs: [],
    connectionUrl: "http://127.0.0.1:50000",
    read: vi.fn(async (rel: string) => {
      const c = writes[rel] ?? files[rel];
      if (c === undefined) throw Object.assign(new Error(`not found: ${rel}`), { code: "ENOENT" });
      return { contents: c, lastModified: "t", sizeBytes: c.length };
    }),
    write: vi.fn(async (rel: string, contents: string) => { writes[rel] = contents; return { path: `/r/${rel}`, lastModified: "t", sizeBytes: contents.length }; }),
    deleteFile: vi.fn(async () => {}),
    discover: vi.fn(async () => [entry()]),
    discoverEntities: vi.fn(async () => []),
    setGlobs: vi.fn(),
    parseImport: parseImportPayload,
    serializeImport: serializeImportPayload,
    validate: validateAll,
    ...over,
  };
}

describe("createRevisionCounter", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("returns strictly increasing values even when Date.now() repeats", () => {
    vi.setSystemTime(1_000_000);
    const nextRevision = createRevisionCounter();
    const a = nextRevision();
    const b = nextRevision();
    const c = nextRevision();
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it("tracks Date.now() forward once real time overtakes the counter", () => {
    vi.setSystemTime(1_000_000);
    const nextRevision = createRevisionCounter();
    const a = nextRevision(); // 1_000_000
    vi.setSystemTime(2_000_000);
    const b = nextRevision(); // jumps to 2_000_000, not a+1
    expect(b).toBe(2_000_000);
    expect(b).toBeGreaterThan(a);
  });
});

describe("createWriteLayout", () => {
  it("merges the incoming layout into the existing sidecar and writes it back", async () => {
    const c = ctx({ "Pledge.json": PLEDGE, "Pledge.layout.json": JSON.stringify({ Pledge: { collapsedStates: ["A"] } }) });
    const pendingOrigins: PendingOrigins = new Map();
    const writeLayout = createWriteLayout(c, pendingOrigins);
    await writeLayout("Pledge", { Pledge: { layout: { nodes: { none: { x: 1, y: 2 } } } } }, "tabA");
    expect(c.write).toHaveBeenCalledWith("Pledge.layout.json", expect.stringContaining('"none"'));
    const written = JSON.parse((c.write as unknown as { mock: { calls: [string, string][] } }).mock.calls[0]![1]);
    expect(written.Pledge.collapsedStates).toEqual(["A"]); // preserved from existing
    expect(written.Pledge.layout.nodes).toEqual({ none: { x: 1, y: 2 } }); // overwritten from incoming
  });

  it("records the origin in pendingOrigins, keyed by the workflow's relative content path", async () => {
    const c = ctx({ "Pledge.json": PLEDGE });
    const pendingOrigins: PendingOrigins = new Map();
    const writeLayout = createWriteLayout(c, pendingOrigins);
    await writeLayout("Pledge", { Pledge: { layout: { nodes: {} } } }, "tabA");
    expect(pendingOrigins.get("Pledge.json")).toBe("tabA");
  });

  it("does not record a pending origin for an empty/falsy origin", async () => {
    const c = ctx({ "Pledge.json": PLEDGE });
    const pendingOrigins: PendingOrigins = new Map();
    const writeLayout = createWriteLayout(c, pendingOrigins);
    await writeLayout("Pledge", { Pledge: { layout: { nodes: {} } } }, "");
    expect(pendingOrigins.has("Pledge.json")).toBe(false);
  });

  it("no-ops (no write, no throw) for an unknown workflow name", async () => {
    const c = ctx({ "Pledge.json": PLEDGE });
    const pendingOrigins: PendingOrigins = new Map();
    const writeLayout = createWriteLayout(c, pendingOrigins);
    await expect(writeLayout("Ghost", { Ghost: { layout: { nodes: {} } } }, "tabA")).resolves.toBeUndefined();
    expect(c.write).not.toHaveBeenCalled();
  });

  it("does NOT retain a pending origin when the write itself fails (no stale echo-suppression)", async () => {
    // If the origin were recorded BEFORE the write, a failed write would leave it lingering with
    // no fs event to consume it — and a LATER external change to the same file would wrongly
    // echo-suppress that tab. So: origin is recorded only after a successful write.
    const c = ctx({ "Pledge.json": PLEDGE }, { write: vi.fn(async () => { throw new Error("disk full"); }) });
    const pendingOrigins: PendingOrigins = new Map();
    const writeLayout = createWriteLayout(c, pendingOrigins);
    await expect(writeLayout("Pledge", { Pledge: { layout: { nodes: {} } } }, "tabA")).rejects.toThrow("disk full");
    expect(pendingOrigins.has("Pledge.json")).toBe(false);
  });

  it("treats a missing/corrupt existing sidecar as {} rather than throwing", async () => {
    const c = ctx({ "Pledge.json": PLEDGE }); // no Pledge.layout.json at all
    const pendingOrigins: PendingOrigins = new Map();
    const writeLayout = createWriteLayout(c, pendingOrigins);
    await writeLayout("Pledge", { Pledge: { layout: { nodes: { none: { x: 0, y: 0 } } } } }, "tabA");
    const written = JSON.parse((c.write as unknown as { mock: { calls: [string, string][] } }).mock.calls[0]![1]);
    expect(written.Pledge.layout.nodes).toEqual({ none: { x: 0, y: 0 } });
  });
});

function fakeHub(shown: { workflow: string } | null): SseHub & { broadcast: ReturnType<typeof vi.fn> } {
  return {
    addClient: vi.fn(),
    removeClient: vi.fn(),
    broadcast: vi.fn(),
    setShown: vi.fn(),
    currentShown: vi.fn(() => shown as never),
  } as unknown as SseHub & { broadcast: ReturnType<typeof vi.fn> };
}

describe("createOnChange", () => {
  it("broadcasts a content event (with a minted revision) when the changed file is the currently shown workflow", async () => {
    const c = ctx({ "Pledge.json": PLEDGE });
    const hub = fakeHub({ workflow: "Pledge" });
    const nextRevision = vi.fn(() => 42);
    const onChange = createOnChange(c, hub, new Map(), nextRevision);
    await onChange({ kind: "content", workflowFile: "Pledge.json" });
    expect(hub.broadcast).toHaveBeenCalledTimes(1);
    const [event] = hub.broadcast.mock.calls[0]!;
    expect(event).toMatchObject({ type: "content", workflow: "Pledge", revision: 42 });
    expect(event.content).toContain("Pledge");
  });

  // A workflow the human navigated to via the browser's own sidebar picker (GET
  // /api/workflow/:name) never calls `show_workflow`, so `hub.currentShown()` stays whatever
  // Claude last showed (or null) — NOT this workflow. Content pushes must not be gated on that
  // Claude-owned show-state: the browser's own current-view check (`web/src/App.tsx`'s `content`
  // handler) is what decides whether to apply a push, so the server must broadcast regardless.
  it("broadcasts a content change for the changed workflow even when it is NOT the currently shown one (picker-navigated)", async () => {
    const c = ctx({ "Pledge.json": PLEDGE });
    const hub = fakeHub({ workflow: "SomethingElse" });
    const nextRevision = vi.fn(() => 3);
    const onChange = createOnChange(c, hub, new Map(), nextRevision);
    await onChange({ kind: "content", workflowFile: "Pledge.json" });
    expect(hub.broadcast).toHaveBeenCalledTimes(1);
    const [event] = hub.broadcast.mock.calls[0]!;
    expect(event).toMatchObject({ type: "content", workflow: "Pledge", revision: 3 });
    expect(event.content).toContain("Pledge");
  });

  // The picker scenario in full: Claude has never `show_workflow`'d anything this session at
  // all (`currentShown()` is null), yet the human is browsing the workflow via the sidebar and
  // needs live content updates when Claude edits it underneath them.
  it("broadcasts a content change even when nothing has ever been show_workflow'd (browser picker navigation, no Claude push yet)", async () => {
    const c = ctx({ "Pledge.json": PLEDGE });
    const hub = fakeHub(null);
    const onChange = createOnChange(c, hub, new Map(), () => 1);
    await expect(onChange({ kind: "content", workflowFile: "Pledge.json" })).resolves.toBeUndefined();
    expect(hub.broadcast).toHaveBeenCalledTimes(1);
    const [event] = hub.broadcast.mock.calls[0]!;
    expect(event).toMatchObject({ type: "content", workflow: "Pledge" });
  });

  it("skips the push (no throw) for a content change on a file no longer in discover() (deleted/renamed)", async () => {
    const c = ctx({}, { discover: vi.fn(async () => []) }); // the file vanished
    const hub = fakeHub({ workflow: "Pledge" });
    const onChange = createOnChange(c, hub, new Map(), () => 1);
    await expect(onChange({ kind: "content", workflowFile: "Pledge.json" })).resolves.toBeUndefined();
    expect(hub.broadcast).not.toHaveBeenCalled();
  });

  it("skips the push (no throw) when discover() still lists the file but the re-read races an ENOENT", async () => {
    const c = ctx({ "Pledge.json": PLEDGE }, { read: vi.fn(async () => { throw Object.assign(new Error("gone"), { code: "ENOENT" }); }) });
    const hub = fakeHub({ workflow: "Pledge" });
    const onChange = createOnChange(c, hub, new Map(), () => 1);
    await expect(onChange({ kind: "content", workflowFile: "Pledge.json" })).resolves.toBeUndefined();
    expect(hub.broadcast).not.toHaveBeenCalled();
  });

  it("broadcasts a layout event, echo-excluding pendingOrigins' recorded origin, then clears it", async () => {
    const c = ctx({ "Pledge.json": PLEDGE, "Pledge.layout.json": JSON.stringify({ Pledge: { layout: { nodes: { none: { x: 1, y: 1 } } } } }) });
    const hub = fakeHub({ workflow: "SomethingElse" }); // layout pushes don't gate on "currently shown"
    const pendingOrigins: PendingOrigins = new Map([["Pledge.json", "tabA"]]);
    const nextRevision = vi.fn(() => 7);
    const onChange = createOnChange(c, hub, pendingOrigins, nextRevision);
    await onChange({ kind: "layout", workflowFile: "Pledge.json" });
    expect(hub.broadcast).toHaveBeenCalledTimes(1);
    const [event, exceptOrigin] = hub.broadcast.mock.calls[0]!;
    expect(event).toMatchObject({ type: "layout", workflow: "Pledge", revision: 7, origin: "tabA" });
    expect(event.layout.Pledge.layout.nodes).toEqual({ none: { x: 1, y: 1 } });
    expect(exceptOrigin).toBe("tabA");
    expect(pendingOrigins.has("Pledge.json")).toBe(false); // cleared after use
  });

  it("still broadcasts a layout event (with no origin) when the content file can't be re-read for id remapping", async () => {
    const c = ctx(
      { "Pledge.layout.json": JSON.stringify({ Pledge: { layout: { nodes: { none: { x: 1, y: 1 } } } } }) },
      { read: vi.fn(async (rel: string) => {
        if (rel === "Pledge.json") throw Object.assign(new Error("gone"), { code: "ENOENT" });
        return { contents: JSON.stringify({ Pledge: { layout: { nodes: { none: { x: 1, y: 1 } } } } }), lastModified: "t", sizeBytes: 1 };
      }) },
    );
    const hub = fakeHub(null);
    const onChange = createOnChange(c, hub, new Map(), () => 9);
    await expect(onChange({ kind: "layout", workflowFile: "Pledge.json" })).resolves.toBeUndefined();
    expect(hub.broadcast).toHaveBeenCalledTimes(1);
    const [event] = hub.broadcast.mock.calls[0]!;
    expect(event).toMatchObject({ type: "layout", workflow: "Pledge", revision: 9 });
    expect(event.origin).toBeUndefined();
  });

  it("skips a layout push (no throw) when the file is no longer in discover() at all", async () => {
    const c = ctx({}, { discover: vi.fn(async () => []) });
    const hub = fakeHub(null);
    const onChange = createOnChange(c, hub, new Map(), () => 1);
    await expect(onChange({ kind: "layout", workflowFile: "Pledge.json" })).resolves.toBeUndefined();
    expect(hub.broadcast).not.toHaveBeenCalled();
  });
});
