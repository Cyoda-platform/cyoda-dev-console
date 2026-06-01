import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@cyoda/console-design-system";
import { ProjectExplorer } from "../components/ProjectExplorer.js";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";

vi.mock("../ipc/shell.js", () => ({
  revealInFinder: vi.fn().mockResolvedValue(undefined),
  openInIde: vi.fn().mockResolvedValue(undefined),
}));

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const workflowEntry: WorkflowFileIndexEntry = {
  path: "/project/configs/greeting_workflow.json",
  relativePath: "configs/greeting_workflow.json",
  status: "valid-workflow",
  workflows: [{ name: "greeting_workflow" }],
  lastModified: "",
  sizeBytes: 0,
};

const workflowEntryInSubdir: WorkflowFileIndexEntry = {
  path: "/project/workflows/approval_workflow.json",
  relativePath: "workflows/approval_workflow.json",
  status: "valid-workflow",
  workflows: [{ name: "approval_workflow" }],
  lastModified: "",
  sizeBytes: 0,
};

const entityEntry: WorkflowFileIndexEntry = {
  path: "/project/models/order.json",
  relativePath: "models/order.json",
  status: "json-not-workflow",
  workflows: [],
  lastModified: "",
  sizeBytes: 0,
};

const entityEntryInSubdir: WorkflowFileIndexEntry = {
  path: "/project/entities/customer.json",
  relativePath: "entities/customer.json",
  status: "json-not-workflow",
  workflows: [],
  lastModified: "",
  sizeBytes: 0,
};

const parseErrorEntry: WorkflowFileIndexEntry = {
  path: "/project/configs/broken.json",
  relativePath: "configs/broken.json",
  status: "parse-error",
  workflows: [],
  lastModified: "",
  sizeBytes: 0,
};

const baseProps = {
  selectedPath: null,
  onOpen: vi.fn(),
  collapsed: false,
  onToggleCollapse: vi.fn(),
  onRescan: vi.fn(),
  onOpenSettings: vi.fn(),
  projectRoot: "/project",
};

describe("ProjectExplorer", () => {
  it("renders Workflows and Entities sections", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry, entityEntry]} />);
    expect(screen.getByRole("button", { name: /Workflows/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Entities/ })).toBeInTheDocument();
  });

  it("renders Project section", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[]} />);
    expect(screen.getByRole("button", { name: /Project/ })).toBeInTheDocument();
  });

  it("shows workflow display name — not the full path", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry]} />);
    expect(screen.getByText("greeting")).toBeInTheDocument();
    expect(screen.queryByText("configs/greeting_workflow.json")).not.toBeInTheDocument();
  });

  it("full relative path is available as tooltip on the item", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry]} />);
    const item = screen.getByTitle("configs/greeting_workflow.json");
    expect(item).toBeInTheDocument();
  });

  it("calls onOpen when a workflow item is clicked", async () => {
    const onOpen = vi.fn();
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry]} onOpen={onOpen} />);
    await userEvent.click(screen.getByTitle("configs/greeting_workflow.json"));
    expect(onOpen).toHaveBeenCalledWith(workflowEntry);
  });

  it("calls onOpen when an entity item is clicked", async () => {
    const onOpen = vi.fn();
    wrap(<ProjectExplorer {...baseProps} allEntries={[entityEntry]} onOpen={onOpen} />);
    await userEvent.click(screen.getByTitle("models/order.json"));
    expect(onOpen).toHaveBeenCalledWith(entityEntry);
  });

  it("shows selected state on the active item", () => {
    wrap(
      <ProjectExplorer
        {...baseProps}
        allEntries={[workflowEntry]}
        selectedPath={workflowEntry.path}
      />,
    );
    const item = screen.getByTitle("configs/greeting_workflow.json");
    expect(item).toHaveAttribute("aria-pressed", "true");
  });

  it("collapses workflows section when header is clicked", async () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry]} />);
    expect(screen.getByText("greeting")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Workflows/ }));
    expect(screen.queryByText("greeting")).not.toBeInTheDocument();
  });

  it("collapses entities section when header is clicked", async () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[entityEntry]} />);
    expect(screen.getByText("order")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Entities/ }));
    expect(screen.queryByText("order")).not.toBeInTheDocument();
  });

  it("filters workflows by search query", async () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry, parseErrorEntry]} />);
    await userEvent.type(screen.getByRole("searchbox"), "greeting");
    expect(screen.getByText("greeting")).toBeInTheDocument();
    expect(screen.queryByTitle("configs/broken.json")).not.toBeInTheDocument();
  });

  it("shows no-match message when search has no results", async () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry]} />);
    await userEvent.type(screen.getByRole("searchbox"), "zzznomatch");
    // Both sections show "No matches" when the query has no results
    const msgs = screen.getAllByText("No matches");
    expect(msgs.length).toBeGreaterThan(0);
  });

  it("status dot has accessible label for valid workflow", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry]} />);
    expect(screen.getByLabelText("valid")).toBeInTheDocument();
  });

  it("status dot has accessible label for parse error", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[parseErrorEntry]} />);
    expect(screen.getByLabelText("error")).toBeInTheDocument();
  });

  it("renders collapse button when not collapsed", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[]} />);
    expect(screen.getByRole("button", { name: "Collapse explorer" })).toBeInTheDocument();
  });

  it("renders expand button when collapsed", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[]} collapsed={true} />);
    expect(screen.getByRole("button", { name: "Expand explorer" })).toBeInTheDocument();
  });

  it("calls onToggleCollapse when collapse button is clicked", async () => {
    const onToggle = vi.fn();
    wrap(<ProjectExplorer {...baseProps} allEntries={[]} onToggleCollapse={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: "Collapse explorer" }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("calls onOpenSettings from Project section", async () => {
    const onOpenSettings = vi.fn();
    wrap(
      <ProjectExplorer {...baseProps} allEntries={[]} onOpenSettings={onOpenSettings} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Project/ }));
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("search input has accessible label", () => {
    wrap(<ProjectExplorer {...baseProps} allEntries={[]} />);
    expect(screen.getByLabelText("Search files")).toBeInTheDocument();
  });

  it("item is keyboard-activatable with Enter", async () => {
    const onOpen = vi.fn();
    wrap(<ProjectExplorer {...baseProps} allEntries={[workflowEntry]} onOpen={onOpen} />);
    const item = screen.getByTitle("configs/greeting_workflow.json");
    item.focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith(workflowEntry);
  });

  it("workflowRoot hides workflows outside that directory", () => {
    wrap(
      <ProjectExplorer
        {...baseProps}
        allEntries={[workflowEntry, workflowEntryInSubdir]}
        workflowRoot="workflows"
      />,
    );
    expect(screen.getByTitle("workflows/approval_workflow.json")).toBeInTheDocument();
    expect(screen.queryByTitle("configs/greeting_workflow.json")).not.toBeInTheDocument();
  });

  it("entityRoot hides entities outside that directory", () => {
    wrap(
      <ProjectExplorer
        {...baseProps}
        allEntries={[entityEntry, entityEntryInSubdir]}
        entityRoot="entities"
      />,
    );
    expect(screen.getByTitle("entities/customer.json")).toBeInTheDocument();
    expect(screen.queryByTitle("models/order.json")).not.toBeInTheDocument();
  });

  it("null workflowRoot shows all workflows", () => {
    wrap(
      <ProjectExplorer
        {...baseProps}
        allEntries={[workflowEntry, workflowEntryInSubdir]}
        workflowRoot={null}
      />,
    );
    expect(screen.getByTitle("configs/greeting_workflow.json")).toBeInTheDocument();
    expect(screen.getByTitle("workflows/approval_workflow.json")).toBeInTheDocument();
  });

  it("null entityRoot shows all entities", () => {
    wrap(
      <ProjectExplorer
        {...baseProps}
        allEntries={[entityEntry, entityEntryInSubdir]}
        entityRoot={null}
      />,
    );
    expect(screen.getByTitle("models/order.json")).toBeInTheDocument();
    expect(screen.getByTitle("entities/customer.json")).toBeInTheDocument();
  });
});
