import { tasks, type Database, type TaskRow } from "@app/db";
import type { Task, UpdateTaskInput } from "@app/shared";
import { and, desc, eq, sql } from "drizzle-orm";

export const toTaskDto = (row: TaskRow): Task => ({
  id: row.id,
  title: row.title,
  done: row.done,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export type TaskService = ReturnType<typeof createTaskService>;

/** Every query is scoped by userId, so one user can never see or touch another user's rows. */
export function createTaskService(db: Database) {
  const owned = (userId: string, id: string) => and(eq(tasks.id, id), eq(tasks.userId, userId));

  return {
    async list(userId: string, done?: boolean): Promise<Task[]> {
      const rows = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, userId), done === undefined ? undefined : eq(tasks.done, done)))
        .orderBy(desc(tasks.createdAt), desc(tasks.id));
      return rows.map(toTaskDto);
    },

    async create(userId: string, title: string): Promise<Task> {
      const [row] = await db.insert(tasks).values({ userId, title }).returning();
      if (!row) throw new Error("insert returned no row");
      return toTaskDto(row);
    },

    async update(userId: string, id: string, patch: UpdateTaskInput): Promise<Task | null> {
      const [row] = await db
        .update(tasks)
        // Database clock, same source as the created_at default, so timestamps never go backwards.
        .set({ ...patch, updatedAt: sql`now()` })
        .where(owned(userId, id))
        .returning();
      return row ? toTaskDto(row) : null;
    },

    async remove(userId: string, id: string): Promise<boolean> {
      const deleted = await db.delete(tasks).where(owned(userId, id)).returning({ id: tasks.id });
      return deleted.length > 0;
    },
  };
}
