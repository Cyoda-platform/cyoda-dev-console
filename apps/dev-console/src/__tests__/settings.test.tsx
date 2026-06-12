import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../state/queryClient.js";
import { SettingsRoute } from "../routes/settings.js";

vi.mock("../ipc/config.js", () => ({
  loadAppConfig: vi.fn().mockResolvedValue({
    version: 1,
    activeProjectId: "proj-1",
    recentProjects: [
      {
        id: "proj-1",
        name: "order-demo",
        rootPath: "/projects/order-demo",
        workflowGlobs: ["**/*.json"],
        entityGlobs: ["**/*.json"],
        createdAt: "2026-01-01T00:00:00.000Z",
        lastOpenedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  }),
  saveAppConfig: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../ipc/project.js", () => ({
  selectProjectRoot: vi.fn().mockResolvedValue(null),
  scanProject: vi.fn().mockResolvedValue({ root: "/tmp", scannedAt: "", files: [] }),
}));
vi.mock("../state/projectStore.js", () => ({
  useProjectStore: vi.fn(
    (selector: (s: { active: null; setActive: () => void; clearActive: () => void }) => unknown) =>
      selector({ active: null, setActive: vi.fn(), clearActive: vi.fn() }),
  ),
}));

function wrap(ui: React.ReactElement) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("SettingsRoute", () => {
  beforeEach(() => queryClient.clear());

  it("shows the recent project name after load", async () => {
    wrap(<SettingsRoute />);
    await waitFor(() => expect(screen.getByText("order-demo")).toBeInTheDocument());
  });

  it("renders Switch and Remove buttons for recent projects", async () => {
    wrap(<SettingsRoute />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /switch/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
    });
  });

  it("renders the Open project button", async () => {
    wrap(<SettingsRoute />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /open project/i })).toBeInTheDocument(),
    );
  });
});
