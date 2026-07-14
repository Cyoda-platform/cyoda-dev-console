// End-to-end smoke test for the PACKAGED Tauri app, run via tauri-driver on Linux.
//
// Why this exists: the packaged app serves bundled assets over the tauri://
// protocol with the tauri.conf.json CSP *enforced* (and Tauri injects nonces).
// `tauri dev` serves from the Vite dev server with no CSP, so an entire class of
// production-only breakage is invisible in dev. The Monaco JSON editors shipped
// dead in v0.1.0 because Tauri's style-src nonce nullified 'unsafe-inline' and
// refused Monaco's runtime inline <style> tags. This test reproduces the real
// packaged conditions and fails if that (or a worker/CSP regression) returns.
//
// It launches the real binary, auto-opens a fixture project (via a pre-seeded
// config, so no native folder dialog), navigates to the CRITERION ANNOTATIONS
// Monaco editor, and asserts:
//   (a) inline styles are actually applied (no effective style-src nonce),
//   (b) the Monaco editor rendered content,
//   (c) no style-src CSP violations and no console errors surfaced.
//
// tauri-driver is Linux/Windows only — this cannot run on macOS.

import { Builder, By, Capabilities, until } from "selenium-webdriver";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../.."); // apps/dev-console/e2e -> repo root
const FIXTURE_DIR = join(HERE, "fixtures", "project");
const APP_BINARY =
  process.env.TAURI_APP_BINARY ||
  join(REPO, "apps/dev-console/src-tauri/target/debug/cyoda-dev-console");
const DRIVER_PORT = 4444;
const BUNDLE_ID = "com.cyoda.devconsole";

const log = (...a) => console.log("[e2e]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Pre-seed the app config so the app auto-opens the fixture (no dialog). ---
function seedConfig() {
  const cfgDir = join(
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
    BUNDLE_ID,
  );
  mkdirSync(cfgDir, { recursive: true });
  const id = "11111111-1111-4111-8111-111111111111"; // fixed valid UUID
  const nowIso = "2026-01-01T00:00:00.000Z"; // fixed valid ISO datetime
  const project = {
    id,
    name: "e2e-fixture",
    rootPath: FIXTURE_DIR,
    workflowGlobs: ["**/*.json"],
    entityGlobs: ["**/*.json"],
    workflowRoot: null,
    entityRoot: null,
    createdAt: nowIso,
    lastOpenedAt: nowIso,
  };
  const config = { version: 1, activeProjectId: id, recentProjects: [project] };
  const dest = join(cfgDir, "config.json");
  writeFileSync(dest, JSON.stringify(config, null, 2));
  log("seeded config", dest, "-> project root", FIXTURE_DIR);
}

// Injected into the page to capture errors/CSP violations from this point on.
// (tauri-driver/WebKitWebDriver has no console-log capability, so we shim it.)
const INSTRUMENT = `
  window.__e2e = window.__e2e || { errors: [], csp: [] };
  if (!window.__e2e.installed) {
    window.__e2e.installed = true;
    const orig = console.error.bind(console);
    console.error = (...a) => { try { window.__e2e.errors.push(a.map(String).join(' ')); } catch (_) {} orig(...a); };
    addEventListener('securitypolicyviolation', (e) => {
      window.__e2e.csp.push(e.violatedDirective + ' blocked ' + e.blockedURI);
    });
  }
  return true;
`;

async function main() {
  seedConfig();

  log("starting tauri-driver, app binary:", APP_BINARY);
  const driverProc = spawn("tauri-driver", ["--port", String(DRIVER_PORT)], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  driverProc.on("error", (e) => {
    console.error("[e2e] failed to spawn tauri-driver:", e.message);
    process.exit(1);
  });
  await sleep(2000); // let tauri-driver + WebKitWebDriver come up

  const capabilities = new Capabilities();
  capabilities.set("tauri:options", { application: APP_BINARY });
  capabilities.setBrowserName("wry");

  let driver;
  let failure;
  try {
    driver = await new Builder()
      .withCapabilities(capabilities)
      .usingServer(`http://127.0.0.1:${DRIVER_PORT}/`)
      .build();
    driver.manage().setTimeouts({ implicit: 0, pageLoad: 60000, script: 30000 });

    // Instrument as early as we can get a session.
    await driver.executeScript(INSTRUMENT);
    log("session up, instrumented");

    // 1. App auto-opened the project -> open the first workflow file.
    const openFirst = await driver.wait(
      until.elementLocated(
        By.xpath("//button[normalize-space(.)='Open first file']"),
      ),
      30000,
      "EmptyState 'Open first file' button never appeared (config seed may be invalid -> native dialog)",
    );
    await openFirst.click();
    log("clicked 'Open first file'");

    // 2. Graph mounts -> open the workflow-level settings/inspector.
    await driver.wait(
      until.elementLocated(By.css(".react-flow__node")),
      30000,
      "workflow graph nodes never rendered",
    );
    const settings = await driver.wait(
      until.elementLocated(By.css('[data-testid="canvas-workflow-settings"]')),
      30000,
      "canvas-workflow-settings control never appeared",
    );
    await settings.click();
    log("opened workflow settings");

    // 3. Inspector -> criterion annotations block -> Monaco editor.
    const annBlock = await driver.wait(
      until.elementLocated(
        By.css('[data-testid="inspector-criterion-annotations"]'),
      ),
      30000,
      "inspector-criterion-annotations block never appeared",
    );
    await driver.wait(
      async () =>
        (await annBlock.findElements(By.css(".monaco-editor"))).length > 0,
      30000,
      "Monaco editor never mounted in the criterion-annotations block",
    );
    // Let Monaco paint its view lines.
    await driver.wait(
      async () =>
        (await annBlock.findElements(By.css(".monaco-editor .view-line")))
          .length > 0,
      30000,
      "Monaco .view-line never rendered",
    );
    log("Monaco editor mounted");

    // --- Assertions ---------------------------------------------------------

    // (a) Inline styles must actually apply (proves no effective style-src nonce).
    const probeColor = await driver.executeScript(`
      const st = document.createElement('style');
      st.textContent = '#__e2e_probe{color: rgb(1, 2, 3)}';
      document.head.appendChild(st);
      const el = document.createElement('div');
      el.id = '__e2e_probe';
      document.body.appendChild(el);
      return getComputedStyle(el).color;
    `);
    log("probe computed color:", probeColor);
    assert.equal(
      probeColor,
      "rgb(1, 2, 3)",
      `inline <style> was NOT applied (got "${probeColor}") — style-src is refusing inline styles (Tauri nonce nullifying 'unsafe-inline'?)`,
    );

    // (b) Monaco actually rendered the JSON content, with dimensions.
    const editorState = await driver.executeScript(`
      const block = document.querySelector('[data-testid="inspector-criterion-annotations"]');
      const ed = block && block.querySelector('.monaco-editor');
      const lines = block ? Array.from(block.querySelectorAll('.view-line')).map(l => l.textContent) : [];
      const mtk = block ? block.querySelector('[class^="mtk"], [class*=" mtk"]') : null;
      return {
        editorHeight: ed ? ed.offsetHeight : 0,
        lineCount: lines.length,
        text: lines.join('\\n'),
        tokenColor: mtk ? getComputedStyle(mtk).color : null,
      };
    `);
    log("editor state:", JSON.stringify(editorState));
    assert.ok(editorState.editorHeight > 0, "Monaco editor has zero height");
    assert.ok(editorState.lineCount > 0, "Monaco rendered no view lines");
    assert.ok(
      /seed annotation/.test(editorState.text),
      `Monaco did not render the seeded annotation JSON — got: ${editorState.text}`,
    );

    // (c) No style-src CSP violations, no console errors (allowlist Monaco's benign Canceled).
    const captured = await driver.executeScript("return window.__e2e;");
    const styleViolations = (captured.csp || []).filter((v) =>
      v.startsWith("style-src"),
    );
    const realErrors = (captured.errors || []).filter(
      (e) => !/Canceled/.test(e),
    );
    log("captured csp:", JSON.stringify(captured.csp));
    log("captured errors:", JSON.stringify(captured.errors));
    assert.deepEqual(
      styleViolations,
      [],
      `style-src CSP violations occurred: ${styleViolations.join("; ")}`,
    );
    assert.deepEqual(
      realErrors,
      [],
      `console errors occurred: ${realErrors.join("; ")}`,
    );

    log("PASS — packaged Monaco editor renders under the enforced CSP");
  } catch (e) {
    failure = e;
  } finally {
    if (driver) await driver.quit().catch(() => {});
    driverProc.kill();
  }
  if (failure) {
    console.error("[e2e] FAIL:", failure.message);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[e2e] unexpected:", e);
  process.exit(1);
});
