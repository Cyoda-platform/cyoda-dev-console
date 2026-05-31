import type { ButtonHTMLAttributes } from "react";
import { useTokens } from "./ThemeProvider";

type Variant = "primary" | "secondary" | "danger";
export function Button({ variant = "primary", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const t = useTokens();
  const bg = variant === "primary" ? t.color.cyodaGreen : variant === "danger" ? t.color.danger : t.color.surfaceAlt;
  const fg = variant === "secondary" ? t.color.text : "#FFFFFF";
  return (
    <button
      {...rest}
      style={{
        background: bg, color: fg, border: "none", padding: `${t.space.sm} ${t.space.md}`,
        borderRadius: t.radius.sm, fontFamily: t.font.sans, fontSize: t.font.sizes.md, cursor: "pointer",
        ...(rest.style ?? {}),
      }}
    />
  );
}
