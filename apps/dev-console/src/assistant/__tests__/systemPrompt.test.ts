import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../systemPrompt.js";

describe("buildSystemPrompt", () => {
  it("returns general-question mode text when no currentJson is provided", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).toContain("No workflow file is currently open");
    expect(prompt).toContain("open a workflow file");
    expect(prompt).not.toContain("propose_workflow_update");
  });

  it("does not include tool instructions in general mode", () => {
    const prompt = buildSystemPrompt({ workflowRelPath: "wf.json" });
    // relPath without currentJson → general mode
    expect(prompt).toContain("No workflow file is currently open");
    expect(prompt).not.toContain("propose_workflow_update");
  });

  it("includes tool instructions when currentJson is present", () => {
    const prompt = buildSystemPrompt({ currentJson: '{"importMode":"MERGE","workflows":[]}' });
    expect(prompt).toContain("propose_workflow_update");
    expect(prompt).toContain("COMPLETE updated import payload");
  });

  it("embeds currentJson inside a json code block", () => {
    const json = '{"importMode":"MERGE","workflows":[]}';
    const prompt = buildSystemPrompt({ currentJson: json });
    expect(prompt).toContain("```json");
    expect(prompt).toContain(json);
    expect(prompt).toContain("```");
  });

  it("includes the relative file path when both currentJson and workflowRelPath are given", () => {
    const prompt = buildSystemPrompt({
      workflowRelPath: "workflows/order.json",
      currentJson: '{"importMode":"MERGE","workflows":[]}',
    });
    expect(prompt).toContain("workflows/order.json");
  });

  it("shows '(unsaved)' when currentJson is present but workflowRelPath is absent", () => {
    const prompt = buildSystemPrompt({ currentJson: '{"importMode":"MERGE","workflows":[]}' });
    expect(prompt).toContain("(unsaved)");
  });

  it("always includes the Cyoda workflow description in both modes", () => {
    const general = buildSystemPrompt({});
    const withJson = buildSystemPrompt({ currentJson: "{}" });
    expect(general).toContain("Cyoda workflow definitions");
    expect(withJson).toContain("Cyoda workflow definitions");
  });
});
