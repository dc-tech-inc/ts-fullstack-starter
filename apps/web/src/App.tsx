import type { PublicUser } from "@app/shared";
import { useEffect, useState } from "react";
import { api } from "./api/client";
import { AuthForm } from "./features/auth/AuthForm";
import { TaskList } from "./features/tasks/TaskList";

export function App() {
  // undefined = still checking the session cookie, null = signed out.
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);

  useEffect(() => {
    api.me().then(setUser, () => setUser(null));
  }, []);

  if (user === undefined) return <main className="container">Loading…</main>;
  if (user === null) {
    return (
      <main className="container">
        <AuthForm onAuthenticated={setUser} />
      </main>
    );
  }

  return (
    <main className="container">
      <header className="row">
        <span className="grow muted">Signed in as {user.email}</span>
        <button type="button" className="link" onClick={() => void api.logout().finally(() => setUser(null))}>
          Log out
        </button>
      </header>
      <TaskList />
    </main>
  );
}
