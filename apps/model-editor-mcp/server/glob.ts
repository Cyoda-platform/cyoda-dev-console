/**
 * Tiny glob matcher for TS-side glob filters (`entityGlobs` — D13: "entityGlobs
 * has no scan pathway", applied client-side over already-scanned files). No
 * glob-matching package is a dependency of `dev-console`; rather than pull one
 * in for a single predicate, this implements the two tokens the project
 * actually needs and nothing more:
 *
 * - `**` — any number of path segments, including zero. `**\/foo` matches
 *   both `foo` and `a/b/foo` (the `/` after `**` is optional).
 * - `*`  — any run of characters *within* a single path segment (never
 *   crosses a `/`).
 *
 * Everything else in the pattern is matched literally (regex metacharacters
 * are escaped).
 */
export function matchGlob(relativePath: string, pattern: string): boolean {
  return globToRegExp(pattern).test(relativePath);
}

/** Characters that are regex-special and must be escaped to be matched literally. */
const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/;

function globToRegExp(pattern: string): RegExp {
  let source = "";
  let i = 0;
  const n = pattern.length;
  while (i < n) {
    if (pattern.charAt(i) === "*" && pattern.charAt(i + 1) === "*") {
      if (pattern.charAt(i + 2) === "/") {
        source += "(?:.*/)?";
        i += 3;
      } else {
        source += ".*";
        i += 2;
      }
      continue;
    }
    const c = pattern.charAt(i);
    if (c === "*") {
      source += "[^/]*";
    } else if (REGEXP_SPECIALS.test(c)) {
      source += `\\${c}`;
    } else {
      source += c;
    }
    i += 1;
  }
  return new RegExp(`^${source}$`);
}
