import { useMemo } from "react";
import { WarningBanner } from "@cyoda/console-design-system";
import { JsonTree } from "./JsonTree.js";

export function EntityViewer({ contents }: { contents: string }) {
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(contents) as unknown };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [contents]);
  if (!parsed.ok)
    return (
      <WarningBanner severity="caution">
        Invalid JSON: {parsed.error}
      </WarningBanner>
    );
  return <JsonTree value={parsed.value as never} />;
}
