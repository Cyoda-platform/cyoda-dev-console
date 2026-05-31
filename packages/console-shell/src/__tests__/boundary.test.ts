import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(entry.name) && !p.includes("__tests__")) out.push(p);
  }
  return out;
}

describe("console-shell boundary", () => {
  it("never imports a domain package", () => {
    const offenders: string[] = [];
    const banned = /from\s+["'](?:@cyoda\/workflow-|@cyoda\/entity-model-viewer|@cyoda\/agent-bridge-contract)/;
    for (const file of walk(srcDir)) {
      const src = readFileSync(file, "utf8");
      if (banned.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
