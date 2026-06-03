import { useState } from "react";
import { EmptyState, Tabs, useTokens, type TabItem } from "@cyoda/console-design-system";
import { ConnectTab } from "../agent/ConnectTab.js";
import { BundleTab } from "../agent/BundleTab.js";
import { ProfilesTab } from "../agent/ProfilesTab.js";
import { AssistantTab } from "../agent/AssistantTab.js";

const ENABLED = import.meta.env.VITE_FEATURE_FLAG_AGENT === "true";

const ADVANCED_TABS: TabItem[] = [
  { id: "connect", label: "Connect" },
  { id: "bundle", label: "Bundle" },
  { id: "profiles", label: "Profiles" },
];

export function AgentRoute() {
  if (!ENABLED) return <NotFound />;
  return <AgentPanel />;
}

/** Exported for tests: the AI area, independent of the feature-flag guard. */
export function AgentPanel() {
  const t = useTokens();
  const [advancedTab, setAdvancedTab] = useState<string>("connect");

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <div style={{ padding: `${t.space.md} ${t.space.lg} 0` }}>
        <h2 style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.xl, margin: 0 }}>AI Assistant</h2>
      </div>

      <AssistantTab />

      <details style={{ borderTop: `1px solid ${t.color.border}`, margin: `${t.space.md} 0 0` }}>
        <summary
          style={{
            cursor: "pointer",
            padding: `${t.space.sm} ${t.space.lg}`,
            fontFamily: t.font.sans,
            fontSize: t.font.sizes.md,
            fontWeight: 600,
            color: t.color.textMuted,
          }}
        >
          Advanced: external agents
        </summary>
        <div style={{ padding: `0 ${t.space.lg} ${t.space.lg}` }}>
          <p style={{ fontFamily: t.font.sans, fontSize: t.font.sizes.sm, color: t.color.textMuted, maxWidth: 720 }}>
            These help you set up a separate command-line AI agent — Claude Code, Gemini CLI, or
            Codex — that runs <em>outside</em> this app. They do not affect the in-app Assistant
            above. Most users can ignore this section.
          </p>
          <Tabs tabs={ADVANCED_TABS} activeId={advancedTab} onChange={setAdvancedTab} />
          <div style={{ marginTop: t.space.sm }}>
            {advancedTab === "connect" && <ConnectTab />}
            {advancedTab === "bundle" && <BundleTab />}
            {advancedTab === "profiles" && <ProfilesTab />}
          </div>
        </div>
      </details>
    </div>
  );
}

function NotFound() {
  return <EmptyState title="404" description="No route at /agent in this build." />;
}
