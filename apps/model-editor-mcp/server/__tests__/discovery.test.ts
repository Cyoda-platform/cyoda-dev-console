import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverWorkflows, findByName, discoverEntities, findEntityByName, resolveEntityCreatePath, resolveWorkflowCreatePath } from "../discovery.js";

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

describe("discoverEntities", () => {
  it("takes each entityGlobs-matched JSON OBJECT file as an entity, named by file stem", async () => {
    await mkdir(join(root, "models/schema/v1"), { recursive: true });
    await writeFile(join(root, "models/schema/v1/CollateralAsset.json"), JSON.stringify({ type: "object", properties: {} }));
    await writeFile(join(root, "models/schema/v1/NotAnObject.json"), JSON.stringify(["a", "b"]));
    await writeFile(join(root, "models/schema/v1/Broken.json"), "{not json");
    await writeFile(join(root, "unrelated.json"), JSON.stringify({ foo: "bar" }));
    const entities = await discoverEntities(root, ["models/schema/**/*.json"]);
    expect(entities).toEqual([{
      relativePath: "models/schema/v1/CollateralAsset.json", name: "CollateralAsset",
      lastModified: expect.any(String), sizeBytes: expect.any(Number),
    }]);
  });
  it("returns nothing when entityGlobs is empty — no full-tree fallback", async () => {
    await writeFile(join(root, "x.json"), JSON.stringify({ a: 1 }));
    expect(await discoverEntities(root, [])).toEqual([]);
  });
  it("excludes node_modules/.git/dist like discoverWorkflows does", async () => {
    await mkdir(join(root, "node_modules/pkg"), { recursive: true });
    await writeFile(join(root, "node_modules/pkg/Fake.json"), JSON.stringify({ a: 1 }));
    expect(await discoverEntities(root, ["**/*.json"])).toEqual([]);
  });
});

describe("findEntityByName", () => {
  it("matches by file stem", () => {
    const entities = [{ relativePath: "models/schema/v1/CollateralAsset.json", name: "CollateralAsset", lastModified: "t", sizeBytes: 1 }];
    expect(findEntityByName(entities, "CollateralAsset")?.relativePath).toBe("models/schema/v1/CollateralAsset.json");
    expect(findEntityByName(entities, "Nope")).toBeUndefined();
  });
});

describe("resolveEntityCreatePath", () => {
  describe("empty discovery (fallback to the glob-literal prefix)", () => {
    it("derives the literal directory prefix before the first wildcard segment", () => {
      expect(resolveEntityCreatePath(["models/schema/**/*.json"], "Foo", [])).toBe("models/schema/Foo.json");
      expect(resolveEntityCreatePath(["models/schema/v1/*.json"], "Foo", [])).toBe("models/schema/v1/Foo.json");
    });
    it("falls back to the project root when the pattern has no directory", () => {
      expect(resolveEntityCreatePath(["*.json"], "Foo", [])).toBe("Foo.json");
    });
    it("uses the FIRST configured glob when several are set", () => {
      expect(resolveEntityCreatePath(["a/*.json", "b/*.json"], "Foo", [])).toBe("a/Foo.json");
    });
    it("throws when no entityGlobs are configured", () => {
      expect(() => resolveEntityCreatePath([], "Foo", [])).toThrow();
    });
  });

  describe("non-empty discovery (targets where the existing files actually live)", () => {
    it("lands the new file in the SAME directory as a single existing entry, past where a ** glob's literal prefix would stop", () => {
      const existing = [{ relativePath: "models/schema/v1/Existing.json" }];
      expect(resolveEntityCreatePath(["models/schema/**/*.json"], "Foo", existing)).toBe("models/schema/v1/Foo.json");
    });
    it("picks the MAJORITY directory, not merely the sorted-first entry's directory", () => {
      // First entry (by array/sort order) lives in "b"; the majority (2 of 3) lives in "a".
      const existing = [
        { relativePath: "b/three.json" },
        { relativePath: "a/one.json" },
        { relativePath: "a/two.json" },
      ];
      expect(resolveEntityCreatePath(["**/*.json"], "Foo", existing)).toBe("a/Foo.json");
    });
    it("breaks a frequency tie using the sorted-first entry's directory", () => {
      const existing = [{ relativePath: "b/only.json" }, { relativePath: "a/one.json" }];
      expect(resolveEntityCreatePath(["**/*.json"], "Foo", existing)).toBe("b/Foo.json");
    });
    it("targets the project root when the existing entries live at the root", () => {
      const existing = [{ relativePath: "Existing.json" }];
      expect(resolveEntityCreatePath(["**/*.json"], "Foo", existing)).toBe("Foo.json");
    });
  });
});

describe("resolveWorkflowCreatePath", () => {
  describe("empty discovery (fallback to the glob-literal prefix)", () => {
    it("derives the literal directory prefix before the first wildcard segment", () => {
      expect(resolveWorkflowCreatePath(["models/workflow/**/*.json"], "Foo", [])).toBe("models/workflow/Foo.json");
      expect(resolveWorkflowCreatePath(["models/workflow/v1/*.json"], "Foo", [])).toBe("models/workflow/v1/Foo.json");
    });
    it("falls back to the project root when the pattern has no directory", () => {
      expect(resolveWorkflowCreatePath(["*.json"], "Foo", [])).toBe("Foo.json");
    });
    it("uses the FIRST configured glob when several are set", () => {
      expect(resolveWorkflowCreatePath(["a/*.json", "b/*.json"], "Foo", [])).toBe("a/Foo.json");
    });
    it("throws when no workflowGlobs are configured", () => {
      expect(() => resolveWorkflowCreatePath([], "Foo", [])).toThrow();
    });
  });

  describe("non-empty discovery (targets where the existing files actually live)", () => {
    it("lands the new file in the SAME directory as the existing workflow, past where a ** glob's literal prefix would stop", () => {
      const existing = [{ relativePath: "models/workflow/v1/Foo.json" }];
      expect(resolveWorkflowCreatePath(["models/workflow/**/*.json"], "Bar", existing)).toBe("models/workflow/v1/Bar.json");
    });
    it("picks the MAJORITY directory, not merely the sorted-first entry's directory", () => {
      const existing = [
        { relativePath: "b/three.json" },
        { relativePath: "a/one.json" },
        { relativePath: "a/two.json" },
      ];
      expect(resolveWorkflowCreatePath(["**/*.json"], "Foo", existing)).toBe("a/Foo.json");
    });
    it("breaks a frequency tie using the sorted-first entry's directory", () => {
      const existing = [{ relativePath: "b/only.json" }, { relativePath: "a/one.json" }];
      expect(resolveWorkflowCreatePath(["**/*.json"], "Foo", existing)).toBe("b/Foo.json");
    });
    it("targets the project root when the existing entries live at the root", () => {
      const existing = [{ relativePath: "Existing.json" }];
      expect(resolveWorkflowCreatePath(["**/*.json"], "Foo", existing)).toBe("Foo.json");
    });
  });
});
