import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

// Patch HOME before importing persistence so configDir() returns a temp path.
let tmpHome: string;
let origHome: string;

beforeEach(async () => {
  vi.resetModules();
  tmpHome = await mkdtemp(join(tmpdir(), "cyoda-test-"));
  origHome = process.env["HOME"] ?? homedir();
  process.env["HOME"] = tmpHome;
});

afterEach(async () => {
  process.env["HOME"] = origHome;
  await rm(tmpHome, { recursive: true, force: true });
});

it("round-trips a config through save + load", async () => {
  // Dynamic import after HOME is patched so configDir() uses tmpHome.
  const { saveConfig, loadConfig } = await import("../persistence.js");
  const { DEFAULT_APP_CONFIG } = await import("../schema.js");
  await saveConfig(DEFAULT_APP_CONFIG);
  const loaded = await loadConfig();
  expect(loaded).toEqual(DEFAULT_APP_CONFIG);
});

it("returns DEFAULT_APP_CONFIG when no file exists", async () => {
  const { loadConfig } = await import("../persistence.js");
  const { DEFAULT_APP_CONFIG } = await import("../schema.js");
  const result = await loadConfig();
  expect(result).toEqual(DEFAULT_APP_CONFIG);
});

it("creates config file with mode 0600", async () => {
  const { saveConfig } = await import("../persistence.js");
  const { DEFAULT_APP_CONFIG } = await import("../schema.js");
  const { configFile } = await import("../configPath.js");
  await saveConfig(DEFAULT_APP_CONFIG);
  const s = await stat(configFile());
  expect(s.mode & 0o777).toBe(0o600);
});

it("creates config directory with mode 0700", async () => {
  const { saveConfig } = await import("../persistence.js");
  const { DEFAULT_APP_CONFIG } = await import("../schema.js");
  const { configDir } = await import("../configPath.js");
  await saveConfig(DEFAULT_APP_CONFIG);
  const s = await stat(configDir());
  expect(s.mode & 0o777).toBe(0o700);
});
