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
          background: t.color.blue,
          color: "#fff",
          padding: "4px 8px",
          borderRadius: 6,
          fontWeight: 500,
          fontFamily: t.font.sans,
          fontSize: t.font.sizes.md,
          border: "none",
          cursor: onProjectClick ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <FolderOpen size={14} color="#fff" />
        <span>{projectName}</span>
      </button>
      {dirty && (
        <span style={{ color: t.color.cyodaOrange }} title="Unsaved changes">
          ●
        </span>
      )}
    </div>
  );
}
