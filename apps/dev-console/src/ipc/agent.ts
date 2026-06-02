import { invoke } from "@tauri-apps/api/core";
import type { WriteResult } from "./types.js";

export interface AgentStatus {
  id: string;
  installed: boolean;
  version?: string;
}

/**
 * Read `$HOME/.config/cyoda/cyoda-plugin-config.json` (the canonical cyoda-skills profile
 * store). Returns `null` when the file does not exist. The raw JSON is validated/parsed on
 * the TS side via {@link parseProfileConfig}.
 */
export function readCyodaProfileConfig(): Promise<unknown | null> {
  return invoke<unknown | null>("read_cyoda_profile_config");
}

/** Detect installed agent CLIs (claude / gemini / codex). */
export function detectAgents(): Promise<AgentStatus[]> {
  return invoke<AgentStatus[]>("detect_agents");
}

/**
 * Write a generated text file at `relativePath` inside the active project root. Creates
 * intermediate directories; the Rust layer rejects any path that escapes the root.
 */
export function writeProjectTextFile(
  activeRoot: string,
  relativePath: string,
  contents: string,
): Promise<WriteResult> {
  return invoke<WriteResult>("write_project_text_file", {
    activeRoot,
    relativePath,
    contents,
  });
}
