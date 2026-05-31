import { z } from "zod";

export const DevProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  rootPath: z.string().min(1),
  workflowGlobs: z.array(z.string()).min(1).default(["**/*.json"]),
  entityGlobs: z.array(z.string()).default(["**/*.json"]),
  createdAt: z.string().datetime(),
  lastOpenedAt: z.string().datetime(),
});
export type DevProject = z.infer<typeof DevProjectSchema>;

export const AppConfigSchema = z.object({
  version: z.literal(1),
  activeProjectId: z.string().uuid().nullable(),
  recentProjects: z.array(DevProjectSchema).max(10).default([]),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

const _defaultConfig = {
  version: 1 as const,
  activeProjectId: null,
  recentProjects: [] as AppConfig["recentProjects"],
} satisfies AppConfig;
Object.freeze(_defaultConfig.recentProjects);
Object.freeze(_defaultConfig);
export const DEFAULT_APP_CONFIG: AppConfig = _defaultConfig;
