import { useTokens } from "@cyoda/console-design-system";

export function HeaderContext({
  projectName,
  dirty,
}: {
  projectName: string;
  dirty: boolean;
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
      <span
        style={{
          background: t.color.cyodaGreen,
          color: "#FFFFFF",
          padding: "1px 8px",
          borderRadius: 2,
          fontWeight: 600,
        }}
      >
        {projectName}
      </span>
      {dirty && (
        <span style={{ color: t.color.cyodaOrange }} title="Unsaved changes">
          ●
        </span>
      )}
    </div>
  );
}
