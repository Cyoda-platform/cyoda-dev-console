import { describe, it, expect } from "vitest";
import tauriConf from "../../src-tauri/tauri.conf.json";

// Regression guard for the packaged-app CSP. These invariants are invisible to
// `tauri dev` (served from the Vite dev server with no CSP) and only bite in the
// bundled app — the class of bug that shipped broken in v0.1.0. Reproduce
// locally with `tauri build --debug --bundles app` (see README).

const security = tauriConf.app.security as {
  csp: string;
  dangerousDisableAssetCspModification?: boolean | string[];
};
const csp = security.csp;

const directive = (name: string) =>
  csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(`${name} `));

describe("tauri.conf.json CSP", () => {
  // Monaco injects its editor CSS as runtime inline <style> elements. Tauri
  // auto-injects a nonce into style-src, and per the CSP spec a nonce nullifies
  // 'unsafe-inline' — so those styles get refused and every JSON editor renders
  // dead (no cursor, no highlighting). Two things must hold together:
  it("style-src declares 'unsafe-inline' for Monaco's runtime styles", () => {
    expect(directive("style-src")).toContain("'unsafe-inline'");
  });

  it("disables Tauri's style-src nonce so 'unsafe-inline' stays effective", () => {
    const skip = security.dangerousDisableAssetCspModification;
    // Either all CSP modification is disabled, or style-src specifically is.
    const ok = skip === true || (Array.isArray(skip) && skip.includes("style-src"));
    expect(
      ok,
      "app.security.dangerousDisableAssetCspModification must include 'style-src' " +
        "(otherwise Tauri's injected nonce makes the browser ignore 'unsafe-inline')",
    ).toBe(true);
  });

  // Monaco's default worker bootstrap can spawn workers from blob: URLs; keep
  // them allowed so the editor never regresses to a CSP-blocked worker.
  it("allows blob: web workers (Monaco needs them)", () => {
    const worker = directive("worker-src") ?? directive("child-src") ?? directive("default-src");
    expect(worker, `worker source must allow blob: — got "${worker}"`).toContain("blob:");
  });
});
