import { useState } from "react";
import { Button, EmptyState, useTokens } from "@cyoda/console-design-system";
import { selectProjectRoot } from "../ipc/project.js";
import { v4 as uuid } from "uuid";
import { useProjectStore } from "../state/projectStore.js";
import { DEFAULT_CYODA_GO_VERSION, type CyodaGoVersion } from "@cyoda/workflow-project-model";
import { CyodaGoVersionSelect } from "../components/CyodaGoVersionSelect.js";

export function FirstRun({ onProjectReady }: { onProjectReady: () => void }) {
  const t = useTokens();
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState<CyodaGoVersion>(DEFAULT_CYODA_GO_VERSION);
  const setActive = useProjectStore((s) => s.setActive);

  return (
    <EmptyState
      title="Choose your Cyoda project"
      description="Select the root folder that contains your Cyoda workflows, entity models, or generated application files."
      action={
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: t.space.md }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
            <label style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.sm, fontWeight: 600, color: t.color.text }}>
              cyoda-go version
            </label>
            <CyodaGoVersionSelect value={version} onChange={setVersion} t={t} />
            <span style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.sm, color: t.color.textMuted, maxWidth: 360 }}>
              Select the cyoda-go version your project targets. This controls how workflow files are parsed and saved.
            </span>
          </div>
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
                  workflowRoot: null,
                  entityRoot: null,
                  cyodaGoVersion: version,
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
        </div>
      }
    />
  );
}
