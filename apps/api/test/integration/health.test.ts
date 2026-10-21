import request from "supertest";
import { it } from "vitest";
import { describeDb, useTestDb } from "./helpers.js";

describeDb("health (Postgres)", () => {
  const db = useTestDb();

  it("reports the database as reachable", async () => {
    await request(db.app()).get("/health").expect(200, { status: "ok", db: "ok" });
  });
});
