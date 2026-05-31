import { mkdir, readFile, writeFile, chmod, rename } from "node:fs/promises";
import { join } from "node:path";
import { AppConfigSchema, DEFAULT_APP_CONFIG, type AppConfig } from "./schema.js";
import { configDir, configFile } from "./configPath.js";

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(configFile(), "utf8");
    return AppConfigSchema.parse(JSON.parse(raw));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_APP_CONFIG;
    throw e;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const dir = configDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const target = configFile();
  const tmp = join(dir, `.config.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, JSON.stringify(AppConfigSchema.parse(config), null, 2), { mode: 0o600 });
  await rename(tmp, target);
  await chmod(target, 0o600);
}
