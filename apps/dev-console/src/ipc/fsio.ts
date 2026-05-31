import { invoke } from "@tauri-apps/api/core";
import type { ReadResult, WriteResult } from "./types.js";

export function readTextFile(
  path: string,
  activeRoot?: string,
): Promise<ReadResult> {
  return invoke<ReadResult>("read_text_file", {
    path,
    activeRoot: activeRoot ?? null,
  });
}

export function writeTextFileWithConfirmedOverwrite(
  path: string,
  contents: string,
  activeRoot?: string,
): Promise<WriteResult> {
  return invoke<WriteResult>("write_text_file_with_confirmed_overwrite", {
    path,
    contents,
    activeRoot: activeRoot ?? null,
  });
}

export function saveFileAs(contents: string): Promise<WriteResult | null> {
  return invoke<WriteResult | null>("save_file_as", { contents });
}
