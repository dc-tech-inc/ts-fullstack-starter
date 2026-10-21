import type { Database } from "@app/db";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createLogger } from "../../src/logger.js";

// These routes never reach a query, or only call db.execute, so a stub is enough.
const appWith = (db: Partial<Database>) =>
  createApp({
    db: db as Database,
    logger: createLogger("silent"),
    webOrigin: "http://localhost:5173",
    secureCookies: false,
  });

const unreachableDb = { execute: () => Promise.reject(new Error("connect ECONNREFUSED")) } as unknown as Partial<Database>;

describe("createApp without a database", () => {
  it("reports 503 from /health when the database is down", async () => {
    await request(appWith(unreachableDb)).get("/health").expect(503, { status: "unavailable", db: "down" });
  });

  it("serves an OpenAPI 3.1 document listing every route", async () => {
    const res = await request(appWith({})).get("/openapi.json").expect(200);
    expect(res.body.openapi).toBe("3.1.0");

    const operations = Object.entries(res.body.paths as Record<string, object>).flatMap(([path, item]) =>
      Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(operations.sort()).toEqual(
      [
        "GET /health",
        "GET /openapi.json",
        "POST /api/auth/register",
        "POST /api/auth/login",
        "POST /api/auth/logout",
        "GET /api/auth/me",
        "GET /api/tasks",
        "POST /api/tasks",
        "PATCH /api/tasks/{id}",
        "DELETE /api/tasks/{id}",
      ].sort(),
    );
    expect(Object.keys(res.body.components.schemas)).toEqual(
      expect.arrayContaining(["Task", "Credentials", "ErrorResponse", "UserResponse"]),
    );
  });

  it("returns the error envelope for unknown routes", async () => {
    const res = await request(appWith({})).get("/nope").expect(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });

  it("rejects protected routes without a cookie before touching the database", async () => {
    await request(appWith({})).get("/api/tasks").expect(401);
    await request(appWith({})).post("/api/auth/logout").expect(401);
  });

  it("rejects malformed and oversized JSON bodies", async () => {
    const app = appWith({});
    const bad = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{oops").expect(400);
    expect(bad.body.error).toEqual({ code: "VALIDATION_ERROR", message: "Malformed JSON body" });
    await request(app).post("/api/auth/login").send({ email: "a@example.com", password: "x".repeat(110_000) }).expect(413);
  });

  it("sets security headers and only allows the configured origin", async () => {
    const app = appWith({});
    const allowed = await request(app).get("/openapi.json").set("Origin", "http://localhost:5173");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(allowed.headers["x-content-type-options"]).toBe("nosniff");
    expect(allowed.headers["x-powered-by"]).toBeUndefined();

    // cors() with a fixed origin always answers with that origin; the browser blocks any other caller.
    const other = await request(app).get("/openapi.json").set("Origin", "https://evil.example");
    expect(other.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("applies the global rate limit", async () => {
    const app = createApp({
      db: {} as Database,
      logger: createLogger("silent"),
      webOrigin: "http://localhost:5173",
      secureCookies: false,
      rateLimits: { global: 2 },
    });
    await request(app).get("/api/tasks").expect(401);
    await request(app).get("/api/tasks").expect(401);
    const res = await request(app).get("/api/tasks").expect(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });
});
