import { invoke } from "@tauri-apps/api/core";
import type { ProjectScanResult } from "./types.js";

export function selectProjectRoot(): Promise<string | null> {
  return invoke<string | null>("select_project_root");
}

export function scanProject(rootPath: string): Promise<ProjectScanResult> {
  return invoke<ProjectScanResult>("scan_project", {
    rootPath,
    options: {},
  });
}
