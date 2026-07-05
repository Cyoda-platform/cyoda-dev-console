import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { timingSafeEqual } from "node:crypto";
import type { SseEvent, SseHub, SseClient } from "./sse.js";
import { layoutPostBody } from "./schemas.js";
import { findByName, findEntityByName } from "./discovery.js";

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".map": "application/json", ".ico": "image/x-icon", ".woff2": "font/woff2" };

/** Hard cap on the accumulated `POST /layout` request body. Layout write-backs are a debounced
 *  node-position map for one workflow — 1 MiB is generous headroom while still bounding memory
 *  an unauthenticated-by-size, loopback-reachable request could otherwise force us to buffer. */
const MAX_LAYOUT_BODY_BYTES = 1_048_576;

export interface HttpServerOptions {
  root: string;
  distDir: string;
  token: string;
  hub: SseHub;
  discover: () => Promise<{ relativePath: string; workflows: { name: string }[] }[]>;
  discoverEntities: () => Promise<{ relativePath: string; name: string }[]>;
  readWorkflow: (name: string) => Promise<{ name: string; path: string; content: string; layout: Record<string, unknown> } | null>;
  readEntity: (name: string) => Promise<{ name: string; path: string; contents: string } | null>;
  writeLayout: (name: string, workflowUi: Record<string, unknown>, origin: string) => Promise<void>;
}

/** Loopback-only Origin/Host gate — localhost is not a trust boundary, so this
 *  closes the DNS-rebinding/CSRF surface. Applied to EVERY route (static + `/_id`
 *  included, not just `/events`/`/layout`): a rebinding page at evil.com→127.0.0.1
 *  sends `Host: evil.com`, so gating static serving keeps the token-embedded
 *  `index.html` and the project root from ever reaching such a request. */
export function isLoopback(req: IncomingMessage): boolean {
  const host = req.headers.host ?? "";
  const origin = req.headers.origin;
  const hostOk = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
  const originOk = origin === undefined || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
  return hostOk && originOk;
}

/** Length-guarded constant-time token compare. `timingSafeEqual` throws on
 *  unequal-length buffers, so guard length first (a safe early-out — length is
 *  not the secret); prevents leaking the token byte-by-byte via response timing. */
function tokenMatches(header: string | string[] | undefined, token: string): boolean {
  if (typeof header !== "string") return false;
  const a = Buffer.from(header);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createHttpServer(opts: HttpServerOptions): Server {
  return createServer((req, res) => {
    // Belt-and-suspenders: `handle` already catches internally, but a throw from
    // its own catch block (e.g. a headers-already-sent race) must never surface
    // as an unhandled rejection that terminates the process.
    handle(req, res).catch((error: unknown) => {
      process.stderr.write(`model-editor-mcp http: ${String(error)}\n`);
      try { if (!res.headersSent) res.writeHead(500).end("internal error"); else res.end(); } catch { /* socket already gone */ }
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/_id") {
        if (!isLoopback(req)) { res.writeHead(403).end(); return; }
        res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ root: opts.root })); return;
      }
      if (req.method === "GET" && url.pathname === "/events") { handleEvents(req, res, url); return; }
      if (req.method === "POST" && url.pathname === "/layout") { await handleLayout(req, res); return; }
      if (req.method === "GET" && url.pathname.startsWith("/api/")) {
        if (!isLoopback(req)) { res.writeHead(403).end(); return; }
        await handleApi(url, res);
        return;
      }
      if (req.method === "GET") {
        if (!isLoopback(req)) { res.writeHead(403).end(); return; }
        await serveStatic(url.pathname, res); return;
      }
      res.writeHead(405).end();
    } catch (error: unknown) {
      // A client disconnecting mid-body, a throwing `discover`/`writeLayout`, an
      // fs error — none of these should crash the process. Fail the one request.
      process.stderr.write(`model-editor-mcp http: ${String(error)}\n`);
      if (!res.headersSent) res.writeHead(500).end("internal error");
      else res.end();
    }
  }

  function handleEvents(req: IncomingMessage, res: ServerResponse, url: URL): void {
    if (!isLoopback(req)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": connected\n\n");
    const client: SseClient = { write: (event: SseEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`) };
    opts.hub.addClient(client, url.searchParams.get("origin") ?? "");
    req.on("close", () => opts.hub.removeClient(client));
  }

  async function handleLayout(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!isLoopback(req)) { res.writeHead(403).end("bad origin"); return; }
    if (!tokenMatches(req.headers["x-session-token"], opts.token)) { res.writeHead(401).end("bad token"); return; }
    const origin = String(req.headers["x-origin"] ?? "");
    const chunks: Buffer[] = [];
    let bodyBytes = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
      bodyBytes += chunk.length;
      if (bodyBytes > MAX_LAYOUT_BODY_BYTES) {
        res.writeHead(413).end("body too large");
        req.destroy();
        return;
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    let json: unknown;
    try { json = JSON.parse(body); } catch { res.writeHead(400).end("bad json"); return; }
    const parsed = layoutPostBody.safeParse(json);
    if (!parsed.success) { res.writeHead(400).end("bad body"); return; }
    const { name, workflowUi } = parsed.data;
    // Resolve the posted name with the SAME rule the tools use (declared name, else file
    // basename) by reusing `findByName` — a future change to name-resolution can't desync the
    // allowlist from the handlers.
    if (!findByName(await opts.discover(), name)) { res.writeHead(404).end("unknown workflow"); return; }
    await opts.writeLayout(name, workflowUi as Record<string, unknown>, origin);
    res.writeHead(204).end();
  }

  /** Read-only browser navigation surface — every branch resolves `:name` against LIVE
   *  discovery (`opts.discover`/`opts.discoverEntities`, which re-read the current, possibly
   *  `configure_project`-mutated globs) BEFORE any lookup, and 404s on a miss without ever
   *  calling `readWorkflow`/`readEntity`. This is the same allowlist-then-act shape `POST
   *  /layout` uses via `findByName` — reused here (plus `findEntityByName`) rather than
   *  reinvented, so the raw `:name` segment never reaches a filesystem path. The caller already
   *  applied the loopback gate before invoking this. */
  async function handleApi(url: URL, res: ServerResponse): Promise<void> {
    if (url.pathname === "/api/index") {
      const [workflows, entities] = await Promise.all([opts.discover(), opts.discoverEntities()]);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        workflows: workflows.map((w) => ({ name: w.workflows[0]?.name ?? w.relativePath.replace(/\.json$/, "").split("/").pop(), path: w.relativePath })),
        entities: entities.map((e) => ({ name: e.name, path: e.relativePath })),
      }));
      return;
    }
    const wfMatch = /^\/api\/workflow\/(.+)$/.exec(url.pathname);
    if (wfMatch) {
      const name = decodeURIComponent(wfMatch[1]!);
      if (!findByName(await opts.discover(), name)) { res.writeHead(404).end("unknown workflow"); return; }
      const item = await opts.readWorkflow(name);
      if (!item) { res.writeHead(404).end("unknown workflow"); return; }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(item));
      return;
    }
    const enMatch = /^\/api\/entity\/(.+)$/.exec(url.pathname);
    if (enMatch) {
      const name = decodeURIComponent(enMatch[1]!);
      if (!findEntityByName(await opts.discoverEntities(), name)) { res.writeHead(404).end("unknown entity"); return; }
      const item = await opts.readEntity(name);
      if (!item) { res.writeHead(404).end("unknown entity"); return; }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(item));
      return;
    }
    res.writeHead(404).end("not found");
  }

  async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
    const rel = pathname === "/" ? "index.html" : normalize(pathname).replace(/^(\.\.[/\\])+/, "").replace(/^\//, "");
    const abs = join(opts.distDir, rel);
    const send = async (file: string, mime: string): Promise<void> => {
      let buf = await readFile(file);
      if (file.endsWith("index.html")) buf = Buffer.from(buf.toString("utf8").replaceAll("__SESSION_TOKEN__", opts.token), "utf8");
      res.writeHead(200, { "content-type": mime }); res.end(buf);
    };
    try {
      if (!abs.startsWith(opts.distDir)) { res.writeHead(403).end(); return; }
      if ((await stat(abs)).isDirectory()) throw new Error("dir");
      await send(abs, MIME[extname(abs)] ?? "application/octet-stream");
    } catch {
      try { await send(join(opts.distDir, "index.html"), "text/html"); } catch { res.writeHead(404).end("not found"); }
    }
  }
}
