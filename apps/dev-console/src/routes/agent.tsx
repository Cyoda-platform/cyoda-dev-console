import { EmptyState } from "@cyoda/console-design-system";

const ENABLED = import.meta.env.VITE_FEATURE_FLAG_AGENT === "true";

export function AgentRoute() {
  if (!ENABLED) return <NotFound />;
  return (
    <EmptyState
      title="Agent integration not implemented in this build"
      description="The BYO AI integration ships in a follow-up release. This placeholder exists so the route, sidebar entry, and project context provider can be exercised against a fixed contract."
    />
  );
}

function NotFound() {
  return <EmptyState title="404" description="No route at /agent in this build." />;
}
