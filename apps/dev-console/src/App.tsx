import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppFrame } from "@cyoda/console-shell";
import type { NavItem } from "@cyoda/console-shell";
import { queryClient } from "./state/queryClient.js";
import { useProjectStore } from "./state/projectStore.js";
import { FirstRun } from "./routes/first-run.js";
import { ProjectRoute } from "./routes/project.js";
import { WorkflowRoute } from "./routes/workflow.js";
import { EntityRoute } from "./routes/entity.js";
import { AgentRoute } from "./routes/agent.js";
import { AgentContextProvider } from "./agent/AgentContext.js";
import { readTextFile } from "./ipc/fsio.js";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";

const AGENT_FLAG = import.meta.env.VITE_FEATURE_FLAG_AGENT === "true";

type RouteKind = "workflow" | "entity";
type ActiveSection = "workflows" | "entities" | "project" | "agent";

interface OpenedFile {
  path: string;
  contents: string;
  kind: RouteKind;
}

export function App() {
  const active = useProjectStore((s) => s.active);
  const [projectReady, setProjectReady] = useState(false);
  const [openedFile, setOpenedFile] = useState<OpenedFile | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<ActiveSection>("workflows");
  const [editorDirty, setEditorDirty] = useState(false);
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  const handleOpenEntry = async (entry: WorkflowFileIndexEntry) => {
    const result = await readTextFile(entry.path);
    const kind: RouteKind =
      entry.status === "valid-workflow" || entry.status === "invalid-workflow"
        ? "workflow"
        : "entity";
    setOpenedFile({ path: result.path, contents: result.contents, kind });
    setAgentOpen(false);
  };

  const handleClose = () => setOpenedFile(null);

  const navItems: NavItem[] = [
    {
      id: "workflows",
      label: "Workflows",
      onSelect: () => { setActiveSection("workflows"); setOpenedFile(null); setAgentOpen(false); },
      active: activeSection === "workflows",
    },
    {
      id: "entities",
      label: "Entities",
      onSelect: () => { setActiveSection("entities"); setOpenedFile(null); setAgentOpen(false); },
      active: activeSection === "entities",
    },
    {
      id: "project",
      label: "Project",
      onSelect: () => { setActiveSection("project"); setOpenedFile(null); setAgentOpen(false); },
      active: activeSection === "project",
    },
    ...(AGENT_FLAG
      ? [{ id: "agent", label: "AI Agent", onSelect: () => { setActiveSection("agent"); setAgentOpen(true); setOpenedFile(null); }, active: activeSection === "agent" }]
      : []),
  ];

  const workflowPath = openedFile?.kind === "workflow" ? openedFile.path : undefined;
  const entityPath = openedFile?.kind === "entity" ? openedFile.path : undefined;

  return (
    <QueryClientProvider client={queryClient}>
      <AgentContextProvider
        {...(workflowPath !== undefined ? { selectedWorkflowPath: workflowPath } : {})}
        {...(entityPath !== undefined ? { selectedEntityPath: entityPath } : {})}
      >
        <AppFrame title="Cyoda Dev Console" navItems={navItems}>
          {!active || !projectReady ? (
            <FirstRun onProjectReady={() => setProjectReady(true)} />
          ) : agentOpen ? (
            <AgentRoute />
          ) : openedFile?.kind === "workflow" ? (
            <WorkflowRoute
              filePath={openedFile.path}
              initialContents={openedFile.contents}
              onClose={handleClose}
            />
          ) : openedFile?.kind === "entity" ? (
            <EntityRoute
              filePath={openedFile.path}
              onClose={handleClose}
            />
          ) : (
            <ProjectRoute onOpen={(entry) => void handleOpenEntry(entry)} />
          )}
        </AppFrame>
      </AgentContextProvider>
    </QueryClientProvider>
  );
}
