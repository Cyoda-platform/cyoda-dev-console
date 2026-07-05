import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import type { SseEvent, SseHub, SseClient } from "./sse.js";
import { layoutPostBody } from "./schemas.js";

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".map": "application/json", ".ico": "image/x-icon", ".woff2": "font/woff2" };

export interface HttpServerOptions {
  root: string;
  distDir: string;
  token: string;
  hub: SseHub;
  discover: () => Promise<{ relativePath: string; workflows: { name: string }[] }[]>;
  writeLayout: (name: string, workflowUi: Record<string, unknown>, origin: string) => Promise<void>;
}

/** Loopback-only Origin/Host gate — localhost is not a trust boundary, so this
 *  closes the DNS-rebinding/CSRF surface for `POST /layout` and `/events`. */
export function isLoopback(req: IncomingMessage): boolean {
  const host = req.headers.host ?? "";
  const origin = req.headers.origin;
  const hostOk = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
  const originOk = origin === undefined || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
  return hostOk && originOk;
}

export function createHttpServer(opts: HttpServerOptions): Server {
  return createServer((req, res) => { void handle(req, res); });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/_id") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ root: opts.root })); return; }
    if (req.method === "GET" && url.pathname === "/events") { handleEvents(req, res, url); return; }
    if (req.method === "POST" && url.pathname === "/layout") { await handleLayout(req, res); return; }
    if (req.method === "GET") { await serveStatic(url.pathname, res); return; }
    res.writeHead(405).end();
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
    if (req.headers["x-session-token"] !== opts.token) { res.writeHead(401).end("bad token"); return; }
    const origin = String(req.headers["x-origin"] ?? "");
    let body = "";
    for await (const chunk of req) body += chunk;
    let json: unknown;
    try { json = JSON.parse(body); } catch { res.writeHead(400).end("bad json"); return; }
    const parsed = layoutPostBody.safeParse(json);
    if (!parsed.success) { res.writeHead(400).end("bad body"); return; }
    const { name, workflowUi } = parsed.data;
    const entries = await opts.discover();
    const allowed = entries.some((e) => e.workflows.some((w) => w.name === name) || e.relativePath.replace(/\.json$/, "").split("/").pop() === name);
    if (!allowed) { res.writeHead(404).end("unknown workflow"); return; }
    await opts.writeLayout(name, workflowUi as Record<string, unknown>, origin);
    res.writeHead(204).end();
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
