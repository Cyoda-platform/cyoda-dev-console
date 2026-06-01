import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyWorkflowFile } from "../classifier.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

async function classify(name: string) {
  const contents = await readFile(join(fixtureDir, name), "utf8");
  return classifyWorkflowFile({
    path: `/project/${name}`,
    relativePath: name,
    contents,
    lastModified: new Date().toISOString(),
    sizeBytes: Buffer.byteLength(contents),
  });
}

it("classifies a valid workflow file", async () => {
  const e = await classify("valid.json");
  expect(e.status).toBe("valid-workflow");
  expect(e.workflows).toHaveLength(1);
  expect(e.workflows[0]?.name).toBe("demo");
  expect(e.error).toBeUndefined();
});

it("classifies an invalid workflow file and sets error", async () => {
  const e = await classify("invalid.json");
  expect(e.status).toBe("invalid-workflow");
  expect(e.error).toBeTruthy();
});

it("classifies a non-workflow JSON file", async () => {
  const e = await classify("not-workflow.json");
  expect(e.status).toBe("json-not-workflow");
  expect(e.workflows).toHaveLength(0);
  expect(e.error).toBeUndefined();
});

it("classifies a parse-error file and sets error", async () => {
  const e = await classify("parse-error.json");
  expect(e.status).toBe("parse-error");
  expect(e.error).toBeTruthy();
});

it("classifies an export-payload file", async () => {
  const e = await classify("export-payload.json");
  expect(e.status).toBe("export-payload");
  expect(e.workflows).toHaveLength(1);
  expect(e.workflows[0]?.name).toBe("order-flow");
  expect(e.workflows[0]?.entity).toBe("Order");
  expect(e.error).toBeUndefined();
});

it("classifies a probable-workflow file (build-skill format)", async () => {
  const e = await classify("probable-workflow.json");
  expect(e.status).toBe("probable-workflow");
  expect(e.workflows).toHaveLength(1);
  expect(e.workflows[0]?.name).toBe("task-flow");
  expect(e.error).toBeUndefined();
});
