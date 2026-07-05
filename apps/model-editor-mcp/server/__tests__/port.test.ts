import { describe, it, expect } from "vitest";
import { createServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { fnv1a, deterministicPort, probeId, bindPort, DuplicateInstanceError } from "../port.js";

describe("deterministic port", () => {
  it("fnv1a is stable and 32-bit unsigned", () => {
    expect(fnv1a("/Users/paul/proj")).toBe(fnv1a("/Users/paul/proj"));
    expect(fnv1a("/Users/paul/proj")).toBeGreaterThanOrEqual(0);
    expect(fnv1a("/Users/paul/proj")).toBeLessThanOrEqual(0xffffffff);
  });
  it("maps every path into the private range 49152..65535", () => {
    for (const p of ["/a", "/Users/paul/x", "/very/deep/nested/path/here"]) {
      const port = deterministicPort(p);
      expect(port).toBeGreaterThanOrEqual(49152);
      expect(port).toBeLessThanOrEqual(65535);
    }
  });
  it("is deterministic per path and differs for different paths", () => {
    expect(deterministicPort("/a")).toBe(deterministicPort("/a"));
    expect(deterministicPort("/a")).not.toBe(deterministicPort("/b"));
  });
});

describe("probeId", () => {
  it("resolves null when nothing answers on the port", async () => {
    // A port that (almost certainly) has nothing bound to it in a test run.
    const port = deterministicPort("/probeId/nobody-home/unique-path-1");
    expect(await probeId(port)).toBeNull();
  });

  it("resolves null (after its own timeout) when the port is held by a non-HTTP listener", async () => {
    const port = deterministicPort("/probeId/raw-tcp/unique-path-2");
    // Accepts connections but never speaks HTTP. Track accepted sockets so we can force-close
    // them in the finally block: the probing client's `req.destroy()` on timeout doesn't reliably
    // tear down the server-side half of the connection, which would otherwise hang `server.close()`.
    const sockets: import("node:net").Socket[] = [];
    const raw = createTcpServer((socket) => { sockets.push(socket); });
    await new Promise<void>((r) => raw.listen(port, "127.0.0.1", r));
    try {
      expect(await probeId(port)).toBeNull();
    } finally {
      for (const s of sockets) s.destroy();
      await new Promise<void>((r) => raw.close(() => r()));
    }
  });

  it("resolves the reported root when a server answers GET /_id", async () => {
    const root = "/probeId/answers/unique-path-3";
    const port = deterministicPort(root);
    const server = createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ root }));
    });
    await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
    try {
      expect(await probeId(port)).toEqual({ root });
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});

describe("bindPort", () => {
  it("returns the deterministic port when it is free", async () => {
    const path = "/bindPort/free/unique-path-4";
    expect(await bindPort(path, path)).toBe(deterministicPort(path));
  });

  it("throws DuplicateInstanceError when /_id on the taken port reports the SAME root", async () => {
    const path = "/bindPort/duplicate/unique-path-5";
    const port = deterministicPort(path);
    const server = createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ root: path }));
    });
    await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
    try {
      await expect(bindPort(path, path)).rejects.toBeInstanceOf(DuplicateInstanceError);
      try {
        await bindPort(path, path);
        expect.unreachable("bindPort should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(DuplicateInstanceError);
        expect((e as DuplicateInstanceError).port).toBe(port);
        expect((e as DuplicateInstanceError).url).toBe(`http://127.0.0.1:${port}/`);
      }
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("falls forward to the next free port on a hash collision (taken port reports a DIFFERENT root)", async () => {
    const path = "/bindPort/collision/unique-path-6";
    const port = deterministicPort(path);
    const server = createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ root: "/some/other/project" }));
    });
    await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
    try {
      const bound = await bindPort(path, path);
      expect(bound).not.toBe(port);
      expect(bound).toBeGreaterThan(port);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
