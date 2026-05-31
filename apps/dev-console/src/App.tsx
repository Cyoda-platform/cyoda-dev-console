import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppFrame } from "@cyoda/console-shell";
import { queryClient } from "./state/queryClient.js";
import { useProjectStore } from "./state/projectStore.js";
import { FirstRun } from "./routes/first-run.js";
import { ProjectRoute } from "./routes/project.js";
import { WorkflowRoute } from "./routes/workflow.js";
import { readTextFile } from "./ipc/fsio.js";
import type { WorkflowFileIndexEntry } from "@cyoda/workflow-file-indexer";

interface OpenedFile {
  path: string;
  contents: string;
}

export function App() {
  const active = useProjectStore((s) => s.active);
  const [projectReady, setProjectReady] = useState(false);
  const [openedFile, setOpenedFile] = useState<OpenedFile | null>(null);

  const handleOpenEntry = async (entry: WorkflowFileIndexEntry) => {
    const result = await readTextFile(entry.path);
    setOpenedFile({ path: result.path, contents: result.contents });
  };

  const handleCloseWorkflow = () => setOpenedFile(null);

  return (
    <QueryClientProvider client={queryClient}>
      <AppFrame title="Cyoda Dev Console" navItems={[]}>
        {!active || !projectReady ? (
          <FirstRun onProjectReady={() => setProjectReady(true)} />
        ) : openedFile ? (
          <WorkflowRoute
            filePath={openedFile.path}
            initialContents={openedFile.contents}
            onClose={handleCloseWorkflow}
          />
        ) : (
          <ProjectRoute onOpen={(entry) => void handleOpenEntry(entry)} />
        )}
      </AppFrame>
    </QueryClientProvider>
  );
}
