import type { CyodaProfile, ProfileSet } from "@cyoda/agent-bridge-contract";

export type TokenStatus = "valid" | "expired" | "missing";

/**
 * Classify a profile token for display only — never verifies the signature.
 * Empty/absent ⇒ "missing". A readable JWT with a past `exp` ⇒ "expired".
 * Anything we cannot parse is treated as "valid" (present but opaque).
 */
export function jwtStatus(token: string | undefined | null): TokenStatus {
  if (!token || token.trim() === "") return "missing";
  const parts = token.split(".");
  const segment = parts[1];
  if (!segment) return "valid";
  try {
    const payload = JSON.parse(decodeBase64Url(segment)) as { exp?: unknown };
    if (typeof payload.exp !== "number") return "valid";
    const nowSec = Math.floor(Date.now() / 1000);
    return payload.exp <= nowSec ? "expired" : "valid";
  } catch {
    return "valid";
  }
}

function decodeBase64Url(segment: string): string {
  const padLength = Math.ceil(segment.length / 4) * 4;
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(padLength, "=");
  // `atob` is available both in the Tauri webview and in the happy-dom test env.
  return atob(b64);
}

/**
 * Loosely validate the raw JSON read from `cyoda-plugin-config.json` into a {@link ProfileSet}.
 * Returns `null` when the shape is unusable. Tolerates a missing/empty token.
 */
export function parseProfileConfig(raw: unknown): ProfileSet | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!obj.profiles || typeof obj.profiles !== "object") return null;

  const active = typeof obj.active === "string" ? obj.active : "";
  const profiles: Record<string, CyodaProfile> = {};
  for (const [name, val] of Object.entries(obj.profiles as Record<string, unknown>)) {
    if (!val || typeof val !== "object") continue;
    const p = val as Record<string, unknown>;
    profiles[name] = {
      endpoint: typeof p.endpoint === "string" ? p.endpoint : "",
      env: p.env === "production" ? "production" : "development",
      token: typeof p.token === "string" ? p.token : "",
    };
  }
  return { active, profiles };
}
