import * as z from "zod";

// PostgreSQL text cannot store NUL (0x00); reject it here so it is a 400, not a 500 from the driver.
const title = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !value.includes("\u0000"), { error: "Title must not contain NUL characters" });

export const Task = z
  .object({
    id: z.uuid(),
    title: z.string(),
    done: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "Task" });
export type Task = z.infer<typeof Task>;

export const CreateTaskInput = z.object({ title }).meta({ id: "CreateTaskInput" });
export type CreateTaskInput = z.infer<typeof CreateTaskInput>;

export const UpdateTaskInput = z
  .object({ title: title.optional(), done: z.boolean().optional() })
  .refine((value) => value.title !== undefined || value.done !== undefined, {
    error: "Provide at least one of: title, done",
  })
  .meta({ id: "UpdateTaskInput" });
export type UpdateTaskInput = z.infer<typeof UpdateTaskInput>;

export const TaskListQuery = z.object({
  done: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
});
export type TaskListQuery = z.infer<typeof TaskListQuery>;

export const TaskIdParams = z.object({ id: z.uuid() });

export const TaskResponse = z.object({ task: Task }).meta({ id: "TaskResponse" });
export type TaskResponse = z.infer<typeof TaskResponse>;

export const TaskListResponse = z.object({ tasks: z.array(Task) }).meta({ id: "TaskListResponse" });
export type TaskListResponse = z.infer<typeof TaskListResponse>;
