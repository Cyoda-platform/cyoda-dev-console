import { z } from "zod";

/** The cyoda-go schema versions the Dev Console can target per project. */
export const CYODA_GO_VERSIONS = ["0.7", "0.8"] as const;
export type CyodaGoVersion = (typeof CYODA_GO_VERSIONS)[number];

/** The version pre-selected for brand-new projects (latest). */
export const DEFAULT_CYODA_GO_VERSION: CyodaGoVersion = "0.8";

export const DevProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  rootPath: z.string().min(1),
  workflowGlobs: z.array(z.string()).min(1).default(["**/*.json"]),
  entityGlobs: z.array(z.string()).default(["**/*.json"]),
  workflowRoot: z.string().nullable().default(null),
  entityRoot: z.string().nullable().default(null),
  // Migration: projects persisted before per-project version selection lack this
  // field. Default to "0.7" on load (conservative — do not silently re-interpret an
  // existing project's files with the newer dialect). New projects are created with
  // DEFAULT_CYODA_GO_VERSION ("0.8") explicitly by the wizard / settings flow.
  cyodaGoVersion: z.enum(CYODA_GO_VERSIONS).default("0.7"),
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
