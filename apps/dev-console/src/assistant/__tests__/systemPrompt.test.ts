import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../systemPrompt.js";

describe("buildSystemPrompt", () => {
  it("returns general-question mode text when no currentJson is provided", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt.static).toContain("No workflow file is currently open");
    expect(prompt.static).toContain("open a workflow file");
    expect(prompt.static).not.toContain("propose_workflow_update");
    expect(prompt.dynamic).toBeUndefined();
  });

  it("does not include tool instructions in general mode", () => {
    const prompt = buildSystemPrompt({ workflowRelPath: "wf.json" });
    // relPath without currentJson → general mode
    expect(prompt.static).toContain("No workflow file is currently open");
    expect(prompt.static).not.toContain("propose_workflow_update");
  });

  it("includes tool instructions when currentJson is present", () => {
    const prompt = buildSystemPrompt({ currentJson: '{"importMode":"MERGE","workflows":[]}' });
    expect(prompt.static).toContain("propose_workflow_update");
    expect(prompt.static).toContain("COMPLETE updated import payload");
  });

  it("embeds currentJson inside a json code block in the dynamic part", () => {
    const json = '{"importMode":"MERGE","workflows":[]}';
    const prompt = buildSystemPrompt({ currentJson: json });
    expect(prompt.dynamic).toContain("```json");
    expect(prompt.dynamic).toContain(json);
    expect(prompt.dynamic).toContain("```");
  });

  it("includes the relative file path when both currentJson and workflowRelPath are given", () => {
    const prompt = buildSystemPrompt({
      workflowRelPath: "workflows/order.json",
      currentJson: '{"importMode":"MERGE","workflows":[]}',
    });
    expect(prompt.dynamic).toContain("workflows/order.json");
  });

  it("shows '(unsaved)' when currentJson is present but workflowRelPath is absent", () => {
    const prompt = buildSystemPrompt({ currentJson: '{"importMode":"MERGE","workflows":[]}' });
    expect(prompt.dynamic).toContain("(unsaved)");
  });

  it("always includes the Cyoda workflow description in both modes", () => {
    const general = buildSystemPrompt({});
    const withJson = buildSystemPrompt({ currentJson: "{}" });
    expect(general.static).toContain("Cyoda workflow definitions");
    expect(withJson.static).toContain("Cyoda workflow definitions");
  });

  it("keeps the static part identical across turns when only currentJson changes", () => {
    const a = buildSystemPrompt({ workflowRelPath: "wf.json", currentJson: '{"a":1}' });
    const b = buildSystemPrompt({ workflowRelPath: "wf.json", currentJson: '{"a":2}' });
    expect(a.static).toBe(b.static);
    expect(a.dynamic).not.toBe(b.dynamic);
  });
});
