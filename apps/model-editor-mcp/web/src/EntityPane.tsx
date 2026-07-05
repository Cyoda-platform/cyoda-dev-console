import { useState } from "react";
import { Tabs } from "@cyoda/console-design-system";
import { EntityViewer } from "./EntityViewer.js";
import { MonacoJsonViewer } from "./MonacoJsonViewer.js";
import { ReadOnlyChip } from "./ReadOnlyChip.js";

export function EntityPane({ contents }: { contents: string }) {
  const [tab, setTab] = useState<"tree" | "json">("tree");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Tabs tabs={[{ id: "tree", label: "Tree" }, { id: "json", label: "JSON" }]} activeId={tab} onChange={(id) => setTab(id as "tree" | "json")} />
        <ReadOnlyChip />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {tab === "tree" ? (
          <div style={{ padding: 16, height: "100%", boxSizing: "border-box" }}>
            <EntityViewer contents={contents} />
          </div>
        ) : (
          <MonacoJsonViewer contents={contents} />
        )}
      </div>
    </div>
  );
}
