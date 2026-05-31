import { homedir } from "node:os";
import { join } from "node:path";

export function configDir(): string {
  if (process.platform !== "darwin") throw new Error("Only macOS supported in MVP.");
  return join(homedir(), "Library", "Application Support", "Cyoda Dev Console");
}
export function configFile(): string {
  return join(configDir(), "config.json");
}
