import { useTokens } from "@cyoda/console-design-system";
import { FolderOpen } from "lucide-react";

export function HeaderContext({
  projectName,
  dirty,
  onProjectClick,
}: {
  projectName: string;
  dirty: boolean;
  onProjectClick?: () => void;
}) {
  const t = useTokens();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: t.space.sm,
        fontFamily: t.font.sans,
        fontSize: t.font.sizes.sm,
      }}
    >
      <button
        onClick={onProjectClick}
        title="Switch project"
        style={{
          background: "none",
          color: t.color.text,
          padding: "4px 8px",
          borderRadius: 6,
          fontWeight: 500,
          fontFamily: t.font.sans,
          fontSize: t.font.sizes.md,
          border: `1px solid ${t.color.border}`,
          cursor: onProjectClick ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <FolderOpen size={14} color={t.color.textMuted} />
        <span>{projectName}</span>
        {onProjectClick && <span style={{ color: t.color.textFaint, fontSize: 10 }}>▾</span>}
      </button>
      {dirty && (
        <span style={{ color: t.color.cyodaOrange }} title="Unsaved changes">
          ●
        </span>
      )}
    </div>
  );
}
