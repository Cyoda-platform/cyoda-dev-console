/** Narrow, convention-following defaults — never `**\/*.json` (design: "no
 *  auto-scan"). `--workflow-globs`/`--entity-globs` override these. */
export const DEFAULT_WORKFLOW_GLOBS: string[] = ["models/workflow/**/*.json"];
export const DEFAULT_ENTITY_GLOBS: string[] = ["models/schema/**/*.json"];

/** Parse a comma-separated `--workflow-globs`/`--entity-globs` CLI value into a
 *  glob array, falling back to `fallback` when the flag is omitted entirely. An
 *  explicitly empty string (`--entity-globs ""`) yields `[]` — a deliberate
 *  opt-out of that discovery kind, not "use the default". */
export function parseGlobsArg(raw: string | undefined, fallback: string[]): string[] {
  if (raw === undefined) return fallback;
  return raw.split(",").map((g) => g.trim()).filter(Boolean);
}
