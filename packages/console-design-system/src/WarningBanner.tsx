import type { ReactNode } from "react";
import { useTokens } from "./ThemeProvider";

type Severity = "info" | "warning" | "caution" | "success";

export function WarningBanner({
  severity = "warning",
  onDismiss,
  children,
}: {
  severity?: Severity;
  onDismiss?: () => void;
  children: ReactNode;
}) {
  const t = useTokens();

  const styles: Record<Severity, { bg: string; fg: string }> = {
    info:    { bg: t.color.blueSoft, fg: t.color.text },
    warning: { bg: t.color.warning,  fg: t.color.text },
    caution: { bg: t.color.danger,   fg: "#FFFFFF"    },
    success: { bg: t.color.teal,     fg: "#FFFFFF"    },
  };

  const { bg, fg } = styles[severity];

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: t.space.sm,
        background: bg,
        color: fg,
        padding: `${t.space.sm} ${t.space.md}`,
        borderRadius: t.radius.sm,
        fontFamily: t.font.sans,
        fontSize: t.font.sizes.sm,
      }}
    >
      <div style={{ flex: 1 }}>{children}</div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: fg,
            fontSize: t.font.sizes.lg,
            lineHeight: 1,
            padding: 0,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
