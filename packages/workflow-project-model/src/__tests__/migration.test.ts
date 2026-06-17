import { describe, it, expect } from "vitest";
import { DevProjectSchema, AppConfigSchema } from "../schema.js";

const baseProject = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "legacy-project",
  rootPath: "/proj",
  workflowGlobs: ["**/*.json"],
  entityGlobs: ["**/*.json"],
  workflowRoot: null,
  entityRoot: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastOpenedAt: "2026-01-01T00:00:00.000Z",
};

describe("DevProject cyodaGoVersion migration", () => {
  it("defaults a project missing cyodaGoVersion to 0.7 (conservative)", () => {
    const parsed = DevProjectSchema.parse(baseProject);
    expect(parsed.cyodaGoVersion).toBe("0.7");
  });

  it("preserves an explicit cyodaGoVersion", () => {
    const parsed = DevProjectSchema.parse({ ...baseProject, cyodaGoVersion: "0.8" });
    expect(parsed.cyodaGoVersion).toBe("0.8");
  });

  it("rejects an unsupported cyodaGoVersion value", () => {
    expect(() => DevProjectSchema.parse({ ...baseProject, cyodaGoVersion: "0.6" })).toThrow();
  });

  it("migrates every project in a persisted AppConfig on load", () => {
    const cfg = AppConfigSchema.parse({
      version: 1,
      activeProjectId: baseProject.id,
      recentProjects: [baseProject],
    });
    expect(cfg.recentProjects[0]?.cyodaGoVersion).toBe("0.7");
  });
});
