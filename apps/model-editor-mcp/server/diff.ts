/**
 * A tiny recursive JSON differ producing RFC 6902-shaped ops (JSON-Pointer
 * `path`, `add`/`remove`/`replace` — no `move`/`copy`/`test`). Used by
 * `update_workflow` to surface a human-readable diff of what an agent's
 * write actually changed.
 *
 * Objects are compared key-by-key (order-independent). Arrays are compared
 * index-by-index — a reorder therefore surfaces as `replace` ops on the
 * shifted indices rather than a semantic "moved" op; that's an intentional
 * simplification (this is a diagnostic diff, not a patch to be replayed).
 */
export interface JsonPatchOp {
  op: "add" | "remove" | "replace";
  path: string;
  value?: unknown;
}

/** Diff `before` against `after`, returning ops that turn `before` into `after`. */
export function jsonDiff(before: unknown, after: unknown): JsonPatchOp[] {
  return diffAt("", before, after);
}

function diffAt(path: string, before: unknown, after: unknown): JsonPatchOp[] {
  if (deepEqual(before, after)) return [];

  if (isPlainObject(before) && isPlainObject(after)) {
    return diffObjects(path, before, after);
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    return diffArrays(path, before, after);
  }

  return [{ op: "replace", path, value: after }];
}

function diffObjects(
  path: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): JsonPatchOp[] {
  const ops: JsonPatchOp[] = [];
  for (const key of Object.keys(before)) {
    if (!(key in after)) {
      ops.push({ op: "remove", path: `${path}/${escapePointerToken(key)}` });
    }
  }
  for (const key of Object.keys(after)) {
    const childPath = `${path}/${escapePointerToken(key)}`;
    if (!(key in before)) {
      ops.push({ op: "add", path: childPath, value: after[key] });
    } else {
      ops.push(...diffAt(childPath, before[key], after[key]));
    }
  }
  return ops;
}

function diffArrays(path: string, before: unknown[], after: unknown[]): JsonPatchOp[] {
  const ops: JsonPatchOp[] = [];
  const max = Math.max(before.length, after.length);
  for (let i = 0; i < max; i++) {
    const childPath = `${path}/${i}`;
    if (i >= before.length) {
      ops.push({ op: "add", path: childPath, value: after[i] });
    } else if (i >= after.length) {
      ops.push({ op: "remove", path: childPath });
    } else {
      ops.push(...diffAt(childPath, before[i], after[i]));
    }
  }
  return ops;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return aKeys.length === bKeys.length && aKeys.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

/** RFC 6901 §3: `~` -> `~0` then `/` -> `~1` (order matters — escape `~` first). */
function escapePointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}
