import type { ErrorCode, ErrorResponse } from "@app/shared";
import { DrizzleQueryError } from "drizzle-orm";
import type { ErrorRequestHandler } from "express";
import * as z from "zod";
import type { Logger } from "../logger.js";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (message = "Not found") => new AppError(404, "NOT_FOUND", message);
export const unauthorized = (message = "Authentication required") => new AppError(401, "UNAUTHORIZED", message);

// Errors thrown by express.json() (body-parser) carry a numeric status and a type string.
function isBodyParserError(err: unknown): err is { status: number; type?: string } {
  return typeof err === "object" && err !== null && "status" in err && typeof err.status === "number";
}

export function toErrorResponse(err: unknown): { status: number; body: ErrorResponse } {
  const reply = (status: number, code: ErrorCode, message: string, details?: unknown) => ({
    status,
    body: { error: { code, message, ...(details === undefined ? {} : { details }) } },
  });

  if (err instanceof AppError) return reply(err.status, err.code, err.message, err.details);
  if (err instanceof z.ZodError) {
    const details = err.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message }));
    return reply(400, "VALIDATION_ERROR", "Request validation failed", details);
  }
  if (isBodyParserError(err) && err.status >= 400 && err.status < 500) {
    if (err.type === "entity.too.large") return reply(413, "VALIDATION_ERROR", "Request body too large");
    if (err.type === "entity.parse.failed") return reply(400, "VALIDATION_ERROR", "Malformed JSON body");
    return reply(400, "VALIDATION_ERROR", "Invalid request body");
  }
  return reply(500, "INTERNAL", "Internal server error");
}

/**
 * Drizzle puts the bound parameters (emails, password hashes, task titles) into its error message and
 * stack. Log the SQL text and the driver error instead, so user data never reaches the logs.
 */
export function loggableError(err: unknown): unknown {
  if (!(err instanceof DrizzleQueryError)) return err;
  const cause = err.cause as (Error & { code?: string }) | undefined;
  return {
    type: err.name,
    query: err.query,
    cause: cause && { type: cause.name, code: cause.code, message: cause.message, stack: cause.stack },
  };
}

/** Last middleware in the chain. 5xx details go to the log only; the client gets a generic message. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const { status, body } = toErrorResponse(err);
    if (status >= 500) (req.log ?? logger).error({ err: loggableError(err) }, "unhandled error");
    res.status(status).json(body);
  };
}
