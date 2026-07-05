import { it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Mock } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { createHttpServer } from "../http.js";
import { createSseHub } from "../sse.js";

let dist: string, server: ReturnType<typeof createHttpServer>, base: string;
let writeLayout: Mock<(name: string, workflowUi: Record<string, unknown>, origin: string) => Promise<void>>;
let discoverEntities: Mock<() => Promise<{ relativePath: string; name: string }[]>>;
let readWorkflow: Mock<(name: string) => Promise<{ name: string; path: string; content: string; layout: Record<string, unknown> } | null>>;
let readEntity: Mock<(name: string) => Promise<{ name: string; path: string; contents: string } | null>>;

/** Raw HTTP client — lets us send an arbitrary `Host` header (undici `fetch`
 *  forbids overriding `Host`, which the DNS-rebinding tests need). */
function raw(path: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(`${base}${path}`, { method: opts.method ?? "GET", headers: opts.headers }, (res) => {
      let body = "";
      res.on("data", (c) => { body += String(c); });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

beforeEach(async () => {
  dist = await mkdtemp(join(tmpdir(), "mem-dist-"));
  await writeFile(join(dist, "index.html"), "<html>tok=__SESSION_TOKEN__</html>");
  writeLayout = vi.fn(async () => {});
  discoverEntities = vi.fn(async () => [{ relativePath: "models/schema/Foo.json", name: "Foo" }]);
  readWorkflow = vi.fn(async (name: string) => (name === "Pledge" ? { name: "Pledge", path: "Pledge.json", content: '{"workflows":[]}', layout: {} } : null));
  readEntity = vi.fn(async (name: string) => (name === "Foo" ? { name: "Foo", path: "models/schema/Foo.json", contents: '{"a":1}' } : null));
  server = createHttpServer({
    root: "/proj", distDir: dist, token: "secret", hub: createSseHub(),
    discover: async () => [{ relativePath: "Pledge.json", workflows: [{ name: "Pledge" }] }],
    discoverEntities, readWorkflow, readEntity, writeLayout,
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { await new Promise<void>((r) => server.close(() => r())); await rm(dist, { recursive: true, force: true }); });

it("GET /_id reports the project root", async () => {
  expect(await (await fetch(`${base}/_id`)).json()).toEqual({ root: "/proj" });
});
it("serves index.html with the session token injected", async () => {
  expect(await (await fetch(`${base}/`)).text()).toBe("<html>tok=secret</html>");
});
it("rejects POST /layout without the session token (401), no write", async () => {
  const res = await fetch(`${base}/layout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Pledge", workflowUi: {} }) });
  expect(res.status).toBe(401);
  expect(writeLayout).not.toHaveBeenCalled();
});
it("rejects POST /layout with a non-loopback Origin (403)", async () => {
  const res = await fetch(`${base}/layout`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": "secret", origin: "http://evil.com" }, body: JSON.stringify({ name: "Pledge", workflowUi: {} }) });
  expect(res.status).toBe(403);
  expect(writeLayout).not.toHaveBeenCalled();
});
it("rejects an un-allowlisted workflow name (404), no write", async () => {
  const res = await fetch(`${base}/layout`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": "secret" }, body: JSON.stringify({ name: "Ghost", workflowUi: {} }) });
  expect(res.status).toBe(404);
  expect(writeLayout).not.toHaveBeenCalled();
});
it("accepts a valid POST /layout (204) and forwards to writeLayout with origin", async () => {
  const res = await fetch(`${base}/layout`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": "secret", "x-origin": "tabA" }, body: JSON.stringify({ name: "Pledge", workflowUi: { Pledge: { layout: { nodes: {} } } } }) });
  expect(res.status).toBe(204);
  expect(writeLayout).toHaveBeenCalledWith("Pledge", { Pledge: { layout: { nodes: {} } } }, "tabA");
});
it("rejects a POST /layout body over the 1 MiB cap (413), no write", async () => {
  const oversized = "x".repeat(1_048_577);
  const res = await fetch(`${base}/layout`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": "secret" }, body: JSON.stringify({ name: "Pledge", workflowUi: { blob: oversized } }) });
  expect(res.status).toBe(413);
  expect(writeLayout).not.toHaveBeenCalled();
});

it("GET /api/index returns the current workflow + entity lists", async () => {
  const res = await fetch(`${base}/api/index`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ workflows: [{ name: "Pledge", path: "Pledge.json" }], entities: [{ name: "Foo", path: "models/schema/Foo.json" }] });
});
it("GET /api/workflow/:name returns the item for an allowlisted name", async () => {
  const res = await fetch(`${base}/api/workflow/Pledge`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ name: "Pledge", path: "Pledge.json", content: '{"workflows":[]}', layout: {} });
});
it("GET /api/workflow/:name 404s for a name not in discovery, and never calls readWorkflow", async () => {
  const res = await fetch(`${base}/api/workflow/Ghost`);
  expect(res.status).toBe(404);
  expect(readWorkflow).not.toHaveBeenCalled();
});
it("GET /api/entity/:name returns the item for an allowlisted name", async () => {
  const res = await fetch(`${base}/api/entity/Foo`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ name: "Foo", path: "models/schema/Foo.json", contents: '{"a":1}' });
});
it("GET /api/entity/:name 404s for a name not in discovery, and never calls readEntity", async () => {
  const res = await fetch(`${base}/api/entity/Ghost`);
  expect(res.status).toBe(404);
  expect(readEntity).not.toHaveBeenCalled();
});
it("a traversal-looking workflow :name never reaches readWorkflow — the allowlist rejects it before any path use", async () => {
  const res = await fetch(`${base}/api/workflow/${encodeURIComponent("../../../etc/passwd")}`);
  expect(res.status).toBe(404);
  expect(readWorkflow).not.toHaveBeenCalled();
});
it("a traversal-looking entity :name never reaches readEntity — the allowlist rejects it before any path use", async () => {
  const res = await fetch(`${base}/api/entity/${encodeURIComponent("../../../etc/passwd")}`);
  expect(res.status).toBe(404);
  expect(readEntity).not.toHaveBeenCalled();
});
it("rejects GET /api/index with a non-loopback Host (403), same gate as /_id", async () => {
  const res = await raw("/api/index", { headers: { host: "evil.com" } });
  expect(res.status).toBe(403);
});

// --- CRITICAL: token leak via DNS rebinding — static + /_id must be loopback-gated ---
it("rejects GET / with a non-loopback Host (403) and never leaks the token", async () => {
  const res = await raw("/", { headers: { host: "evil.com" } });
  expect(res.status).toBe(403);
  expect(res.body).not.toContain("secret");
});
it("rejects GET /_id with a non-loopback Host (403) and never leaks the root", async () => {
  const res = await raw("/_id", { headers: { host: "evil.com" } });
  expect(res.status).toBe(403);
  expect(res.body).not.toContain("/proj");
});
it("still serves GET / to a loopback Host with the token injected", async () => {
  const res = await raw("/", { headers: { host: "localhost" } });
  expect(res.status).toBe(200);
  expect(res.body).toBe("<html>tok=secret</html>");
});
it("still serves GET /_id to a loopback Host", async () => {
  const res = await raw("/_id", { headers: { host: "127.0.0.1" } });
  expect(res.status).toBe(200);
  expect(JSON.parse(res.body)).toEqual({ root: "/proj" });
});

// --- IMPORTANT: unguarded async must not crash the process ---
it("responds 500 (not a crash) when writeLayout throws, and stays alive", async () => {
  writeLayout.mockImplementationOnce(async () => { throw new Error("disk full"); });
  const res = await fetch(`${base}/layout`, { method: "POST", headers: { "content-type": "application/json", "x-session-token": "secret" }, body: JSON.stringify({ name: "Pledge", workflowUi: {} }) });
  expect(res.status).toBe(500);
  // process + server still alive — a subsequent request must still succeed
  expect(await (await fetch(`${base}/_id`)).json()).toEqual({ root: "/proj" });
});
