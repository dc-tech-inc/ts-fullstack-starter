import type { Task } from "@app/shared";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";

type Filter = "all" | "open" | "done";
const FILTER_QUERY: Record<Filter, { done?: boolean }> = { all: {}, open: { done: false }, done: { done: true } };

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server");
    }
  }, []);

  const reload = useCallback(
    () =>
      run(async () => {
        setTasks(await api.listTasks(FILTER_QUERY[filter]));
      }).finally(() => setLoading(false)),
    [filter, run],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api.createTask({ title });
      setTitle("");
      await reload();
    });
  };
  const toggle = (task: Task) =>
    run(async () => {
      await api.updateTask(task.id, { done: !task.done });
      await reload();
    });
  const remove = (task: Task) =>
    run(async () => {
      await api.deleteTask(task.id);
      await reload();
    });

  return (
    <section className="card">
      <form className="row" onSubmit={add}>
        <label className="grow">
          <span className="visually-hidden">New task</span>
          <input placeholder="What needs doing?" maxLength={200} required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <button type="submit">Add</button>
      </form>

      <div className="row" role="group" aria-label="Filter tasks">
        {(Object.keys(FILTER_QUERY) as Filter[]).map((name) => (
          <button key={name} type="button" aria-pressed={filter === name} onClick={() => setFilter(name)}>
            {name}
          </button>
        ))}
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="muted">No tasks here.</p>
      ) : (
        <ul className="tasks">
          {tasks.map((task) => (
            <li key={task.id} className={task.done ? "done" : undefined}>
              <label className="grow">
                <input type="checkbox" checked={task.done} onChange={() => void toggle(task)} />
                {task.title}
              </label>
              <button type="button" className="link" aria-label={`Delete "${task.title}"`} onClick={() => void remove(task)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
