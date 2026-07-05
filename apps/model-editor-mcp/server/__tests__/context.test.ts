import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createToolContext } from "../context.js";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "mem-ctx-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("createToolContext", () => {
  it("deleteFile removes a confined file via rmConfined", async () => {
    await mkdir(join(root, "models/schema"), { recursive: true });
    await writeFile(join(root, "models/schema/Foo.json"), "{}");
    const ctx = createToolContext({ root, workflowGlobs: [], entityGlobs: ["models/schema/**/*.json"], connectionUrl: "http://x" });
    await ctx.deleteFile("models/schema/Foo.json");
    await expect(readFile(join(root, "models/schema/Foo.json"), "utf8")).rejects.toThrow();
  });

  it("discoverEntities scopes to entityGlobs, independent of workflowGlobs", async () => {
    await mkdir(join(root, "models/schema"), { recursive: true });
    await mkdir(join(root, "models/workflow"), { recursive: true });
    await writeFile(join(root, "models/schema/Foo.json"), JSON.stringify({ type: "object" }));
    await writeFile(join(root, "models/workflow/Bar.json"), JSON.stringify({ importMode: "MERGE", workflows: [] }));
    const ctx = createToolContext({ root, workflowGlobs: ["models/workflow/**/*.json"], entityGlobs: ["models/schema/**/*.json"], connectionUrl: "http://x" });
    expect((await ctx.discoverEntities()).map((e) => e.name)).toEqual(["Foo"]);
  });

  it("setGlobs mutates entityGlobs LIVE — the very next discoverEntities() call sees it", async () => {
    await mkdir(join(root, "alt"), { recursive: true });
    await writeFile(join(root, "alt/Extra.json"), JSON.stringify({ type: "object" }));
    const ctx = createToolContext({ root, workflowGlobs: [], entityGlobs: ["models/schema/**/*.json"], connectionUrl: "http://x" });
    expect(await ctx.discoverEntities()).toEqual([]);

    ctx.setGlobs({ entityGlobs: ["alt/*.json"] });

    expect(ctx.entityGlobs).toEqual(["alt/*.json"]);
    expect((await ctx.discoverEntities()).map((e) => e.name)).toEqual(["Extra"]);
  });

  it("setGlobs leaves an omitted glob list unchanged", () => {
    const ctx = createToolContext({ root, workflowGlobs: ["models/workflow/**/*.json"], entityGlobs: ["models/schema/**/*.json"], connectionUrl: "http://x" });
    ctx.setGlobs({ entityGlobs: ["other/**/*.json"] });
    expect(ctx.workflowGlobs).toEqual(["models/workflow/**/*.json"]);
    expect(ctx.entityGlobs).toEqual(["other/**/*.json"]);
  });
});
