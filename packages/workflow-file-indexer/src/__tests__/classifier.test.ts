import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyWorkflowFile } from "../classifier.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

async function classify(name: string, cyodaGoVersion?: string) {
  const contents = await readFile(join(fixtureDir, name), "utf8");
  return classifyWorkflowFile(
    {
      path: `/project/${name}`,
      relativePath: name,
      contents,
      lastModified: new Date().toISOString(),
      sizeBytes: Buffer.byteLength(contents),
    },
    cyodaGoVersion,
  );
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

it("classifies a standalone workflow definition (block-portal format)", async () => {
  const e = await classify("standalone-workflow.json");
  expect(e.status).toBe("probable-workflow");
  expect(e.workflows).toHaveLength(1);
  expect(e.workflows[0]?.name).toBe("investor_workflow");
  expect(e.error).toBeUndefined();
});

// --- per-project cyoda-go version selection ---

it("marks a clean workflow parsed under a non-latest version as valid-workflow-legacy", async () => {
  const e = await classify("valid.json", "0.7");
  expect(e.status).toBe("valid-workflow-legacy");
  expect(e.cyodaVersion).toBe("0.7");
  expect(e.workflows[0]?.name).toBe("demo");
});

it("marks the same workflow as plain valid-workflow under the latest version", async () => {
  const e = await classify("valid.json", "0.8");
  expect(e.status).toBe("valid-workflow");
  expect(e.cyodaVersion).toBeUndefined();
});

it("flags a scheduled-processor file as incompatible-version in a v0.8 project", async () => {
  // The scheduled-processor type only parses under v0.7 (v0.8 removed it), so in a
  // v0.8 project the file is a version mismatch, not malformed. NOTE: this is the
  // reachable meaning of "incompatible-version" — a file that parses under a
  // *different* supported dialect. (The spec's literal "no dialect can parse" wording
  // collapses into invalid-workflow because both dialects share one schema.)
  const e = await classify("scheduled-processor.json", "0.8");
  expect(e.status).toBe("incompatible-version");
  expect(e.cyodaVersion).toBe("0.7");
  expect(e.error).toBeTruthy();
});

it("parses the same scheduled-processor file as legacy in a v0.7 project", async () => {
  const e = await classify("scheduled-processor.json", "0.7");
  expect(e.status).toBe("valid-workflow-legacy");
  expect(e.cyodaVersion).toBe("0.7");
});

it("keeps a genuinely malformed import payload as invalid-workflow (fails every dialect)", async () => {
  const e = await classify("invalid.json", "0.8");
  expect(e.status).toBe("invalid-workflow");
  expect(e.error).toBeTruthy();
});
