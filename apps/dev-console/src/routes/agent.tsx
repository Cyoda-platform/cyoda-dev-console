import { useState } from "react";
import { EmptyState, Tabs, useTokens, type TabItem } from "@cyoda/console-design-system";
import { ConnectTab } from "../agent/ConnectTab.js";
import { BundleTab } from "../agent/BundleTab.js";
import { ProfilesTab } from "../agent/ProfilesTab.js";
import { AssistantTab } from "../agent/AssistantTab.js";

const ENABLED = import.meta.env.VITE_FEATURE_FLAG_AGENT === "true";
const ASSISTANT_ENABLED = import.meta.env.VITE_FEATURE_FLAG_CHATBOT === "true";

const TABS: TabItem[] = [
  { id: "connect", label: "Connect" },
  { id: "bundle", label: "Bundle" },
  { id: "profiles", label: "Profiles" },
  ...(ASSISTANT_ENABLED ? [{ id: "assistant", label: "Assistant" }] : []),
];

export function AgentRoute() {
  if (!ENABLED) return <NotFound />;
  return <AgentPanel />;
}

/** Exported for tests: the tabbed agent surface, independent of the feature-flag guard. */
export function AgentPanel() {
  const t = useTokens();
  const [active, setActive] = useState<string>("connect");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: `${t.space.md} ${t.space.lg} 0`, flexShrink: 0 }}>
        <h2 style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.xl, margin: `0 0 ${t.space.sm}` }}>
          AI Agent
        </h2>
        <Tabs tabs={TABS} activeId={active} onChange={setActive} />
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {active === "connect" && <ConnectTab />}
        {active === "bundle" && <BundleTab />}
        {active === "profiles" && <ProfilesTab />}
        {active === "assistant" && ASSISTANT_ENABLED && <AssistantTab />}
      </div>
    </div>
  );
}

function NotFound() {
  return <EmptyState title="404" description="No route at /agent in this build." />;
}
