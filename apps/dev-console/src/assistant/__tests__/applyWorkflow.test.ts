import { describe, it, expect } from "vitest";
import { validateAndCanonicalize } from "../applyWorkflow.js";

const VALID = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.3",
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

  // The assistant apply path rewrites the whole payload and canonicalizes it via
  // parseImportPayload -> serializeImportPayload. Lock down that annotations
  // (engine-opaque client metadata) survive that canonicalization at the
  // workflow, state, and transition levels — the AI path the prompt guards.
  it("preserves annotations at root, state, and transition through canonicalization", () => {
    const annotated = JSON.stringify({
      importMode: "MERGE",
      workflows: [
        {
          version: "1.3",
          name: "annotated",
          initialState: "start",
          active: true,
          annotations: { roles: ["reviewer"], label: "Annotated flow" },
          states: {
            start: {
              annotations: { ui: { collapsed: false } },
              transitions: [
                {
                  name: "go",
                  next: "end",
                  manual: false,
                  disabled: false,
                  annotations: { ui: { color: "green" } },
                },
              ],
            },
            end: { transitions: [] },
          },
        },
      ],
    });

    const result = validateAndCanonicalize(annotated);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const wf = JSON.parse(result.canonical).workflows[0];
      expect(wf.annotations).toEqual({ roles: ["reviewer"], label: "Annotated flow" });
      expect(wf.states.start.annotations).toEqual({ ui: { collapsed: false } });
      expect(wf.states.start.transitions[0].annotations).toEqual({ ui: { color: "green" } });
    }
  });
});
