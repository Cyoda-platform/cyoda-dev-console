import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { FileChangedEvent } from "./types.js";

export function watchProject(rootPath: string): Promise<void> {
  return invoke<void>("watch_project", { rootPath });
}

export function unwatchProject(rootPath: string): Promise<void> {
  return invoke<void>("unwatch_project", { rootPath });
}

export function onFileChanged(
  handler: (event: FileChangedEvent) => void,
): Promise<() => void> {
  return listen<FileChangedEvent>("project://file-changed", (e) =>
    handler(e.payload),
  );
}
