import { it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Mock } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createHttpServer } from "../http.js";
import { createSseHub } from "../sse.js";

let dist: string, server: ReturnType<typeof createHttpServer>, base: string;
let writeLayout: Mock<(name: string, workflowUi: Record<string, unknown>, origin: string) => Promise<void>>;

beforeEach(async () => {
  dist = await mkdtemp(join(tmpdir(), "mem-dist-"));
  await writeFile(join(dist, "index.html"), "<html>tok=__SESSION_TOKEN__</html>");
  writeLayout = vi.fn(async () => {});
  server = createHttpServer({
    root: "/proj", distDir: dist, token: "secret", hub: createSseHub(),
    discover: async () => [{ relativePath: "Pledge.json", workflows: [{ name: "Pledge" }] }],
    writeLayout,
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
