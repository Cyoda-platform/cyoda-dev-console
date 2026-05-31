import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppFrame } from "@cyoda/console-shell";
import { queryClient } from "./state/queryClient.js";
import { useProjectStore } from "./state/projectStore.js";
import { FirstRun } from "./routes/first-run.js";
import { ProjectRoute } from "./routes/project.js";

export function App() {
  const active = useProjectStore((s) => s.active);
  const [projectReady, setProjectReady] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <AppFrame title="Cyoda Dev Console" navItems={[]}>
        {!active || !projectReady ? (
          <FirstRun onProjectReady={() => setProjectReady(true)} />
        ) : (
          <ProjectRoute />
        )}
      </AppFrame>
    </QueryClientProvider>
  );
}
