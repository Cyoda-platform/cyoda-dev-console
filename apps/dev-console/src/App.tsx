import { AppFrame } from "@cyoda/console-shell";
import { EmptyState } from "@cyoda/console-design-system";
export function App() {
  return (
    <AppFrame title="Cyoda Dev Console" navItems={[]}>
      <EmptyState title="No project open" description="Phase 1 will add the first-run wizard." />
    </AppFrame>
  );
}
