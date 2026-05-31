import { describe, it, expect } from "vitest";
import { parseImportPayload, serializeImportPayload } from "@cyoda/workflow-core";

const fixture = JSON.stringify({
  importMode: "MERGE",
  workflows: [
    {
      version: "1.0",
      name: "demo",
      initialState: "S",
      active: true,
      states: { S: { transitions: [] } },
    },
  ],
});

describe("dirty rule", () => {
  it("mutating editor metadata (workflowUi) is NOT dirty", () => {
    const { document } = parseImportPayload(fixture);
    const baseline = serializeImportPayload(document!);
    const next = {
      ...document!,
      meta: {
        ...document!.meta,
        workflowUi: { demo: { viewPreset: "compact" as const } },
      },
    };
    expect(serializeImportPayload(next) === baseline).toBe(true);
  });

  it("mutating a transition IS dirty", () => {
    const { document } = parseImportPayload(fixture);
    const baseline = serializeImportPayload(document!);
    const next = structuredClone(document!);
    next.session.workflows[0]!.states["S"]!.transitions.push({
      name: "go",
      next: "S",
      manual: false,
      disabled: false,
    });
    expect(serializeImportPayload(next) === baseline).toBe(false);
  });
});
