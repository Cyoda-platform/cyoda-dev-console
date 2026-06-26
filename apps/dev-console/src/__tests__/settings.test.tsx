import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
        workflowRoot: null,
        entityRoot: null,
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
const store = vi.hoisted(() => ({
  active: null as null | { id: string },
  setActive: vi.fn(),
  clearActive: vi.fn(),
}));
vi.mock("../state/projectStore.js", () => ({
  useProjectStore: vi.fn((selector: (s: typeof store) => unknown) => selector(store)),
}));

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

function wrap(ui: React.ReactElement) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("SettingsRoute", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", makeStorage());
    queryClient.clear();
    localStorage.clear();
    store.active = null;
    store.setActive.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

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

  it("shows the setup-tips callout by default", async () => {
    wrap(<SettingsRoute />);
    await waitFor(() =>
      expect(
        screen.getByText(/Auto-detection of workflow and entity files is still evolving/i),
      ).toBeInTheDocument(),
    );
  });

  it("dismisses the callout, persists the flag, and shows a reset link", async () => {
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /dismiss/i }));
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    await waitFor(() => {
      expect(
        screen.queryByText(/Auto-detection of workflow and entity files is still evolving/i),
      ).toBeNull();
      expect(screen.getByRole("button", { name: /show setup tips/i })).toBeInTheDocument();
    });
    expect(localStorage.getItem("cyoda.setupTipsDismissed")).toBe("1");
  });

  it("restores the callout when the reset link is clicked", async () => {
    localStorage.setItem("cyoda.setupTipsDismissed", "1");
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /show setup tips/i }));
    fireEvent.click(screen.getByRole("button", { name: /show setup tips/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Auto-detection of workflow and entity files is still evolving/i),
      ).toBeInTheDocument();
    });
    expect(localStorage.getItem("cyoda.setupTipsDismissed")).toBeNull();
  });

  it("hides the folder-structure detail until the disclosure is expanded", async () => {
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));

    expect(screen.getByRole("button", { name: /recommended folder structure/i })).toBeInTheDocument();
    expect(screen.queryByText(/distinct per-entity file names/i)).toBeNull();
  });

  it("reveals the folder-structure convention when expanded", async () => {
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /recommended folder structure/i }));

    expect(screen.getByText(/distinct per-entity file names/i)).toBeInTheDocument();
    expect(screen.getByText(/example data/i)).toBeInTheDocument();
  });

  it("shows the Project name input in the Configure panel", async () => {
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    expect(screen.getByLabelText("Project name")).toBeInTheDocument();
  });

  it("persists an edited name", async () => {
    const { saveAppConfig } = await import("../ipc/config.js");
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "Renamed Project" } });
    fireEvent.blur(input);
    await waitFor(() => {
      const saved = (saveAppConfig as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
      expect(saved.recentProjects.find((p: { id: string }) => p.id === "proj-1").name).toBe("Renamed Project");
    });
  });

  it("re-setActives the active project after an edit", async () => {
    store.active = { id: "proj-1" };
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /configure/i }));
    fireEvent.click(screen.getByRole("button", { name: /configure/i }));
    const input = screen.getByLabelText("Project name");
    fireEvent.change(input, { target: { value: "Active Renamed" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(store.setActive).toHaveBeenCalledWith(
        expect.objectContaining({ id: "proj-1", name: "Active Renamed" }),
      ),
    );
  });

  it("removes a project via the shared confirm modal (bolded name in body)", async () => {
    wrap(<SettingsRoute />);
    await waitFor(() => screen.getByRole("button", { name: /remove/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() => expect(screen.getByText("Remove project?")).toBeInTheDocument());
    // the project name renders bold inside the modal body
    const strong = screen.getByText("order-demo", { selector: "strong" });
    expect(strong).toBeInTheDocument();
    const { saveAppConfig } = await import("../ipc/config.js");
    fireEvent.click(screen.getAllByRole("button", { name: /remove/i }).at(-1)!);
    await waitFor(() => expect(saveAppConfig).toHaveBeenCalled());
    const saved = (saveAppConfig as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(saved.recentProjects.find((p: { id: string }) => p.id === "proj-1")).toBeUndefined();
  });
});
