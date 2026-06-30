import type { ValidationIssue } from "@cyoda/workflow-core";

/**
 * cyoda-go emits `criterion: null` to mean "no condition / always matches", but
 * the editor core (@cyoda/workflow-core) accepts an *absent* criterion, not an
 * explicit `null` — so such workflows fail to parse. These helpers detect that
 * specific cause and offer the matching remediation (drop the null criteria,
 * which is semantically identical to omitting them).
 */

function valueAt(root: unknown, path: (string | number)[]): unknown {
  return path.reduce<unknown>(
    (node, key) => (node == null ? undefined : (node as Record<string | number, unknown>)[key]),
    root,
  );
}

/** Recursively delete every `criterion` property whose value is exactly `null`. */
function stripNullCriteria(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(stripNullCriteria);
    return;
  }
  if (node !== null && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if ("criterion" in obj && obj.criterion === null) {
      delete obj.criterion;
    }
    for (const value of Object.values(obj)) {
      stripNullCriteria(value);
    }
  }
}

/**
 * Return `rawContent` with every `criterion: null` removed. Returns the input
 * unchanged if it is not valid JSON.
 */
export function dropNullCriteria(rawContent: string): string {
  let root: unknown;
  try {
    root = JSON.parse(rawContent);
  } catch {
    return rawContent;
  }
  stripNullCriteria(root);
  return JSON.stringify(root, null, 2);
}

/**
 * Of the given parse `issues`, return the dotted paths of those caused by a
 * `criterion` that is explicitly `null` in `rawContent`. Empty when the parse
 * failure is not (or not only) due to null criteria.
 */
export function nullCriterionPaths(rawContent: string, issues: ValidationIssue[]): string[] {
  let root: unknown;
  try {
    root = JSON.parse(rawContent);
  } catch {
    return [];
  }
  const paths: string[] = [];
  for (const issue of issues) {
    if (issue.severity !== "error") continue;
    const path = issue.detail?.["path"];
    if (!Array.isArray(path) || path.length === 0) continue;
    if (path[path.length - 1] !== "criterion") continue;
    if (valueAt(root, path as (string | number)[]) === null) {
      paths.push(path.join("."));
    }
  }
  return paths;
}
