import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, sep } from "node:path";
import { randomBytes } from "node:crypto";

/** Thrown when a relative path escapes, or resolves outside, the project root. */
export class ConfinementError extends Error {}

export interface ReadResult { path: string; contents: string; lastModified: string; sizeBytes: number }
export interface WriteResult { path: string; lastModified: string; sizeBytes: number }

/** Reject absolute paths and any `..` segment before touching the filesystem. */
function assertRelative(relativePath: string): void {
  if (isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) {
    throw new ConfinementError(`path escapes project root: "${relativePath}"`);
  }
}

function isInside(candidate: string, rootReal: string): boolean {
  return candidate === rootReal || candidate.startsWith(rootReal + sep);
}

/**
 * Resolve an *existing* `relativePath` inside `root`. Canonicalises both root
 * and candidate (following symlinks) and requires the candidate to equal or
 * descend from the canonical root — the TS analogue of `resolve_confined`.
 */
export async function resolveInsideRoot(root: string, relativePath: string): Promise<string> {
  assertRelative(relativePath);
  const rootReal = await realpath(root);
  const candidateReal = await realpath(join(rootReal, relativePath)).catch((e: unknown) => {
    throw new ConfinementError(`cannot resolve "${relativePath}": ${(e as Error).message}`);
  });
  if (!isInside(candidateReal, rootReal)) throw new ConfinementError("path outside project root");
  return candidateReal;
}

export async function readConfined(root: string, relativePath: string): Promise<ReadResult> {
  const abs = await resolveInsideRoot(root, relativePath);
  const contents = await readFile(abs, "utf8");
  const st = await stat(abs);
  return { path: abs, contents, lastModified: st.mtime.toISOString(), sizeBytes: st.size };
}

/**
 * Create the directory portion of `relativeDir` under the canonical root, one
 * segment at a time. Each segment is created non-recursively beneath an
 * already-canonical parent, then re-canonicalised and confinement-checked
 * *before* descending. Because every `mkdir` target's parent is already a real
 * path inside the root, creation can never follow a symlink out; a symlinked
 * ancestor (immediate or not, pre-existing or freshly encountered) is caught by
 * the post-`realpath` check and rejected with **zero directories created
 * outside the root**. An existing segment (`EEXIST`) is still re-canonicalised
 * and checked. Returns the canonical parent directory of the write target.
 */
async function mkdirConfined(rootReal: string, relativeDir: string): Promise<string> {
  const segments =
    relativeDir === "." || relativeDir === ""
      ? []
      : relativeDir.split(/[\\/]/).filter((s) => s.length > 0);
  let currentReal = rootReal;
  for (const segment of segments) {
    const next = join(currentReal, segment);
    try {
      await mkdir(next);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
    const nextReal = await realpath(next);
    if (!isInside(nextReal, rootReal)) throw new ConfinementError("path outside project root");
    currentReal = nextReal;
  }
  return currentReal;
}

/**
 * Write `contents` to `relativePath` inside `root`, atomically and confined.
 * Faithful port of `write_confined`, hardened: create intermediate dirs
 * segment-by-segment with a confinement check after each (see `mkdirConfined`),
 * then temp + rename into the *canonical* parent to close the TOCTOU window. On
 * a failed rename the leftover temp file is unlinked so nothing dangles.
 */
export async function writeConfined(root: string, relativePath: string, contents: string): Promise<WriteResult> {
  assertRelative(relativePath);
  const rootReal = await realpath(root);
  const parentReal = await mkdirConfined(rootReal, dirname(relativePath));
  const name = basename(relativePath);
  const finalTarget = join(parentReal, name);
  const tmp = join(parentReal, `.${name}.${randomBytes(6).toString("hex")}.tmp`);
  await writeFile(tmp, contents, { encoding: "utf8", mode: 0o600 });
  try {
    await rename(tmp, finalTarget);
  } finally {
    await rm(tmp, { force: true });
  }
  const st = await stat(finalTarget);
  return { path: finalTarget, lastModified: st.mtime.toISOString(), sizeBytes: st.size };
}

/** Delete `relativePath` inside `root`, confined via `resolveInsideRoot` — the
 *  same canonicalize+prefix-check every other confined op uses. Existence is the
 *  CALLER's job (entity tools already check via `findEntityByName` before calling
 *  this): a path that does not exist (or that escapes root) fails inside
 *  `resolveInsideRoot` — `realpath()` throws, and that throw is unconditionally
 *  rewrapped as a `ConfinementError` (message `cannot resolve "…": ENOENT: …`,
 *  and crucially `.code` is `undefined`, NOT `"ENOENT"`) — so `rm()` is never
 *  reached. There is no ENOENT-passthrough path here; callers that need
 *  idempotent "already gone" semantics must check existence themselves (e.g.
 *  via discovery) rather than rely on an ENOENT code from `rmConfined`. */
export async function rmConfined(root: string, relativePath: string): Promise<void> {
  const abs = await resolveInsideRoot(root, relativePath);
  await rm(abs, { force: false });
}
