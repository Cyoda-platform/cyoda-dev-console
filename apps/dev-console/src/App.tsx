import { useState, useEffect } from "react";
import { QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppFrame } from "@cyoda/console-shell";
import { EmptyState, Button } from "@cyoda/console-design-system";
import { queryClient } from "./state/queryClient.js";
import { useProjectStore } from "./state/projectStore.js";
import { FirstRun } from "./routes/first-run.js";
import { WorkflowRoute } from "./routes/workflow.js";
import { EntityRoute } from "./routes/entity.js";
import { AgentRoute } from "./routes/agent.js";
import { SettingsRoute } from "./routes/settings.js";
import { AgentContextProvider } from "./agent/AgentContext.js";
import { readTextFile, writeTextFileWithConfirmedOverwrite, deleteFile } from "./ipc/fsio.js";
import { loadAppConfig } from "./ipc/config.js";
import { scanProject } from "./ipc/project.js";
import { useProjectWatcher } from "./hooks/useProjectWatcher.js";
import { classifyWorkflowFile, WORKFLOW_STATUSES, type WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";
import { synthesizeImportPayload } from "@cyoda/workflow-editor-host";
import { getDialect, LATEST_CYODA_VERSION } from "@cyoda/workflow-core";
import { HeaderContext } from "./components/HeaderContext.js";
import { ProjectExplorer } from "./components/ProjectExplorer.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { deriveDisplayName } from "./utils/displayName.js";

const AGENT_FLAG = import.meta.env.VITE_FEATURE_FLAG_AGENT === "true";


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

  // File watcher — invalidate scan on external changes (teardown-safe)
  useProjectWatcher(active?.rootPath, qc);

  const handleOpenEntry = async (entry: WorkflowFileIndexEntry) => {
    const result = await readTextFile(entry.path);
    const kind: "workflow" | "entity" = WORKFLOW_STATUSES.includes(entry.status)
      ? "workflow"
      : "entity";

    let contents = result.contents;
    if (entry.status === "probable-workflow" || entry.status === "export-payload") {
      contents = synthesizeImportPayload(contents);
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

  const handleNewWorkflow = async (filename: string) => {
    if (!active) return;
    const wfRoot = (active.workflowRoot ?? "").replace(/\/$/, "");
    const path = [active.rootPath, wfRoot, filename].filter(Boolean).join("/");
    const baseName = filename.replace(/\.json$/, "");
    const template = JSON.stringify({
      importMode: "REPLACE",
      workflows: [{
        name: baseName,
        // Sourced from the dialect, not hardcoded: cyoda-go validates this tag
        // strictly and rejects anything below its minimum, so a literal here
        // silently rots the moment the schema minor moves.
        version: getDialect(LATEST_CYODA_VERSION).schemaVersionTag,
        initialState: "CREATED",
        active: true,
        states: { CREATED: { transitions: [] } },
      }],
    }, null, 2);
    const result = await writeTextFileWithConfirmedOverwrite(path, template);
    void qc.invalidateQueries({ queryKey: ["scan", active.rootPath] });
    const relativePath = [wfRoot, filename].filter(Boolean).join("/");
    setOpenedFile({ path: result.path, contents: template, kind: "workflow", relativePath, displayName: baseName });
    setViewKind("workflow");
    setEditorDirty(false);
  };

  const handleNewEntity = async (filename: string) => {
    if (!active) return;
    const enRoot = (active.entityRoot ?? "").replace(/\/$/, "");
    const path = [active.rootPath, enRoot, filename].filter(Boolean).join("/");
    const baseName = filename.replace(/\.json$/, "");
    const template = JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: baseName,
      type: "object",
      properties: {},
    }, null, 2);
    const result = await writeTextFileWithConfirmedOverwrite(path, template);
    void qc.invalidateQueries({ queryKey: ["scan", active.rootPath] });
    const relativePath = [enRoot, filename].filter(Boolean).join("/");
    setOpenedFile({ path: result.path, contents: template, kind: "entity", relativePath, displayName: baseName });
    setViewKind("entity");
    setEditorDirty(false);
  };

  const handleDeleteFile = async (path: string, displayName: string) => {
    if (!active) return;
    if (!window.confirm(`Delete "${displayName}"?\nThis cannot be undone.`)) return;
    await deleteFile(path, active.rootPath);
    if (openedFile?.path === path) {
      setOpenedFile(null);
      setViewKind(null);
    }
    void qc.invalidateQueries({ queryKey: ["scan", active.rootPath] });
  };

  const allEntries = scan.data ?? [];
  const firstEntry =
    allEntries.find((e) => e.status === "valid-workflow" || e.status === "export-payload" || e.status === "probable-workflow") ??
    allEntries.find((e) => e.status === "invalid-workflow" || e.status === "json-not-workflow") ??
    null;
  const workflowPath = openedFile?.kind === "workflow" ? openedFile.path : undefined;
  const entityPath = openedFile?.kind === "entity" ? openedFile.path : undefined;

  const headerRight =
    active != null && projectReady ? (
      <HeaderContext
        projectName={active.name}
        dirty={editorDirty}
        onProjectClick={() => { setOpenedFile(null); setViewKind("settings"); }}
      />
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
              {...(AGENT_FLAG
                ? {
                    // Keep openedFile so the agent surface (Bundle/Assistant) still sees the
                    // selected workflow/entity via AgentContext.
                    onOpenAgent: () => setViewKind("agent"),
                  }
                : {})}
              projectRoot={active.rootPath}
              workflowRoot={active.workflowRoot}
              entityRoot={active.entityRoot}
              onNewWorkflow={(name) => void handleNewWorkflow(name)}
              onNewEntity={(name) => void handleNewEntity(name)}
              onDeleteFile={(path, displayName) => void handleDeleteFile(path, displayName)}
            />

            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <ErrorBoundary key={openedFile?.path ?? viewKind ?? "empty"} onReset={() => { setOpenedFile(null); setViewKind(null); }}>
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
                    action={firstEntry != null ? (
                      <Button variant="secondary" onClick={() => void handleOpenEntry(firstEntry)}>
                        Open first file
                      </Button>
                    ) : undefined}
                  />
                )}
              </ErrorBoundary>
            </div>
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
