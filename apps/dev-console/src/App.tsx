import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppFrame } from "@cyoda/console-shell";
import { queryClient } from "./state/queryClient.js";
import { useProjectStore } from "./state/projectStore.js";
import { FirstRun } from "./routes/first-run.js";
import { ProjectRoute } from "./routes/project.js";
import { WorkflowRoute } from "./routes/workflow.js";
import { EntityRoute } from "./routes/entity.js";
import { readTextFile } from "./ipc/fsio.js";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";

type RouteKind = "workflow" | "entity";

interface OpenedFile {
  path: string;
  contents: string;
  kind: RouteKind;
}

export function App() {
  const active = useProjectStore((s) => s.active);
  const [projectReady, setProjectReady] = useState(false);
  const [openedFile, setOpenedFile] = useState<OpenedFile | null>(null);

  const handleOpenEntry = async (entry: WorkflowFileIndexEntry) => {
    const result = await readTextFile(entry.path);
    const kind: RouteKind =
      entry.status === "valid-workflow" || entry.status === "invalid-workflow"
        ? "workflow"
        : "entity";
    setOpenedFile({ path: result.path, contents: result.contents, kind });
  };

  const handleClose = () => setOpenedFile(null);

  return (
    <QueryClientProvider client={queryClient}>
      <AppFrame title="Cyoda Dev Console" navItems={[]}>
        {!active || !projectReady ? (
          <FirstRun onProjectReady={() => setProjectReady(true)} />
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
    </QueryClientProvider>
  );
}
