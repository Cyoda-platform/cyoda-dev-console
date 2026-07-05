import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyChange, createWatcher } from "../watch.js";
import type { WorkflowChange } from "../watch.js";

describe("classifyChange", () => {
  it("maps a .layout.json change to a layout change on the sibling .json", () => {
    expect(classifyChange("/r", "/r/Pledge.layout.json", ["**/*.json"])).toEqual({ kind: "layout", workflowFile: "Pledge.json" });
  });
  it("maps a globbed .json change to a content change", () => {
    expect(classifyChange("/r", "/r/flows/Pledge.json", ["flows/**/*.json"])).toEqual({ kind: "content", workflowFile: "flows/Pledge.json" });
  });
  it("ignores non-globbed .json and non-json files", () => {
    expect(classifyChange("/r", "/r/other/Pledge.json", ["flows/**/*.json"])).toBeNull();
    expect(classifyChange("/r", "/r/notes.txt", ["**/*.json"])).toBeNull();
  });
  it("ignores a .layout.json write outside workflowGlobs (symmetric with the content branch)", () => {
    // flows/Pledge.layout.json is in scope; other/Pledge.layout.json is not.
    expect(classifyChange("/r", "/r/flows/Pledge.layout.json", ["flows/**/*.json"])).toEqual({ kind: "layout", workflowFile: "flows/Pledge.json" });
    expect(classifyChange("/r", "/r/other/Pledge.layout.json", ["flows/**/*.json"])).toBeNull();
  });
  it("ignores paths outside the root", () => {
    expect(classifyChange("/r", "/elsewhere/x.json", ["**/*.json"])).toBeNull();
  });
  it("ignores node_modules/.git/dist/target even when the glob would otherwise match", () => {
    expect(classifyChange("/r", "/r/node_modules/pkg/package.json", ["**/*.json"])).toBeNull();
    expect(classifyChange("/r", "/r/.git/index.json", ["**/*.json"])).toBeNull();
    expect(classifyChange("/r", "/r/dist/out.json", ["**/*.json"])).toBeNull();
    expect(classifyChange("/r", "/r/target/debug/fingerprint.json", ["**/*.json"])).toBeNull();
  });
});

describe("createWatcher", () => {
  let root: string, w: { close(): void };
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "mem-watch-")); });
  afterEach(async () => { w?.close(); await rm(root, { recursive: true, force: true }); });

  it("debounces and emits a content change when a workflow file is written", async () => {
    const seen: WorkflowChange[] = [];
    w = createWatcher({ root, getWorkflowGlobs: () => ["**/*.json"], onChange: (c) => seen.push(c), debounceMs: 30 });
    await new Promise((r) => setTimeout(r, 50));
    await writeFile(join(root, "Pledge.json"), "{}");
    await new Promise((r) => setTimeout(r, 300));
    expect(seen).toContainEqual({ kind: "content", workflowFile: "Pledge.json" });
  });

  it("emits a layout change for a .layout.json write, distinct from a content change", async () => {
    const seen: WorkflowChange[] = [];
    w = createWatcher({ root, getWorkflowGlobs: () => ["**/*.json"], onChange: (c) => seen.push(c), debounceMs: 30 });
    await new Promise((r) => setTimeout(r, 50));
    await writeFile(join(root, "Pledge.layout.json"), "{}");
    await new Promise((r) => setTimeout(r, 300));
    expect(seen).toContainEqual({ kind: "layout", workflowFile: "Pledge.json" });
    expect(seen).not.toContainEqual({ kind: "content", workflowFile: "Pledge.layout.json" });
  });

  it("collapses rapid repeated writes to the same file into a single callback (one save -> one push)", async () => {
    const seen: WorkflowChange[] = [];
    w = createWatcher({ root, getWorkflowGlobs: () => ["**/*.json"], onChange: (c) => seen.push(c), debounceMs: 60 });
    await new Promise((r) => setTimeout(r, 50));
    await writeFile(join(root, "Pledge.json"), "{}");
    await new Promise((r) => setTimeout(r, 10));
    await writeFile(join(root, "Pledge.json"), '{"a":1}');
    await new Promise((r) => setTimeout(r, 10));
    await writeFile(join(root, "Pledge.json"), '{"a":2}');
    await new Promise((r) => setTimeout(r, 400));
    expect(seen).toEqual([{ kind: "content", workflowFile: "Pledge.json" }]);
  });

  it("ignores a write to a file outside workflowGlobs", async () => {
    const seen: WorkflowChange[] = [];
    w = createWatcher({ root, getWorkflowGlobs: () => ["flows/**/*.json"], onChange: (c) => seen.push(c), debounceMs: 30 });
    await new Promise((r) => setTimeout(r, 50));
    await writeFile(join(root, "notes.txt"), "hi");
    await writeFile(join(root, "other.json"), "{}");
    await new Promise((r) => setTimeout(r, 300));
    expect(seen).toEqual([]);
  });

  it("stops delivering after close()", async () => {
    const seen: WorkflowChange[] = [];
    w = createWatcher({ root, getWorkflowGlobs: () => ["**/*.json"], onChange: (c) => seen.push(c), debounceMs: 30 });
    await new Promise((r) => setTimeout(r, 50));
    w.close();
    await writeFile(join(root, "Pledge.json"), "{}");
    await new Promise((r) => setTimeout(r, 300));
    expect(seen).toEqual([]);
  });
});
