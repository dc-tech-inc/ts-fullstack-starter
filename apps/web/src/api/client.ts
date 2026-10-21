import type {
  CreateTaskInput,
  Credentials,
  ErrorCode,
  ErrorResponse,
  PublicUser,
  Task,
  TaskListResponse,
  TaskResponse,
  UpdateTaskInput,
  UserResponse,
} from "@app/shared";

/** Thrown for every non-2xx response; mirrors the API's error envelope. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = init.body !== undefined;
  const res = await fetch(path, {
    method: init.method ?? "GET",
    credentials: "include",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (data as Partial<ErrorResponse> | null)?.error;
    throw new ApiError(
      res.status,
      error?.code ?? "INTERNAL",
      error?.message ?? `Request failed with status ${res.status}`,
      error?.details,
    );
  }
  return data as T;
}

const post = (body?: unknown) => ({ method: "POST", body });

export const api = {
  register: (credentials: Credentials): Promise<PublicUser> =>
    request<UserResponse>("/api/auth/register", post(credentials)).then((r) => r.user),
  login: (credentials: Credentials): Promise<PublicUser> =>
    request<UserResponse>("/api/auth/login", post(credentials)).then((r) => r.user),
  logout: (): Promise<void> => request<void>("/api/auth/logout", post()),
  me: (): Promise<PublicUser> => request<UserResponse>("/api/auth/me").then((r) => r.user),

  listTasks: (filter: { done?: boolean } = {}): Promise<Task[]> => {
    const query = filter.done === undefined ? "" : `?done=${filter.done}`;
    return request<TaskListResponse>(`/api/tasks${query}`).then((r) => r.tasks);
  },
  createTask: (input: CreateTaskInput): Promise<Task> =>
    request<TaskResponse>("/api/tasks", post(input)).then((r) => r.task),
  updateTask: (id: string, patch: UpdateTaskInput): Promise<Task> =>
    request<TaskResponse>(`/api/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }).then((r) => r.task),
  deleteTask: (id: string): Promise<void> =>
    request<void>(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export type Api = typeof api;
