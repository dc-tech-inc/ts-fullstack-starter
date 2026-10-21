import request from "supertest";
import { expect, it } from "vitest";
import { hashToken } from "../../src/services/auth-service.js";
import { describeDb, PASSWORD, signUp, useTestDb } from "./helpers.js";

const sidCookie = (res: request.Response) => {
  const cookies = res.headers["set-cookie"] as unknown as string[] | undefined;
  return cookies?.find((cookie) => cookie.startsWith("sid="));
};

describeDb("auth (Postgres)", () => {
  const db = useTestDb();

  it("registers, reads the session, logs out and rejects the old session", async () => {
    const agent = request.agent(db.app());
    const res = await agent.post("/api/auth/register").send({ email: "Ada@Example.com", password: PASSWORD }).expect(201);

    expect(res.body.user).toEqual({ id: expect.any(String), email: "ada@example.com" });
    const cookie = sidCookie(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Max-Age=86400/);
    expect(cookie).not.toMatch(/Secure/);

    await agent.get("/api/auth/me").expect(200, { user: res.body.user });
    await agent.post("/api/auth/logout").expect(204);
    const { rows } = await db.pool().query("SELECT count(*)::int AS n FROM sessions");
    expect(rows[0].n).toBe(0);
    await agent.get("/api/auth/me").expect(401);
  });

  it("logs in with the right password and stores only the token hash", async () => {
    const app = db.app();
    await signUp(app, "grace@example.com");

    const res = await request(app).post("/api/auth/login").send({ email: "GRACE@example.com", password: PASSWORD }).expect(200);
    expect(res.body.user.email).toBe("grace@example.com");

    const token = sidCookie(res)?.split(";")[0]?.slice("sid=".length) ?? "";
    const { rows } = await db.pool().query("SELECT id FROM sessions WHERE id = $1", [hashToken(token)]);
    expect(rows).toHaveLength(1);
    const raw = await db.pool().query("SELECT id FROM sessions WHERE id = $1", [token]);
    expect(raw.rows).toHaveLength(0);
  });

  it("stores an argon2id hash, never the password", async () => {
    await signUp(db.app(), "hash@example.com");
    const { rows } = await db.pool().query("SELECT password_hash FROM users");
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(rows[0].password_hash).not.toContain(PASSWORD);
  });

  it("returns 409 for a duplicate email, case-insensitively", async () => {
    const app = db.app();
    await signUp(app, "dup@example.com");
    const res = await request(app).post("/api/auth/register").send({ email: "DUP@example.com", password: PASSWORD }).expect(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("answers wrong password and unknown email with the same 401", async () => {
    const app = db.app();
    await signUp(app, "known@example.com");

    const wrong = await request(app).post("/api/auth/login").send({ email: "known@example.com", password: "not the password" });
    const unknown = await request(app).post("/api/auth/login").send({ email: "nobody@example.com", password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual({ error: { code: "UNAUTHORIZED", message: "Invalid credentials" } });
    expect(unknown.body).toEqual(wrong.body);
  });

  it("rejects and deletes an expired session", async () => {
    const { agent } = await signUp(db.app(), "late@example.com");
    await db.pool().query("UPDATE sessions SET expires_at = now() - interval '1 second'");

    const res = await agent.get("/api/auth/me").expect(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    const { rows } = await db.pool().query("SELECT count(*)::int AS n FROM sessions");
    expect(rows[0].n).toBe(0);
  });

  it("rejects an unknown session token", async () => {
    await request(db.app()).get("/api/auth/me").set("Cookie", "sid=not-a-real-token").expect(401);
  });

  it("validates credentials and reports field details", async () => {
    const app = db.app();
    const res = await request(app).post("/api/auth/register").send({ email: "bad", password: "short" }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(["email", "password"]);

    await request(app).post("/api/auth/register").expect(400);
  });

  it("marks the cookie Secure when secureCookies is on", async () => {
    const res = await request(db.app({ secureCookies: true }))
      .post("/api/auth/register")
      .send({ email: "secure@example.com", password: PASSWORD })
      .expect(201);
    expect(sidCookie(res)).toMatch(/; Secure/);
  });

  it("rate limits login attempts with 429 after 10 tries", async () => {
    const app = db.app();
    for (let attempt = 0; attempt < 10; attempt++) {
      await request(app).post("/api/auth/login").send({ email: "x@example.com", password: PASSWORD }).expect(401);
    }
    const res = await request(app).post("/api/auth/login").send({ email: "x@example.com", password: PASSWORD }).expect(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.headers["ratelimit"]).toBeDefined();
  });
});
