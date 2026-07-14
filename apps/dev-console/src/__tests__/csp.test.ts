import { describe, it, expect } from "vitest";
import tauriConf from "../../src-tauri/tauri.conf.json";

// Regression guard for fix/monaco-csp-workers.
//
// Monaco creates its language/editor workers through its default bootstrap,
// which spawns them from `blob:` URLs. The packaged app enforces the CSP from
// tauri.conf.json (dev serves from the Vite dev server with no CSP, so this is
// invisible during `tauri dev`). If the CSP forbids blob: workers, every JSON
// editor (criteria/annotations) renders dead — no cursor, no highlighting.
// This shipped broken in v0.1.0. Keep blob: workers allowed.

const csp: string = tauriConf.app.security.csp;

const directive = (name: string) =>
  csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(`${name} `));

describe("tauri.conf.json CSP", () => {
  it("allows blob: web workers (Monaco needs them)", () => {
    const worker = directive("worker-src") ?? directive("child-src") ?? directive("default-src");
    expect(worker, "a worker-src/child-src/default-src directive must exist").toBeTruthy();
    expect(worker, `worker source must allow blob: — got "${worker}"`).toContain("blob:");
  });

  it("allows blob: for script loading (Monaco's worker module import)", () => {
    const script = directive("script-src") ?? directive("default-src");
    expect(script).toBeTruthy();
    expect(script, `script source must allow blob: — got "${script}"`).toContain("blob:");
  });
});
