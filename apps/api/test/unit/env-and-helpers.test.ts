import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/env.js";
import { readCookie } from "../../src/middleware/auth.js";
import { toTaskDto } from "../../src/services/task-service.js";

describe("loadEnv", () => {
  it("applies defaults", () => {
    expect(loadEnv({ DATABASE_URL: "postgres://u:p@localhost:5432/db" })).toEqual({
      DATABASE_URL: "postgres://u:p@localhost:5432/db",
      PORT: 3000,
      WEB_ORIGIN: "http://localhost:5173",
      NODE_ENV: "development",
      LOG_LEVEL: "info",
    });
  });

  it("coerces PORT and fails fast on bad values", () => {
    expect(loadEnv({ DATABASE_URL: "postgresql://h/db", PORT: "8080" }).PORT).toBe(8080);
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: "postgres://h/db", PORT: "99999" })).toThrow(/PORT/);
    expect(() => loadEnv({ DATABASE_URL: "postgres://h/db", NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });

  it("rejects non-postgres URLs without echoing the value", () => {
    const secret = "mysql://admin:hunter2-secret@db/app";
    expect(() => loadEnv({ DATABASE_URL: secret })).toThrow(/DATABASE_URL/);
    try {
      loadEnv({ DATABASE_URL: secret });
    } catch (err) {
      expect((err as Error).message).not.toContain("hunter2");
    }
  });
});

describe("readCookie", () => {
  it("finds a cookie among others", () => {
    expect(readCookie("theme=dark; sid=abc123; lang=en", "sid")).toBe("abc123");
  });

  it("decodes percent-encoding and ignores lookalike names", () => {
    expect(readCookie("xsid=nope; sid=a%2Bb", "sid")).toBe("a+b");
  });

  it("returns undefined when absent or malformed", () => {
    expect(readCookie(undefined, "sid")).toBeUndefined();
    expect(readCookie("theme=dark", "sid")).toBeUndefined();
    expect(readCookie("garbage; sid=%E0%A4%A", "sid")).toBeUndefined();
  });
});

describe("toTaskDto", () => {
  it("serializes timestamps as ISO strings and drops userId", () => {
    const created = new Date("2026-03-01T10:00:00Z");
    expect(
      toTaskDto({ id: "t1", userId: "u1", title: "x", done: true, createdAt: created, updatedAt: created }),
    ).toEqual({ id: "t1", title: "x", done: true, createdAt: "2026-03-01T10:00:00.000Z", updatedAt: "2026-03-01T10:00:00.000Z" });
  });
});
