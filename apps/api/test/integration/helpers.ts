import { createDb } from "@app/db";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe } from "vitest";
import { createApp, type AppDeps } from "../../src/app.js";
import { createLogger } from "../../src/logger.js";

const DATABASE_URL = process.env.DATABASE_URL;

/** describe() that is skipped (with the reason printed by global-setup) when no database is configured. */
export const describeDb = describe.skipIf(!DATABASE_URL);

export const PASSWORD = "correct horse battery staple";

/** Call inside describeDb: opens a pool, truncates all tables before each test, closes the pool after. */
export function useTestDb() {
  let handle: ReturnType<typeof createDb> | undefined;
  const get = () => {
    if (!handle) throw new Error("useTestDb() handle used outside a test");
    return handle;
  };

  beforeAll(() => {
    handle = createDb(DATABASE_URL as string);
  });
  beforeEach(async () => {
    await get().pool.query("TRUNCATE users, sessions, tasks CASCADE");
  });
  afterAll(async () => {
    await handle?.pool.end();
  });

  return {
    pool: () => get().pool,
    app: (overrides: Partial<AppDeps> = {}) =>
      createApp({
        db: get().db,
        logger: createLogger("silent"),
        webOrigin: "http://localhost:5173",
        secureCookies: false,
        ...overrides,
      }),
  };
}

/** Registers a user and returns an agent that carries the session cookie. */
export async function signUp(app: Parameters<typeof request.agent>[0], email: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send({ email, password: PASSWORD }).expect(201);
  return { agent, user: res.body.user as { id: string; email: string } };
}
