import { describe, it, expect } from "vitest";
import {
  generateRuleFile,
  generateAgentTaskMd,
  generateProfileInstructionsMd,
  PROFILE_NAME_RE,
} from "../templates.js";
import type { TemplateInput } from "../templates.js";

const minimal: TemplateInput = {
  projectRoot: "/proj",
};

const full: TemplateInput = {
  projectRoot: "/proj",
  workflowRelPath: "workflows/order.json",
  entityRelPath: "models/order.json",
  profileName: "dev",
  endpoint: "http://localhost:8080",
  env: "development",
  brief: "Add a suspended state to the order workflow.",
};

// ─── generateRuleFile ────────────────────────────────────────────────────────

describe("generateRuleFile", () => {
  it("uses the correct header for each agent rule file", () => {
    expect(generateRuleFile("CLAUDE.md", minimal)).toContain("Claude Code project instructions");
    expect(generateRuleFile("GEMINI.md", minimal)).toContain("Gemini CLI project instructions");
    expect(generateRuleFile("AGENTS.md", minimal)).toContain("AGENTS.md");
  });

  it("includes the project root in the context block", () => {
    const rule = generateRuleFile("CLAUDE.md", minimal);
    expect(rule).toContain("/proj");
  });

  it("includes the selected workflow path when provided", () => {
    const rule = generateRuleFile("CLAUDE.md", full);
    expect(rule).toContain("workflows/order.json");
  });

  it("includes the profile name and endpoint when a profile is set", () => {
    const rule = generateRuleFile("CLAUDE.md", full);
    expect(rule).toContain("dev");
    expect(rule).toContain("http://localhost:8080");
  });

  it("shows 'No Cyoda profile selected' when no profile is given", () => {
    const rule = generateRuleFile("CLAUDE.md", minimal);
    expect(rule).toContain("No Cyoda profile selected");
  });

  it("includes the brief under 'What the user wants' when provided", () => {
    const rule = generateRuleFile("CLAUDE.md", full);
    expect(rule).toContain("Add a suspended state");
  });

  it("escapes backticks in projectRoot to prevent code-fence breakout", () => {
    const rule = generateRuleFile("CLAUDE.md", { projectRoot: "/proj/foo`bar" });
    // Raw backtick-wrapped form must not appear in the output
    expect(rule).not.toContain("`/proj/foo`bar`");
  });

  it("escapes backticks in workflowRelPath", () => {
    const rule = generateRuleFile("CLAUDE.md", { projectRoot: "/proj", workflowRelPath: "wf/`bad.json" });
    expect(rule).not.toContain("`wf/`bad.json`");
  });
});

// ─── generateAgentTaskMd ─────────────────────────────────────────────────────

describe("generateAgentTaskMd", () => {
  it("includes the brief when provided", () => {
    const md = generateAgentTaskMd(full, "CLAUDE.md");
    expect(md).toContain("Add a suspended state");
  });

  it("shows a placeholder when no brief is provided", () => {
    const md = generateAgentTaskMd(minimal, "CLAUDE.md");
    expect(md).toContain("(describe the task here)");
  });

  it("includes the endpoint and env", () => {
    const md = generateAgentTaskMd(full, "CLAUDE.md");
    expect(md).toContain("http://localhost:8080");
    expect(md).toContain("development");
  });

  it("references the rule file name", () => {
    const md = generateAgentTaskMd(full, "GEMINI.md");
    expect(md).toContain("GEMINI.md");
  });
});

// ─── generateProfileInstructionsMd ───────────────────────────────────────────

describe("generateProfileInstructionsMd", () => {
  it("produces valid JSON in the jsonc code block", () => {
    const md = generateProfileInstructionsMd(full);
    const match = md.match(/```jsonc\n([\s\S]*?)\n```/);
    expect(match).not.toBeNull();
    const cleaned = match![1]!
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n")
      .replace(/,(\s*[}\]])/g, "$1");
    expect(() => JSON.parse(cleaned)).not.toThrow();
  });

  it("uses JSON.stringify for the endpoint — double-quote in URL does not break JSON", () => {
    const md = generateProfileInstructionsMd({
      ...full,
      endpoint: 'http://host/","token":"stolen',
    });
    const match = md.match(/```jsonc\n([\s\S]*?)\n```/);
    const cleaned = match![1]!
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n")
      .replace(/,(\s*[}\]])/g, "$1");
    expect(() => JSON.parse(cleaned)).not.toThrow();
  });

  it("throws when the profile name contains invalid characters", () => {
    expect(() =>
      generateProfileInstructionsMd({ ...full, profileName: "bad name!" }),
    ).toThrow(/invalid profile name/i);
  });

  it("throws when the endpoint is not a valid URL", () => {
    expect(() =>
      generateProfileInstructionsMd({ ...full, endpoint: "not-a-url" }),
    ).toThrow();
  });

  it("PROFILE_NAME_RE accepts safe names", () => {
    expect(PROFILE_NAME_RE.test("default")).toBe(true);
    expect(PROFILE_NAME_RE.test("my-profile_1")).toBe(true);
  });

  it("PROFILE_NAME_RE rejects names with spaces or special chars", () => {
    expect(PROFILE_NAME_RE.test("bad name")).toBe(false);
    expect(PROFILE_NAME_RE.test("name!")).toBe(false);
  });
});
