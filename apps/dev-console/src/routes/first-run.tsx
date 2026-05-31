import { useState } from "react";
import { Button, EmptyState } from "@cyoda/console-design-system";
import { selectProjectRoot } from "../ipc/project.js";
import { v4 as uuid } from "uuid";
import { useProjectStore } from "../state/projectStore.js";

export function FirstRun({ onProjectReady }: { onProjectReady: () => void }) {
  const [busy, setBusy] = useState(false);
  const setActive = useProjectStore((s) => s.setActive);

  return (
    <EmptyState
      title="Choose your Cyoda project"
      description="Select the root folder that contains your Cyoda workflows, entity models, or generated application files."
      action={
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const path = await selectProjectRoot();
              if (!path) return;
              const now = new Date().toISOString();
              setActive({
                id: uuid(),
                name: path.split("/").pop() ?? path,
                rootPath: path,
                workflowGlobs: ["**/*.json"],
                entityGlobs: ["**/*.json"],
                createdAt: now,
                lastOpenedAt: now,
              });
              onProjectReady();
            } finally {
              setBusy(false);
            }
          }}
        >
          Select folder
        </Button>
      }
    />
  );
}
