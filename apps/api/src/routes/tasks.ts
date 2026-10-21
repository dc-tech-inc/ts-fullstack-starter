import {
  CreateTaskInput,
  TaskIdParams,
  TaskListQuery,
  UpdateTaskInput,
  type TaskListResponse,
  type TaskResponse,
} from "@app/shared";
import { Router } from "express";
import { getAuth, requireAuth } from "../middleware/auth.js";
import { notFound } from "../middleware/error-handler.js";
import type { AuthService } from "../services/auth-service.js";
import type { TaskService } from "../services/task-service.js";

// Another user's task answers 404, not 403, so ids cannot be probed for existence.
const taskNotFound = () => notFound("Task not found");

export function tasksRouter({ auth, tasks }: { auth: AuthService; tasks: TaskService }): Router {
  const router = Router();
  router.use(requireAuth(auth));

  router.get("/", async (req, res) => {
    const { done } = TaskListQuery.parse(req.query);
    res.json({ tasks: await tasks.list(getAuth(res).user.id, done) } satisfies TaskListResponse);
  });

  router.post("/", async (req, res) => {
    const { title } = CreateTaskInput.parse(req.body);
    res.status(201).json({ task: await tasks.create(getAuth(res).user.id, title) } satisfies TaskResponse);
  });

  router.patch("/:id", async (req, res) => {
    const { id } = TaskIdParams.parse(req.params);
    const task = await tasks.update(getAuth(res).user.id, id, UpdateTaskInput.parse(req.body));
    if (!task) throw taskNotFound();
    res.json({ task } satisfies TaskResponse);
  });

  router.delete("/:id", async (req, res) => {
    const { id } = TaskIdParams.parse(req.params);
    if (!(await tasks.remove(getAuth(res).user.id, id))) throw taskNotFound();
    res.status(204).end();
  });

  return router;
}
