import { describe, it, expect } from "vitest";
import type { AgentContext, TaskBundleRequest } from "@cyoda/agent-bridge-contract";
import { assembleBundle, BUNDLE_DIR } from "../bundle.js";
import { generateRuleFile, generateProfileInstructionsMd } from "../templates.js";

const ctx: AgentContext = {
  projectRoot: "/proj",
  selectedWorkflowPath: "/proj/wf/order.json",
  selectedEntityPath: "/proj/models/order.json",
};

const baseReq: TaskBundleRequest = {
  targetProjectPath: "/proj",
  agentRuleFile: "CLAUDE.md",
  consoleEnvironment: "development",
  apiBaseUrl: "http://localhost:8080",
};

describe("assembleBundle", () => {
  it("emits the core files and omits optional JSON by default", () => {
    const files = assembleBundle({ request: baseReq, context: ctx });
    const paths = files.map((f) => f.relativePath).sort();
    expect(paths).toEqual(
      [
        `${BUNDLE_DIR}/CLAUDE.md`,
        `${BUNDLE_DIR}/MANIFEST.json`,
        `${BUNDLE_DIR}/cyoda-agent-task.md`,
        `${BUNDLE_DIR}/profile-instructions.md`,
      ].sort(),
    );
  });

  it("includes workflow + entity JSON when requested and present", () => {
    const files = assembleBundle({
      request: { ...baseReq, includeWorkflowJson: true, includeEntitySampleJson: true },
      context: ctx,
      workflowJson: '{"workflows":[]}',
      entitySampleJson: '{"id":1}',
    });
    const paths = files.map((f) => f.relativePath);
    expect(paths).toContain(`${BUNDLE_DIR}/workflow.json`);
    expect(paths).toContain(`${BUNDLE_DIR}/entity-sample.json`);
    expect(files.find((f) => f.relativePath.endsWith("workflow.json"))!.contents).toBe(
      '{"workflows":[]}',
    );
  });

  it("does not include JSON when the flag is set but contents are absent", () => {
    const files = assembleBundle({
      request: { ...baseReq, includeWorkflowJson: true },
      context: ctx,
    });
    expect(files.map((f) => f.relativePath)).not.toContain(`${BUNDLE_DIR}/workflow.json`);
  });

  it("records the selected profile in the manifest", () => {
    const files = assembleBundle({
      request: baseReq,
      context: ctx,
      profile: {
        name: "prod",
        profile: { endpoint: "https://x.cyoda.net", env: "production", token: "t" },
      },
    });
    const manifest = JSON.parse(
      files.find((f) => f.relativePath.endsWith("MANIFEST.json"))!.contents,
    );
    expect(manifest.cyodaProfile).toBe("prod");
    expect(manifest.ruleFile).toBe("CLAUDE.md");
  });

  it("always writes MANIFEST.json last (commit-marker invariant)", () => {
    const files = assembleBundle({ request: baseReq, context: ctx });
    expect(files.at(-1)!.relativePath).toMatch(/MANIFEST\.json$/);
  });
});

describe("profile-instructions validation", () => {
  it("rejects an unsafe profile name", () => {
    expect(() =>
      generateProfileInstructionsMd({ projectRoot: "/p", profileName: "bad name!" }),
    ).toThrow(/Invalid profile name/);
  });

  it("rejects a non-URL endpoint", () => {
    expect(() =>
      generateProfileInstructionsMd({ projectRoot: "/p", profileName: "ok", endpoint: "not a url" }),
    ).toThrow();
  });

  it("accepts a valid name + endpoint", () => {
    const md = generateProfileInstructionsMd({
      projectRoot: "/p",
      profileName: "default",
      endpoint: "http://localhost:8080",
    });
    expect(md).toContain('"active": "default"');
  });
});

describe("generateRuleFile", () => {
  it("produces a rule file within the 4–12 KiB target", () => {
    const content = generateRuleFile("GEMINI.md", {
      projectRoot: "/proj",
      workflowRelPath: "wf/order.json",
      brief: "Add a refund transition to the order workflow.",
    });
    const bytes = new TextEncoder().encode(content).length;
    expect(bytes).toBeGreaterThanOrEqual(2_000);
    expect(bytes).toBeLessThanOrEqual(12_288);
    expect(content).toContain("Gemini CLI");
  });
});

describe("template injection safety", () => {
  it("F-04: an endpoint with a double-quote does not break the JSON code block", () => {
    const md = generateProfileInstructionsMd({
      projectRoot: "/proj",
      profileName: "dev",
      endpoint: 'http://host/path","token":"injected',
      env: "development",
    });
    // Extract the jsonc block
    const match = md.match(/```jsonc\n([\s\S]*?)\n```/);
    expect(match).not.toBeNull();
    // Strip jsonc comments and trailing commas, then parse as JSON
    const cleaned = (match![1] as string)
      .split('\n')
      .filter(line => !line.trimStart().startsWith('//'))
      .join('\n')
      .replace(/,(\s*[}\]])/g, "$1");
    expect(() => JSON.parse(cleaned)).not.toThrow();
  });

  it("F-05: a backtick in projectRoot does not break a code fence", () => {
    const rule = generateRuleFile("CLAUDE.md", {
      projectRoot: "/proj/foo`bar",
      workflowRelPath: "wf/`evil.json",
    });
    // The raw backtick-wrapped path must not appear verbatim (would close the fence)
    expect(rule).not.toContain("`/proj/foo`bar`");
    expect(rule).not.toContain("`wf/`evil.json`");
  });
});
