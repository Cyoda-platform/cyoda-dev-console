import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverWorkflows, findByName } from "../discovery.js";

const PLEDGE = JSON.stringify({
  importMode: "MERGE",
  workflows: [{ version: "1", name: "Pledge", initialState: "none", active: true,
    states: { none: { transitions: [{ name: "create", next: "created", manual: false, disabled: false }] }, created: { transitions: [] } } }],
});

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "mem-disc-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("discoverWorkflows", () => {
  it("classifies and returns only workflow-status JSON, excluding sidecars and node_modules", async () => {
    await writeFile(join(root, "Pledge.json"), PLEDGE);
    await writeFile(join(root, "Pledge.layout.json"), "{}");
    await mkdir(join(root, "node_modules/x"), { recursive: true });
    await writeFile(join(root, "node_modules/x/w.json"), PLEDGE);
    const entries = await discoverWorkflows(root, ["**/*.json"]);
    expect(entries.map((e) => e.relativePath)).toEqual(["Pledge.json"]);
    expect(entries[0]!.status).toBe("valid-workflow");
    expect(entries[0]!.workflows[0]!.name).toBe("Pledge");
  });
  it("honours workflowGlobs scoping", async () => {
    await mkdir(join(root, "flows"), { recursive: true });
    await writeFile(join(root, "flows/Pledge.json"), PLEDGE);
    await writeFile(join(root, "other.json"), PLEDGE);
    const entries = await discoverWorkflows(root, ["flows/**/*.json"]);
    expect(entries.map((e) => e.relativePath)).toEqual(["flows/Pledge.json"]);
  });
});

describe("findByName", () => {
  it("matches by declared workflow name, then falls back to file basename", async () => {
    await writeFile(join(root, "Pledge.json"), PLEDGE);
    const entries = await discoverWorkflows(root, ["**/*.json"]);
    expect(findByName(entries, "Pledge")?.relativePath).toBe("Pledge.json");
    expect(findByName(entries, "nope")).toBeUndefined();
  });
});
