import { Button, WarningBanner } from "@cyoda/console-design-system";

export function ExternalChangeBanner({
  onReload,
  onIgnore,
  onCompare,
  dirty,
}: {
  onReload: () => void;
  onIgnore: () => void;
  onCompare?: () => void;
  dirty: boolean;
}) {
  return (
    <WarningBanner severity="warning">
      This file changed on disk outside the Dev Console.{" "}
      {dirty ? "Reloading will discard your unsaved edits." : null}
      <Button variant="secondary" onClick={onIgnore} style={{ marginLeft: 12 }}>
        Keep editing
      </Button>
      {onCompare != null && (
        <Button variant="secondary" onClick={onCompare} style={{ marginLeft: 8 }}>
          Compare
        </Button>
      )}
      <Button variant="primary" onClick={onReload} style={{ marginLeft: 8 }}>
        Reload from disk
      </Button>
    </WarningBanner>
  );
}
