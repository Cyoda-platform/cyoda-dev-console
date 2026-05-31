import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { App } from "../App.js";

vi.mock("../ipc/project.js", () => ({
  selectProjectRoot: vi.fn().mockResolvedValue(null),
  scanProject: vi.fn().mockResolvedValue({ root: "/tmp", scannedAt: "", files: [] }),
}));
vi.mock("../ipc/watcher.js", () => ({
  watchProject: vi.fn().mockResolvedValue(undefined),
  onFileChanged: vi.fn().mockReturnValue(Promise.resolve(() => undefined)),
}));
vi.mock("../ipc/fsio.js", () => ({
  readTextFile: vi.fn(),
  writeTextFileWithConfirmedOverwrite: vi.fn(),
  saveFileAs: vi.fn(),
}));
vi.mock("../ipc/config.js", () => ({
  loadAppConfig: vi.fn().mockResolvedValue({ version: 1, activeProjectId: null, recentProjects: [] }),
  saveAppConfig: vi.fn().mockResolvedValue(undefined),
}));

describe("sidebar nav items", () => {
  it("renders Workflows, Entities, and Project nav items", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Workflows" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entities" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Project" })).toBeInTheDocument();
  });

  it("does not render AI Agent nav item when feature flag is off", () => {
    render(<App />);
    expect(screen.queryByRole("button", { name: "AI Agent" })).not.toBeInTheDocument();
  });
});
