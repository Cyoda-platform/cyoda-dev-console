import { test, expect } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, cp, rm, mkdir } from "node:fs/promises";
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

// Memoized: the server prints its URL to stderr exactly once at startup. With two
// tests now sharing one `child` (spawned once in beforeAll), a second unmemoized
// call would attach a fresh "data" listener that never sees that one-time message
// again and would hang until its own 20s timeout. Caching the resolved promise
// makes every caller after the first resolve instantly from the already-known URL.
let urlPromise: Promise<string> | null = null;

function waitForUrl(): Promise<string> {
  if (!urlPromise) {
    urlPromise = new Promise((resolve, reject) => {
      let buf = "";
      const to = setTimeout(() => reject(new Error("server never printed URL")), 20_000);
      child.stderr.on("data", (b: Buffer) => {
        buf += b.toString("utf8");
        const m = buf.match(/model-editor-mcp: (http:\/\/127\.0\.0\.1:\d+\/\S*)/);
        if (m) { clearTimeout(to); resolve(m[1]!); }
      });
    });
  }
  return urlPromise;
}

test.beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), "mem-e2e-"));
  await mkdir(join(fixture, "models", "workflow"), { recursive: true });
  await mkdir(join(fixture, "models", "schema"), { recursive: true });
  await cp(join(here, "fixtures", "Pledge.json"), join(fixture, "models", "workflow", "Pledge.json"));
  await cp(join(here, "fixtures", "LegalEntity.json"), join(fixture, "models", "workflow", "LegalEntity.json"));
  await cp(join(here, "fixtures", "CollateralAsset.json"), join(fixture, "models", "schema", "CollateralAsset.json"));
  child = spawn("node", [serverEntry, "--project", fixture], { stdio: ["pipe", "pipe", "pipe"] });
  rpc("initialize");
});

test.afterAll(async () => {
  await new Promise<void>((r) => { child.once("exit", () => r()); child.kill("SIGINT"); });
  await rm(fixture, { recursive: true, force: true });
});

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

test("self-service picker: browses an entity's read-only Tree/JSON view and switches workflow ↔ entity", async ({ page }) => {
  const url = await waitForUrl();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);

  // Claude shows Pledge first, exactly like the first test — proves the picker
  // and the MCP-driven push coexist in the same session.
  rpc("tools/call", { name: "show_workflow", arguments: { name: "Pledge" } });
  await expect(page.locator(".react-flow__node")).toHaveCount(3, { timeout: 15_000 });

  // Self-service: click the entity in the sidebar picker (no MCP call involved).
  await page.getByRole("button", { name: "CollateralAsset" }).click();
  await expect(page.getByPlaceholder("Search keys and values…")).toBeVisible({ timeout: 10_000 });
  // "valuationCcy" (not "assetId"): the fixture's `required: ["assetId"]` array renders
  // "assetId" a second time as a quoted string value, so getByText("assetId") is a real
  // (non-flaky, deterministic) strict-mode ambiguity — two elements match every run.
  // "valuationCcy" appears exactly once in the tree and still proves real fixture content
  // rendered through the JsonTree, not a DOM-light stand-in.
  await expect(page.getByText("valuationCcy")).toBeVisible();

  // Switch to the entity's read-only JSON tab — a genuinely separate Monaco pane.
  await page.getByRole("tab", { name: "JSON" }).click();
  await expect(page.locator(".monaco-editor")).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.locator(".monaco-editor").innerText(), { timeout: 10_000 }).toContain("assetId");

  // Switch back to a workflow via the picker (not MCP) — proves the picker drives
  // the SAME rendering path show_workflow does.
  await page.getByRole("button", { name: "LegalEntity" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(3, { timeout: 15_000 });
  const legalNodes = await page.locator(".react-flow__node").allInnerTexts();
  expect(legalNodes.join(" ")).toContain("draft");

  expect(errors).toEqual([]);
});
