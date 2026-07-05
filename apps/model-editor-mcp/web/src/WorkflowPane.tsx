import { useState } from "react";
import type { WorkflowUiMeta } from "@cyoda/workflow-core";
import { Tabs } from "@cyoda/console-design-system";
import { EditorView } from "./EditorView.js";
import { MonacoJsonViewer } from "./MonacoJsonViewer.js";
import { ReadOnlyChip } from "./ReadOnlyChip.js";

export function WorkflowPane({
  token, origin, workflow, content, layout, layoutRev, contentRev, externalContent, onDismissExternal, onDirtyChange,
}: {
  token: string; origin: string; workflow: string; content: string;
  layout: Record<string, WorkflowUiMeta>; layoutRev: number; contentRev: number;
  externalContent: string | null; onDismissExternal: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const [tab, setTab] = useState<"graph" | "json">("graph");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Tabs tabs={[{ id: "graph", label: "Graph" }, { id: "json", label: "JSON" }]} activeId={tab} onChange={(id) => setTab(id as "graph" | "json")} />
        <ReadOnlyChip />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === "graph" ? (
          <EditorView
            key={`${workflow}:${contentRev}`}
            token={token} origin={origin} workflow={workflow} content={content} layout={layout}
            layoutRev={layoutRev} externalContent={externalContent} onDismissExternal={onDismissExternal} onDirtyChange={onDirtyChange}
          />
        ) : (
          <MonacoJsonViewer contents={externalContent ?? content} />
        )}
      </div>
    </div>
  );
}
