import { it, expect } from "vitest";
import { ALWAYS_EXCLUDE } from "../globs.js";

it("always-exclude list covers all required directories", () => {
  const required = [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/target/**",
    "**/.turbo/**",
    "**/.next/**",
    "**/coverage/**",
  ];
  for (const g of required) {
    expect(ALWAYS_EXCLUDE).toContain(g);
  }
});
