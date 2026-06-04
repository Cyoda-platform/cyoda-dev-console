import "reactflow/dist/style.css";
import { createRoot } from "react-dom/client";
import { App } from "./App";

window.onerror = (msg, src, line, col, err) => {
  console.error("[CRASH]", msg, src, line, col, err?.stack);
};
window.addEventListener("unhandledrejection", (e) => {
  console.error("[CRASH unhandledrejection]", e.reason, e.reason?.stack);
});

createRoot(document.getElementById("root")!).render(<App />);
