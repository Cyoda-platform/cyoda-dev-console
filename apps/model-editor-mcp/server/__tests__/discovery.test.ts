import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverWorkflows, findByName } from "../discovery.js";

/** Partial mock of `node:fs/promises`: every export passes through to the real
 *  implementation EXCEPT `readdir`, which is intercepted so a specific directory
 *  (named `bad-dir`) deterministically fails the way an EACCES/ENOENT mid-scan
 *  directory would in production — without relying on a flaky chmod/removal race. */
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readdir: vi.fn(async (dir: string, options: { withFileTypes: true }) => {
      if (String(dir).endsWith("bad-dir")) {
        throw new Error("ENOENT: no such file or directory, scandir 'bad-dir'");
      }
      return actual.readdir(dir, options);
    }),
  };
});

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
  it("skips a directory whose readdir fails instead of rejecting the whole scan, and still returns the other workflows", async () => {
    await writeFile(join(root, "Pledge.json"), PLEDGE);
    await mkdir(join(root, "bad-dir"), { recursive: true });
    await writeFile(join(root, "bad-dir", "Other.json"), PLEDGE);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const entries = await discoverWorkflows(root, ["**/*.json"]);
    expect(entries.map((e) => e.relativePath)).toEqual(["Pledge.json"]);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("[discovery] skipping"));
    stderr.mockRestore();
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
