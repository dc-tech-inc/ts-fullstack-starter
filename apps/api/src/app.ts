import type { Database } from "@app/db";
import cors from "cors";
import express, { type Express } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Logger } from "./logger.js";
import { AppError, errorHandler } from "./middleware/error-handler.js";
import { buildOpenApiDocument } from "./openapi.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { tasksRouter } from "./routes/tasks.js";
import { createAuthService } from "./services/auth-service.js";
import { createTaskService } from "./services/task-service.js";

export interface AppDeps {
  db: Database;
  logger: Logger;
  webOrigin: string;
  /** Adds the Secure flag to the session cookie. True in production (HTTPS only). */
  secureCookies: boolean;
  /** Requests per 15-minute window per IP. */
  rateLimits?: { global?: number; credentials?: number };
}

const WINDOW_MS = 15 * 60 * 1000;

function limiter(limit: number) {
  // ponytail: in-memory store, counts are per process; use a shared store (e.g. Redis) when running more than one instance.
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(429, "RATE_LIMITED", "Too many requests, try again later")),
  });
}

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function createApp({ db, logger, webOrigin, secureCookies, rateLimits = {} }: AppDeps): Express {
  const app = express();
  const auth = createAuthService(db);
  const openapi = buildOpenApiDocument();

  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(cors({ origin: webOrigin, credentials: true }));
  app.use(express.json({ limit: "100kb" }));

  // Probes and docs sit before the global limiter so monitoring is never throttled.
  app.use(healthRouter(db));
  app.get("/openapi.json", (_req, res) => {
    res.json(openapi);
  });

  app.use(limiter(rateLimits.global ?? 300));
  app.use(
    "/api/auth",
    authRouter({ auth, secureCookies, credentialLimiter: limiter(rateLimits.credentials ?? 10) }),
  );
  app.use("/api/tasks", tasksRouter({ auth, tasks: createTaskService(db) }));

  app.use((_req, _res, next) => next(new AppError(404, "NOT_FOUND", "Route not found")));
  app.use(errorHandler(logger));
  return app;
}
