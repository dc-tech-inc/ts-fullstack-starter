import type { Database } from "@app/db";
import { sql } from "drizzle-orm";
import { Router } from "express";

export function healthRouter(db: Database): Router {
  const router = Router();

  router.get("/health", async (req, res) => {
    try {
      await db.execute(sql`select 1`);
      res.json({ status: "ok", db: "ok" });
    } catch (err) {
      req.log.warn({ err }, "health check: database unreachable");
      res.status(503).json({ status: "unavailable", db: "down" });
    }
  });

  return router;
}
