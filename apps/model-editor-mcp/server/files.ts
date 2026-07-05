import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
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
 * Write `contents` to `relativePath` inside `root`, atomically and confined.
 * Faithful port of `write_confined`: create intermediate dirs, re-canonicalise
 * the parent after creation (defends against a symlinked parent), then temp +
 * rename into the *canonical* parent to close the TOCTOU window.
 */
export async function writeConfined(root: string, relativePath: string, contents: string): Promise<WriteResult> {
  assertRelative(relativePath);
  const rootReal = await realpath(root);
  const target = join(rootReal, relativePath);
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const parentReal = await realpath(parent);
  if (!isInside(parentReal, rootReal)) throw new ConfinementError("path outside project root");
  const finalTarget = join(parentReal, basename(target));
  const tmp = join(parentReal, `.${basename(target)}.${randomBytes(6).toString("hex")}.tmp`);
  await writeFile(tmp, contents, { encoding: "utf8", mode: 0o600 });
  await rename(tmp, finalTarget);
  const st = await stat(finalTarget);
  return { path: finalTarget, lastModified: st.mtime.toISOString(), sizeBytes: st.size };
}
