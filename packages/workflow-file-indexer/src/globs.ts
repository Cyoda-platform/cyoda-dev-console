export const DEFAULT_WORKFLOW_GLOBS = ["**/*.json"] as const;
export const ALWAYS_EXCLUDE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/target/**",
  "**/.turbo/**",
  "**/.next/**",
  "**/coverage/**",
] as const;
