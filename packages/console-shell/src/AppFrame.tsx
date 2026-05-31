import type { ReactNode } from "react";
import { ThemeProvider } from "@cyoda/console-design-system";
import { Header } from "./Header";
import { Sidebar, type NavItem } from "./Sidebar";

export type { NavItem };

export function AppFrame({
  title, navItems, headerRight, children,
}: { title: string; navItems: NavItem[]; headerRight?: ReactNode; children: ReactNode }) {
  return (
    <ThemeProvider>
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gridTemplateRows: "48px 1fr", height: "100vh" }}>
        <Header title={title} right={headerRight} />
        <Sidebar navItems={navItems} />
        <main style={{ overflow: "auto" }}>{children}</main>
      </div>
    </ThemeProvider>
  );
}
