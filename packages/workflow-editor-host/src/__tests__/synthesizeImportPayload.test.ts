import { describe, it, expect } from "vitest";
import { synthesizeImportPayload } from "../synthesizeImportPayload.js";

describe("synthesizeImportPayload", () => {
  it("leaves an import payload (already has importMode) unchanged", () => {
    const contents = JSON.stringify({ importMode: "MERGE", workflows: [] });
    expect(synthesizeImportPayload(contents)).toBe(contents);
  });

  it("wraps a bare { workflows: [...] } object with importMode: MERGE", () => {
    const contents = JSON.stringify({ workflows: [{ name: "demo" }] });
    const result = JSON.parse(synthesizeImportPayload(contents));
    expect(result).toEqual({ importMode: "MERGE", workflows: [{ name: "demo" }] });
  });

  it("wraps a standalone workflow object (block-portal format) into a workflows array", () => {
    const workflow = { version: "1.0", name: "nda", initialState: "S", states: { S: { transitions: [] } } };
    const contents = JSON.stringify(workflow);
    const result = JSON.parse(synthesizeImportPayload(contents));
    expect(result).toEqual({ importMode: "MERGE", workflows: [workflow] });
  });

  it("leaves invalid JSON unchanged", () => {
    const contents = "{ not json";
    expect(synthesizeImportPayload(contents)).toBe(contents);
  });

  it("leaves a JSON array unchanged", () => {
    const contents = JSON.stringify([{ name: "demo" }]);
    expect(synthesizeImportPayload(contents)).toBe(contents);
  });
});
