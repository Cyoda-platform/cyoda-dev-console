import { get } from "node:http";
import { createServer } from "node:net";

/** 32-bit FNV-1a (unsigned). */
export function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { hash ^= str.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return hash >>> 0;
}

/** Stable, bookmarkable port in the dynamic/private range, derived from the abs path. */
export function deterministicPort(absProjectPath: string): number {
  return 49152 + (fnv1a(absProjectPath) % 16384);
}

export class DuplicateInstanceError extends Error {
  constructor(public port: number, public url: string) { super(`a model-editor-mcp instance already serves this project at ${url}`); }
}

/** `GET /_id` on a port; resolves its reported root, or null if nothing/again unreachable. */
export function probeId(port: number): Promise<{ root: string } | null> {
  return new Promise((resolve) => {
    const req = get({ host: "127.0.0.1", port, path: "/_id", timeout: 500 }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => { try { resolve(JSON.parse(body) as { root: string }); } catch { resolve(null); } });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

/**
 * Resolve the port to bind: prefer the deterministic port; if it is taken, `GET
 * /_id` — same project root → DuplicateInstanceError (the running server + /_id
 * IS the lock); a hash collision on a different project → next free port.
 */
export async function bindPort(preferredPath: string, projectRoot: string): Promise<number> {
  const preferred = deterministicPort(preferredPath);
  if (await isFree(preferred)) return preferred;
  const id = await probeId(preferred);
  if (id?.root === projectRoot) throw new DuplicateInstanceError(preferred, `http://127.0.0.1:${preferred}/`);
  for (let port = preferred + 1; port < 65536; port++) if (await isFree(port)) return port;
  for (let port = 49152; port < preferred; port++) if (await isFree(port)) return port;
  throw new Error("no free port in the private range");
}
