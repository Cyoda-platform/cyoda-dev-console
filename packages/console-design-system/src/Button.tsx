import type { ButtonHTMLAttributes } from "react";
import { useTokens } from "./ThemeProvider";

type Variant = "primary" | "secondary" | "danger";

export function Button({
  variant = "primary",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const t = useTokens();

  const styles: Record<Variant, React.CSSProperties> = {
    primary: {
      background: t.color.blue,
      color: "#FFFFFF",
      border: "none",
    },
    secondary: {
      background: t.color.surface,
      color: t.color.textSecondary,
      border: `1px solid ${t.color.border}`,
    },
    danger: {
      background: t.color.danger,
      color: "#FFFFFF",
      border: "none",
    },
  };

  return (
    <button
      {...rest}
      style={{
        ...styles[variant],
        padding: `${t.space.sm} ${t.space.md}`,
        borderRadius: t.radius.md,
        fontFamily: t.font.sans,
        fontSize: t.font.sizes.md,
        fontWeight: t.font.weights.semibold,
        cursor: "pointer",
        ...(rest.style ?? {}),
      }}
    />
  );
}
