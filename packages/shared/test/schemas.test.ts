import { describe, expect, it } from "vitest";
import { Credentials, ErrorResponse, TaskListQuery, UpdateTaskInput, CreateTaskInput } from "../src/index.js";

describe("Credentials", () => {
  it("lower-cases the email", () => {
    const parsed = Credentials.parse({ email: "Ada@Example.COM", password: "correct horse battery" });
    expect(parsed.email).toBe("ada@example.com");
  });

  it("rejects passwords shorter than 12 characters", () => {
    expect(Credentials.safeParse({ email: "a@example.com", password: "short" }).success).toBe(false);
  });

  it("rejects passwords longer than 128 characters", () => {
    const result = Credentials.safeParse({ email: "a@example.com", password: "x".repeat(129) });
    expect(result.success).toBe(false);
  });

  it("rejects malformed emails", () => {
    expect(Credentials.safeParse({ email: "not-an-email", password: "x".repeat(12) }).success).toBe(false);
  });
});

describe("task inputs", () => {
  it("trims titles and rejects blank ones", () => {
    expect(CreateTaskInput.parse({ title: "  buy milk  " }).title).toBe("buy milk");
    expect(CreateTaskInput.safeParse({ title: "   " }).success).toBe(false);
  });

  it("rejects titles longer than 200 characters", () => {
    expect(CreateTaskInput.safeParse({ title: "x".repeat(201) }).success).toBe(false);
  });

  it("rejects NUL characters, which PostgreSQL text cannot store", () => {
    expect(CreateTaskInput.safeParse({ title: "a\u0000b" }).success).toBe(false);
    expect(UpdateTaskInput.safeParse({ title: "a\u0000b" }).success).toBe(false);
    expect(CreateTaskInput.safeParse({ title: "a0000b" }).success).toBe(true);
  });

  it("requires at least one field on update", () => {
    expect(UpdateTaskInput.safeParse({}).success).toBe(false);
    expect(UpdateTaskInput.safeParse({ done: true }).success).toBe(true);
  });

  it("parses the done filter from a query string", () => {
    expect(TaskListQuery.parse({ done: "true" })).toEqual({ done: true });
    expect(TaskListQuery.parse({ done: "false" })).toEqual({ done: false });
    expect(TaskListQuery.parse({})).toEqual({});
    expect(TaskListQuery.safeParse({ done: "yes" }).success).toBe(false);
  });
});

describe("ErrorResponse", () => {
  it("only accepts known error codes", () => {
    expect(ErrorResponse.safeParse({ error: { code: "NOT_FOUND", message: "x" } }).success).toBe(true);
    expect(ErrorResponse.safeParse({ error: { code: "TEAPOT", message: "x" } }).success).toBe(false);
  });
});
