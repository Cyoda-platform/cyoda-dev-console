import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AgentContext } from "@cyoda/agent-bridge-contract";
import { useProjectStore } from "../state/projectStore.js";

const Ctx = createContext<AgentContext | null>(null);

export function AgentContextProvider({
  selectedWorkflowPath,
  selectedEntityPath,
  children,
}: {
  selectedWorkflowPath?: string;
  selectedEntityPath?: string;
  children: ReactNode;
}) {
  const root = useProjectStore((s) => s.active?.rootPath);
  const value = useMemo<AgentContext | null>(() => {
    if (!root) return null;
    return {
      projectRoot: root,
      ...(selectedWorkflowPath ? { selectedWorkflowPath } : {}),
      ...(selectedEntityPath ? { selectedEntityPath } : {}),
    };
  }, [root, selectedWorkflowPath, selectedEntityPath]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Hook for downstream future-agent components. Returns null until a project is open. */
export function useAgentContext(): AgentContext | null {
  return useContext(Ctx);
}
