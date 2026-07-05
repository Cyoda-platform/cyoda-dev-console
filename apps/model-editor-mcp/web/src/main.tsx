import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@cyoda/console-design-system";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
