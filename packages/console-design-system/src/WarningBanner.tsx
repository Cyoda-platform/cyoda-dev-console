import type { ReactNode } from "react";
import { useTokens } from "./ThemeProvider";

type Severity = "warning" | "caution" | "success";

export function WarningBanner({
  severity = "warning",
  children,
}: {
  severity?: Severity;
  children: ReactNode;
}) {
  const t = useTokens();

  const styles: Record<Severity, { bg: string; fg: string }> = {
    warning: { bg: t.color.warning, fg: t.color.text },
    caution: { bg: t.color.danger,  fg: "#FFFFFF"    },
    success: { bg: t.color.teal,    fg: "#FFFFFF"    },
  };

  const { bg, fg } = styles[severity];

  return (
    <div
      role="alert"
      style={{
        background: bg,
        color: fg,
        padding: `${t.space.sm} ${t.space.md}`,
        borderRadius: t.radius.sm,
        fontFamily: t.font.sans,
        fontSize: t.font.sizes.sm,
      }}
    >
      {children}
    </div>
  );
}
