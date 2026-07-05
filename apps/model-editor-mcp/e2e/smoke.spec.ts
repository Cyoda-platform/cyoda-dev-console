import { test, expect } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(here, "..", "dist", "index.js");

let child: ChildProcessWithoutNullStreams;
let fixture: string;
let rpcId = 0;

function rpc(method: string, params?: unknown): void {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params })}\n`);
}

async function waitForUrl(): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const to = setTimeout(() => reject(new Error("server never printed URL")), 20_000);
    child.stderr.on("data", (b: Buffer) => {
      buf += b.toString("utf8");
      const m = buf.match(/model-editor-mcp: (http:\/\/127\.0\.0\.1:\d+\/\S*)/);
      if (m) { clearTimeout(to); resolve(m[1]!); }
    });
  });
}

test.beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), "mem-e2e-"));
  await cp(join(here, "fixtures", "Pledge.json"), join(fixture, "Pledge.json"));
  await cp(join(here, "fixtures", "LegalEntity.json"), join(fixture, "LegalEntity.json"));
  child = spawn("node", [serverEntry, "--project", fixture], { stdio: ["pipe", "pipe", "pipe"] });
  rpc("initialize");
});

test.afterAll(async () => { child.kill("SIGINT"); await rm(fixture, { recursive: true, force: true }); });

test("renders reactflow nodes and live-swaps between workflows over MCP stdio", async ({ page }) => {
  const url = await waitForUrl();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);

  const nodeText = (): Promise<string> => page.locator(".react-flow__node").allInnerTexts().then((t) => t.join(" "));

  rpc("tools/call", { name: "show_workflow", arguments: { name: "Pledge" } });
  await expect(page.locator(".react-flow__node")).toHaveCount(3, { timeout: 15_000 }); // none, created, settled
  // Node divs mount synchronously with the count above, but their label text can land a paint
  // later (React Flow's own re-render once node dimensions/content settle) — poll instead of a
  // single innerText snapshot to avoid a real (observed) race, not a fixed sleep.
  await expect.poll(nodeText, { timeout: 15_000 }).toContain("none");

  rpc("tools/call", { name: "show_workflow", arguments: { name: "LegalEntity" } });
  await expect(page.locator(".react-flow__node")).toHaveCount(3, { timeout: 15_000 }); // draft, review, active
  await expect.poll(nodeText, { timeout: 15_000 }).toContain("draft");
  expect(await nodeText()).not.toContain("none"); // live-swap actually replaced the old workflow's nodes

  expect(errors).toEqual([]);
});
