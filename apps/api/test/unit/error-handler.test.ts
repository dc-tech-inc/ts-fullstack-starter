import { CreateTaskInput } from "@app/shared";
import { DrizzleQueryError } from "drizzle-orm";
import express from "express";
import { pino } from "pino";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../../src/logger.js";
import { AppError, errorHandler, toErrorResponse } from "../../src/middleware/error-handler.js";

describe("toErrorResponse", () => {
  it("passes AppError status, code, message and details through", () => {
    expect(toErrorResponse(new AppError(409, "CONFLICT", "taken", { field: "email" }))).toEqual({
      status: 409,
      body: { error: { code: "CONFLICT", message: "taken", details: { field: "email" } } },
    });
  });

  it("omits details when there are none", () => {
    expect(toErrorResponse(new AppError(404, "NOT_FOUND", "gone")).body).toEqual({
      error: { code: "NOT_FOUND", message: "gone" },
    });
  });

  it("maps a ZodError to 400 with per-field details", () => {
    const result = CreateTaskInput.safeParse({ title: "" });
    if (result.success) throw new Error("expected a validation failure");
    const { status, body } = toErrorResponse(result.error);
    expect(status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual([{ path: "title", message: expect.any(String) }]);
  });

  it("maps body-parser errors to 400/413", () => {
    expect(toErrorResponse(Object.assign(new Error("x"), { status: 400, type: "entity.parse.failed" })).status).toBe(400);
    expect(toErrorResponse(Object.assign(new Error("x"), { status: 413, type: "entity.too.large" })).status).toBe(413);
    expect(toErrorResponse(Object.assign(new Error("x"), { status: 415, type: "encoding.unsupported" })).body.error).toEqual({
      code: "VALIDATION_ERROR",
      message: "Invalid request body",
    });
  });

  it("turns anything else into a generic 500", () => {
    expect(toErrorResponse(new Error("relation \"users\" does not exist"))).toEqual({
      status: 500,
      body: { error: { code: "INTERNAL", message: "Internal server error" } },
    });
    expect(toErrorResponse("a string").status).toBe(500);
  });
});

describe("errorHandler", () => {
  const appThatThrows = (err: unknown, logger: Logger) => {
    const app = express();
    app.get("/boom", async () => {
      throw err;
    });
    app.use(errorHandler(logger));
    return app;
  };

  it("logs 5xx errors and never leaks the message or stack to the client", async () => {
    const logger = { error: vi.fn() } as unknown as Logger;
    const res = await request(appThatThrows(new Error("SELECT * FROM secrets failed"), logger)).get("/boom").expect(500);

    expect(res.body).toEqual({ error: { code: "INTERNAL", message: "Internal server error" } });
    expect(JSON.stringify(res.body)).not.toMatch(/secrets|at /);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("logs database errors without the bound parameters", async () => {
    const lines: string[] = [];
    const logger = pino({}, { write: (line: string) => void lines.push(line) });
    const driverError = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    const queryError = new DrizzleQueryError(
      'insert into "users" ("email", "password_hash") values ($1, $2)',
      ["ada@example.com", "$argon2id$v=19$m=19456,p=1,t=2$c2FsdA$aGFzaA"],
      driverError,
    );

    await request(appThatThrows(queryError, logger)).get("/boom").expect(500);

    expect(lines).toHaveLength(1);
    const log = lines[0] ?? "";
    expect(log).toContain('insert into \\"users\\"');
    expect(log).toContain("23505");
    expect(log).not.toContain("ada@example.com");
    expect(log).not.toContain("$argon2id");
  });

  it("does not log expected 4xx errors", async () => {
    const logger = { error: vi.fn() } as unknown as Logger;
    await request(appThatThrows(new AppError(404, "NOT_FOUND", "nope"), logger)).get("/boom").expect(404);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
