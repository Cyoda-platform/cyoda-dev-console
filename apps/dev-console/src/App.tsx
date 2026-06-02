import { useState, useEffect } from "react";
import { QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppFrame } from "@cyoda/console-shell";
import { EmptyState } from "@cyoda/console-design-system";
import { queryClient } from "./state/queryClient.js";
import { useProjectStore } from "./state/projectStore.js";
import { FirstRun } from "./routes/first-run.js";
import { WorkflowRoute } from "./routes/workflow.js";
import { EntityRoute } from "./routes/entity.js";
import { AgentRoute } from "./routes/agent.js";
import { SettingsRoute } from "./routes/settings.js";
import { AgentContextProvider } from "./agent/AgentContext.js";
import { readTextFile } from "./ipc/fsio.js";
import { loadAppConfig } from "./ipc/config.js";
import { scanProject } from "./ipc/project.js";
import { watchProject, onFileChanged } from "./ipc/watcher.js";
import { classifyWorkflowFile, type WorkflowFileIndexEntry, type WorkflowFileStatus } from "@cyoda/workflow-file-indexer";
import { HeaderContext } from "./components/HeaderContext.js";
import { ProjectExplorer } from "./components/ProjectExplorer.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { deriveDisplayName } from "./utils/displayName.js";

const AGENT_FLAG = import.meta.env.VITE_FEATURE_FLAG_AGENT === "true";

const WORKFLOW_STATUSES: WorkflowFileStatus[] = [
  "valid-workflow", "invalid-workflow", "export-payload", "probable-workflow", "parse-error",
];

type ViewKind = "workflow" | "entity" | "settings" | "agent";

interface OpenedFile {
  path: string;
  contents: string;
  kind: "workflow" | "entity";
  relativePath: string;
  displayName: string;
}

function DevConsoleApp() {
  const active = useProjectStore((s) => s.active);
  const setActive = useProjectStore((s) => s.setActive);
  const setConfig = useProjectStore((s) => s.setConfig);
  const [projectReady, setProjectReady] = useState(false);
  const [openedFile, setOpenedFile] = useState<OpenedFile | null>(null);
  const [viewKind, setViewKind] = useState<ViewKind | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    void loadAppConfig().then((cfg) => {
      setConfig(cfg);
      const found = cfg.recentProjects.find((p) => p.id === cfg.activeProjectId);
      if (found) {
        setActive(found);
        setProjectReady(true);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scan project files
  const scan = useQuery({
    queryKey: ["scan", active?.rootPath],
    queryFn: async () => {
      const result = await scanProject(active!.rootPath);
      return result.files.map((f) =>
        classifyWorkflowFile({
          path: f.path,
          relativePath: f.relativePath,
          contents: f.contents,
          lastModified: f.lastModified,
          sizeBytes: f.sizeBytes,
        }),
      );
    },
    enabled: !!active && projectReady,
  });

  // File watcher — invalidate scan on external changes
  useEffect(() => {
    if (!active?.rootPath) return;
    let aborted = false;
    let cleanup: (() => void) | null = null;
    void watchProject(active.rootPath)
      .then(() => {
        if (aborted) return;
        return onFileChanged(() => {
          void qc.invalidateQueries({ queryKey: ["scan", active.rootPath] });
        });
      })
      .then((unlisten) => {
        if (unlisten) cleanup = unlisten;
      });
    return () => {
      aborted = true;
      cleanup?.();
    };
  }, [active?.rootPath, qc]);

  const handleOpenEntry = async (entry: WorkflowFileIndexEntry) => {
    const result = await readTextFile(entry.path);
    const kind: "workflow" | "entity" = WORKFLOW_STATUSES.includes(entry.status)
      ? "workflow"
      : "entity";

    let contents = result.contents;
    if (entry.status === "probable-workflow" || entry.status === "export-payload") {
      try {
        const parsed = JSON.parse(contents) as Record<string, unknown>;
        if (!("importMode" in parsed)) {
          if ("workflows" in parsed) {
            // Bare { workflows: [...] } or export-payload — promote to import payload
            contents = JSON.stringify({ importMode: "MERGE", ...parsed }, null, 2);
          } else {
            // Standalone workflow object (bloc-portal format) — wrap into workflows array
            contents = JSON.stringify({ importMode: "MERGE", workflows: [parsed] }, null, 2);
          }
        }
      } catch {
        // leave as-is; editor will show the parse error
      }
    }

    setOpenedFile({
      path: result.path,
      contents,
      kind,
      relativePath: entry.relativePath,
      displayName: deriveDisplayName(entry),
    });
    setViewKind(kind);
    setEditorDirty(false);
  };

  const allEntries = scan.data ?? [];
  const workflowPath = openedFile?.kind === "workflow" ? openedFile.path : undefined;
  const entityPath = openedFile?.kind === "entity" ? openedFile.path : undefined;

  const headerRight =
    active != null && projectReady ? (
      <HeaderContext projectName={active.name} dirty={editorDirty} />
    ) : undefined;

  return (
    <AppFrame title="Cyoda Dev Console" headerRight={headerRight}>
      <AgentContextProvider
        {...(workflowPath !== undefined ? { selectedWorkflowPath: workflowPath } : {})}
        {...(entityPath !== undefined ? { selectedEntityPath: entityPath } : {})}
      >
        {!active || !projectReady ? (
          <FirstRun onProjectReady={() => setProjectReady(true)} />
        ) : (
          <>
            <ProjectExplorer
              allEntries={allEntries}
              selectedPath={openedFile?.path ?? null}
              onOpen={(entry) => void handleOpenEntry(entry)}
              collapsed={explorerCollapsed}
              onToggleCollapse={() => setExplorerCollapsed((c) => !c)}
              onRescan={() => void qc.invalidateQueries({ queryKey: ["scan", active.rootPath] })}
              onOpenSettings={() => {
                setOpenedFile(null);
                setViewKind("settings");
              }}
              projectRoot={active.rootPath}
              workflowRoot={active.workflowRoot}
              entityRoot={active.entityRoot}
            />

            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <ErrorBoundary onReset={() => { setOpenedFile(null); setViewKind(null); }}>
                {viewKind === "settings" ? (
                  <SettingsRoute />
                ) : viewKind === "agent" && AGENT_FLAG ? (
                  <AgentRoute />
                ) : openedFile?.kind === "workflow" ? (
                  <WorkflowRoute
                    key={openedFile.path}
                    filePath={openedFile.path}
                    relativePath={openedFile.relativePath}
                    displayName={openedFile.displayName}
                    initialContents={openedFile.contents}
                    onDirtyChange={setEditorDirty}
                  />
                ) : openedFile?.kind === "entity" ? (
                  <EntityRoute
                    key={openedFile.path}
                    filePath={openedFile.path}
                    relativePath={openedFile.relativePath}
                    displayName={openedFile.displayName}
                  />
                ) : (
                  <EmptyState
                    title="Select a file"
                    description="Choose a workflow or entity from the explorer on the left."
                  />
                )}
              </ErrorBoundary>
            </div>

            {AGENT_FLAG && (
              <button
                onClick={() => setViewKind("agent")}
                style={{ display: "none" }}
                aria-hidden
              />
            )}
          </>
        )}
      </AgentContextProvider>
    </AppFrame>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DevConsoleApp />
    </QueryClientProvider>
  );
}
