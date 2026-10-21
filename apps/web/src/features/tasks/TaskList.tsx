import type { Task } from "@app/shared";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";

type Filter = "all" | "open" | "done";
const FILTER_QUERY: Record<Filter, { done?: boolean }> = { all: {}, open: { done: false }, done: { done: true } };

const messageOf = (err: unknown) => (err instanceof ApiError ? err.message : "Could not reach the server");

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumped after every mutation to refetch the list from the server.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    // Ignore responses that arrive after the filter changed or the component unmounted.
    let stale = false;
    api.listTasks(FILTER_QUERY[filter]).then(
      (list) => {
        if (stale) return;
        setTasks(list);
        setLoading(false);
      },
      (err: unknown) => {
        if (stale) return;
        setError(messageOf(err));
        setLoading(false);
      },
    );
    return () => {
      stale = true;
    };
  }, [filter, version]);

  async function mutate(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      setVersion((v) => v + 1);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  const add = (event: FormEvent) => {
    event.preventDefault();
    void mutate(async () => {
      await api.createTask({ title });
      setTitle("");
    });
  };
  const toggle = (task: Task) => mutate(() => api.updateTask(task.id, { done: !task.done }));
  const remove = (task: Task) => mutate(() => api.deleteTask(task.id));

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
