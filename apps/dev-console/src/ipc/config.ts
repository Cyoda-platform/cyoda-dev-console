import { invoke } from "@tauri-apps/api/core";
import { AppConfigSchema, DEFAULT_APP_CONFIG } from "@cyoda/workflow-project-model";
import type { AppConfig } from "@cyoda/workflow-project-model";

export async function loadAppConfig(): Promise<AppConfig> {
  const raw = await invoke<unknown>("load_app_config");
  const result = AppConfigSchema.safeParse(raw);
  return result.success ? result.data : DEFAULT_APP_CONFIG;
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  await invoke<void>("save_app_config", { config });
}
