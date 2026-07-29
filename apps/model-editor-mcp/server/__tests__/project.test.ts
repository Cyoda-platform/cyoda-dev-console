import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createToolContext } from "../context.js";
import { getProjectTool, configureProjectTool } from "../tools/project.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "mem-proj-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("getProjectTool", () => {
  it("reports root, current globs, and workflow/entity counts from real discovery", async () => {
    await mkdir(join(root, "models/workflow"), { recursive: true });
    await mkdir(join(root, "models/schema"), { recursive: true });
    await writeFile(
      join(root, "models/workflow/Pledge.json"),
      JSON.stringify({ importMode: "MERGE", workflows: [{ version: "1.3", name: "Pledge", initialState: "none", active: true, states: { none: { transitions: [] } } }] }),
    );
    await writeFile(join(root, "models/schema/Foo.json"), JSON.stringify({ type: "object" }));
    const ctx = createToolContext({ root, workflowGlobs: ["models/workflow/**/*.json"], entityGlobs: ["models/schema/**/*.json"], connectionUrl: "http://x" });

    const r = await getProjectTool({}, ctx);
    expect(JSON.parse(r.content[0]!.text)).toEqual({
      root, workflowGlobs: ["models/workflow/**/*.json"], entityGlobs: ["models/schema/**/*.json"],
      counts: { workflows: 1, entities: 1 },
      _connection: { url: "http://x" },
    });
  });
  it("rejects unknown args", async () => {
    const ctx = createToolContext({ root, workflowGlobs: [], entityGlobs: [], connectionUrl: "http://x" });
    await expect(getProjectTool({ x: 1 }, ctx)).rejects.toMatchObject({ isError: true });
  });
});

describe("configureProjectTool", () => {
  it("updates entityGlobs live — the VERY NEXT get_project call reflects the new globs and counts", async () => {
    await mkdir(join(root, "alt"), { recursive: true });
    await writeFile(join(root, "alt/Bar.json"), JSON.stringify({ type: "object" }));
    const ctx = createToolContext({ root, workflowGlobs: [], entityGlobs: ["models/schema/**/*.json"], connectionUrl: "http://x" });

    const before = JSON.parse((await getProjectTool({}, ctx)).content[0]!.text);
    expect(before.counts.entities).toBe(0);

    const r = await configureProjectTool({ entityGlobs: ["alt/*.json"] }, ctx);
    expect(JSON.parse(r.content[0]!.text)).toMatchObject({ entityGlobs: ["alt/*.json"] });

    const after = JSON.parse((await getProjectTool({}, ctx)).content[0]!.text);
    expect(after.entityGlobs).toEqual(["alt/*.json"]);
    expect(after.counts.entities).toBe(1);
  });

  it("leaves workflowGlobs untouched when only entityGlobs is supplied", async () => {
    const ctx = createToolContext({ root, workflowGlobs: ["a/*.json"], entityGlobs: ["b/*.json"], connectionUrl: "http://x" });
    const r = await configureProjectTool({ entityGlobs: ["c/*.json"] }, ctx);
    expect(JSON.parse(r.content[0]!.text)).toEqual({ root, workflowGlobs: ["a/*.json"], entityGlobs: ["c/*.json"] });
  });

  it("accepts an optional display name as a no-op (no globs change, no crash)", async () => {
    const ctx = createToolContext({ root, workflowGlobs: ["a/*.json"], entityGlobs: ["b/*.json"], connectionUrl: "http://x" });
    const r = await configureProjectTool({ name: "My Project" }, ctx);
    expect(JSON.parse(r.content[0]!.text)).toEqual({ root, workflowGlobs: ["a/*.json"], entityGlobs: ["b/*.json"] });
  });

  it("rejects unknown args", async () => {
    const ctx = createToolContext({ root, workflowGlobs: [], entityGlobs: [], connectionUrl: "http://x" });
    await expect(configureProjectTool({ bogus: 1 }, ctx)).rejects.toMatchObject({ isError: true });
  });
});
