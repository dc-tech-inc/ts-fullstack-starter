import { OpenAPIRegistry, OpenApiGeneratorV31, type ResponseConfig } from "@asteasolutions/zod-to-openapi";
import {
  CreateTaskInput,
  Credentials,
  ErrorResponse,
  TaskIdParams,
  TaskListQuery,
  TaskListResponse,
  TaskResponse,
  UpdateTaskInput,
  UserResponse,
} from "@app/shared";
import * as z from "zod";

export const HealthResponse = z
  .object({ status: z.enum(["ok", "unavailable"]), db: z.enum(["ok", "down"]) })
  .meta({ id: "HealthResponse" });

const json = (description: string, schema: z.ZodType): ResponseConfig => ({
  description,
  content: { "application/json": { schema } },
});
const body = (schema: z.ZodType) => ({ body: { required: true, content: { "application/json": { schema } } } });
const noContent = (description: string): ResponseConfig => ({ description });

const validationError = json("Request validation failed", ErrorResponse);
const unauthorized = json("Missing, invalid or expired session", ErrorResponse);
const rateLimited = json("Too many requests", ErrorResponse);
const notFound = json("Task does not exist or belongs to another user", ErrorResponse);

/** Builds the OpenAPI 3.1 document from the same zod schemas the routes validate with. */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  const security = [{ sessionCookie: [] }];
  registry.registerComponent("securitySchemes", "sessionCookie", { type: "apiKey", in: "cookie", name: "sid" });

  registry.registerPath({
    method: "get",
    path: "/health",
    summary: "Liveness and database connectivity",
    responses: { 200: json("Healthy", HealthResponse), 503: json("Database unreachable", HealthResponse) },
  });
  registry.registerPath({
    method: "get",
    path: "/openapi.json",
    summary: "This document",
    responses: { 200: { description: "OpenAPI 3.1 document" } },
  });

  registry.registerPath({
    method: "post",
    path: "/api/auth/register",
    summary: "Create an account and start a session",
    request: body(Credentials),
    responses: {
      201: json("Registered; sets the sid cookie", UserResponse),
      400: validationError,
      409: json("Email already registered", ErrorResponse),
      429: rateLimited,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/auth/login",
    summary: "Start a session",
    request: body(Credentials),
    responses: {
      200: json("Logged in; sets the sid cookie", UserResponse),
      400: validationError,
      401: json("Invalid credentials (same message for unknown email and wrong password)", ErrorResponse),
      429: rateLimited,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/auth/logout",
    summary: "End the current session",
    security,
    responses: { 204: noContent("Session deleted, cookie cleared"), 401: unauthorized },
  });
  registry.registerPath({
    method: "get",
    path: "/api/auth/me",
    summary: "Current user",
    security,
    responses: { 200: json("Current user", UserResponse), 401: unauthorized },
  });

  registry.registerPath({
    method: "get",
    path: "/api/tasks",
    summary: "List your tasks, newest first",
    security,
    request: { query: TaskListQuery },
    responses: { 200: json("Your tasks", TaskListResponse), 400: validationError, 401: unauthorized },
  });
  registry.registerPath({
    method: "post",
    path: "/api/tasks",
    summary: "Create a task",
    security,
    request: body(CreateTaskInput),
    responses: { 201: json("Created", TaskResponse), 400: validationError, 401: unauthorized },
  });
  registry.registerPath({
    method: "patch",
    path: "/api/tasks/{id}",
    summary: "Update a task's title and/or done flag",
    security,
    request: { params: TaskIdParams, ...body(UpdateTaskInput) },
    responses: { 200: json("Updated", TaskResponse), 400: validationError, 401: unauthorized, 404: notFound },
  });
  registry.registerPath({
    method: "delete",
    path: "/api/tasks/{id}",
    summary: "Delete a task",
    security,
    request: { params: TaskIdParams },
    responses: { 204: noContent("Deleted"), 400: validationError, 401: unauthorized, 404: notFound },
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "ts-fullstack-starter API",
      version: "0.1.0",
      description: "Personal task list API. Errors always use the ErrorResponse envelope.",
      license: { name: "MIT" },
    },
  });
}
