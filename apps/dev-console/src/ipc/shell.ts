import { invoke } from "@tauri-apps/api/core";

export const revealInFinder = (path: string) =>
  invoke<void>("reveal_in_finder", { path });

export const openInIde = (
  path: string,
  ide: "zed" | "intellij" | "vscode",
) => invoke<void>("open_in_ide", { path, ide });
