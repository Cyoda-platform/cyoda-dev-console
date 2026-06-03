import { describe, it, expect } from "vitest";
import { validateAndCanonicalize } from "../applyWorkflow.js";

const VALID = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "minimal",
      initialState: "start",
      active: true,
      states: {
        start: { transitions: [{ name: "go", next: "end", manual: false, disabled: false }] },
        end: { transitions: [] },
      },
    },
  ],
});

describe("validateAndCanonicalize", () => {
  it("accepts a valid import payload and returns canonical JSON", () => {
    const result = validateAndCanonicalize(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = JSON.parse(result.canonical);
      expect(parsed.importMode).toBe("MERGE");
      expect(parsed.workflows[0].name).toBe("minimal");
    }
  });

  it("rejects non-JSON input with issues", () => {
    const result = validateAndCanonicalize("{ not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  });

  it("rejects valid JSON that is not a workflow payload", () => {
    const result = validateAndCanonicalize('{"foo":1}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  });
});
