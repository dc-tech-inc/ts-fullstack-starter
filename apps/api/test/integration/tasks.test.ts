import request from "supertest";
import { expect, it } from "vitest";
import { describeDb, signUp, useTestDb } from "./helpers.js";

const MISSING_ID = "00000000-0000-4000-8000-000000000000";

describeDb("tasks (Postgres)", () => {
  const db = useTestDb();

  it("requires a session", async () => {
    const res = await request(db.app()).get("/api/tasks").expect(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("creates, lists, filters, updates and deletes tasks", async () => {
    const { agent } = await signUp(db.app(), "owner@example.com");

    const first = await agent.post("/api/tasks").send({ title: "  write tests  " }).expect(201);
    expect(first.body.task).toMatchObject({ title: "write tests", done: false });
    const second = await agent.post("/api/tasks").send({ title: "ship it" }).expect(201);

    const all = await agent.get("/api/tasks").expect(200);
    expect(all.body.tasks.map((t: { title: string }) => t.title)).toEqual(["ship it", "write tests"]);

    const patched = await agent.patch(`/api/tasks/${first.body.task.id}`).send({ done: true }).expect(200);
    expect(patched.body.task.done).toBe(true);
    expect(Date.parse(patched.body.task.updatedAt)).toBeGreaterThanOrEqual(Date.parse(first.body.task.updatedAt));

    const done = await agent.get("/api/tasks?done=true").expect(200);
    expect(done.body.tasks.map((t: { id: string }) => t.id)).toEqual([first.body.task.id]);
    const open = await agent.get("/api/tasks?done=false").expect(200);
    expect(open.body.tasks.map((t: { id: string }) => t.id)).toEqual([second.body.task.id]);

    const renamed = await agent.patch(`/api/tasks/${second.body.task.id}`).send({ title: "ship it today" }).expect(200);
    expect(renamed.body.task.title).toBe("ship it today");

    await agent.delete(`/api/tasks/${first.body.task.id}`).expect(204);
    await agent.delete(`/api/tasks/${first.body.task.id}`).expect(404);
    const left = await agent.get("/api/tasks").expect(200);
    expect(left.body.tasks).toHaveLength(1);
  });

  it("hides one user's tasks from another with 404, never 403", async () => {
    const app = db.app();
    const alice = await signUp(app, "alice@example.com");
    const bob = await signUp(app, "bob@example.com");
    const { body } = await alice.agent.post("/api/tasks").send({ title: "alice's secret" }).expect(201);
    const id = body.task.id as string;

    const bobList = await bob.agent.get("/api/tasks").expect(200);
    expect(bobList.body.tasks).toEqual([]);

    const patch = await bob.agent.patch(`/api/tasks/${id}`).send({ done: true }).expect(404);
    expect(patch.body.error).toEqual({ code: "NOT_FOUND", message: "Task not found" });
    await bob.agent.delete(`/api/tasks/${id}`).expect(404);

    const aliceList = await alice.agent.get("/api/tasks").expect(200);
    expect(aliceList.body.tasks).toEqual([expect.objectContaining({ id, done: false, title: "alice's secret" })]);
  });

  it("validates input", async () => {
    const { agent } = await signUp(db.app(), "strict@example.com");
    const { body } = await agent.post("/api/tasks").send({ title: "valid" }).expect(201);

    for (const res of [
      await agent.post("/api/tasks").send({ title: "" }),
      await agent.post("/api/tasks").send({ title: "x".repeat(201) }),
      await agent.post("/api/tasks").send({ title: "a\u0000b" }),
      await agent.patch(`/api/tasks/${body.task.id}`).send({ title: "a\u0000b" }),
      await agent.patch(`/api/tasks/${body.task.id}`).send({}),
      await agent.patch(`/api/tasks/${body.task.id}`).send({ done: "yes" }),
      await agent.patch("/api/tasks/not-a-uuid").send({ done: true }),
      await agent.get("/api/tasks?done=maybe"),
    ]) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("returns 404 for a well-formed id that does not exist", async () => {
    const { agent } = await signUp(db.app(), "ghost@example.com");
    await agent.patch(`/api/tasks/${MISSING_ID}`).send({ done: true }).expect(404);
    await agent.delete(`/api/tasks/${MISSING_ID}`).expect(404);
  });

  it("deletes a user's tasks when the user row is deleted", async () => {
    const { agent, user } = await signUp(db.app(), "gone@example.com");
    await agent.post("/api/tasks").send({ title: "orphan?" }).expect(201);
    await db.pool().query("DELETE FROM users WHERE id = $1", [user.id]);
    const { rows } = await db.pool().query("SELECT count(*)::int AS n FROM tasks");
    expect(rows[0].n).toBe(0);
  });
});
