import { useTokens } from "@cyoda/console-design-system";

function truncatePath(path: string, maxLen = 40): string {
  if (path.length <= maxLen) return path;
  return "…" + path.slice(path.length - (maxLen - 1));
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

export function HeaderContext({
  projectName,
  rootPath,
  dirty,
  openFilePath,
}: {
  projectName: string;
  rootPath: string;
  dirty: boolean;
  openFilePath: string | null;
}) {
  const t = useTokens();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: t.space.md,
        fontFamily: t.font.sans,
        fontSize: t.font.sizes.sm,
        color: t.color.textMuted,
      }}
    >
      <strong style={{ color: t.color.text }}>{projectName}</strong>
      <span>{truncatePath(rootPath)}</span>
      {openFilePath != null && (
        <>
          <span style={{ color: t.color.border }}>›</span>
          <code style={{ fontFamily: t.font.mono, fontSize: t.font.sizes.sm }}>
            {basename(openFilePath)}
          </code>
        </>
      )}
      {dirty && (
        <span style={{ color: t.color.cyodaOrange }} title="Unsaved changes">
          ●
        </span>
      )}
    </div>
  );
}
