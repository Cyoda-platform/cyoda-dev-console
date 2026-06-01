import type { ReactNode } from "react";
import { ThemeProvider } from "@cyoda/console-design-system";
import { Header } from "./Header";

export function AppFrame({
  title,
  headerRight,
  children,
}: {
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ThemeProvider>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <Header title={title} right={headerRight} />
        <main style={{ flex: 1, overflow: "hidden", display: "flex" }}>{children}</main>
      </div>
    </ThemeProvider>
  );
}
