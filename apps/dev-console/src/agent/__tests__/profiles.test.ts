import { describe, it, expect } from "vitest";
import { jwtStatus, parseProfileConfig } from "../profiles.js";

function makeJwt(exp: number): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ exp }));
  return `${header}.${payload}.sig`;
}

describe("jwtStatus", () => {
  it("returns missing for empty/absent tokens", () => {
    expect(jwtStatus("")).toBe("missing");
    expect(jwtStatus("   ")).toBe("missing");
    expect(jwtStatus(undefined)).toBe("missing");
    expect(jwtStatus(null)).toBe("missing");
  });

  it("returns expired for a past exp", () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    expect(jwtStatus(makeJwt(past))).toBe("expired");
  });

  it("returns valid for a future exp", () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    expect(jwtStatus(makeJwt(future))).toBe("valid");
  });

  it("treats unparseable tokens as valid (present but opaque)", () => {
    expect(jwtStatus("not-a-jwt")).toBe("valid");
    expect(jwtStatus("aaa.bbb.ccc")).toBe("valid");
  });
});

describe("parseProfileConfig", () => {
  it("returns null for non-object / missing profiles", () => {
    expect(parseProfileConfig(null)).toBeNull();
    expect(parseProfileConfig("nope")).toBeNull();
    expect(parseProfileConfig({})).toBeNull();
  });

  it("parses active + profiles with env coercion", () => {
    const result = parseProfileConfig({
      active: "prod",
      profiles: {
        default: { endpoint: "http://localhost:8080", env: "development", token: "" },
        prod: { endpoint: "https://x.cyoda.net", env: "production", token: "abc" },
        weird: { env: "banana" },
      },
    });
    expect(result).not.toBeNull();
    const profiles = result!.profiles;
    expect(result!.active).toBe("prod");
    expect(profiles.default!.env).toBe("development");
    expect(profiles.prod!.env).toBe("production");
    // Unknown env coerces to development; missing fields default safely.
    expect(profiles.weird!.env).toBe("development");
    expect(profiles.weird!.endpoint).toBe("");
    expect(profiles.weird!.token).toBe("");
  });
});
