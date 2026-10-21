import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../src/api/client";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("sends JSON with credentials and unwraps the payload", async () => {
    const fetchMock = mockFetch(jsonResponse(201, { task: { id: "t1", title: "x", done: false } }));

    const task = await api.createTask({ title: "x" });

    expect(task).toEqual({ id: "t1", title: "x", done: false });
    expect(fetchMock).toHaveBeenCalledWith("/api/tasks", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    });
  });

  it("builds the done filter into the query string", async () => {
    const fetchMock = mockFetch(jsonResponse(200, { tasks: [] }));
    await api.listTasks({ done: false });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/tasks?done=false");
  });

  it("resolves to undefined on 204", async () => {
    mockFetch(new Response(null, { status: 204 }));
    await expect(api.deleteTask("a/b")).resolves.toBeUndefined();
  });

  it("throws a typed ApiError from the error envelope", async () => {
    mockFetch(jsonResponse(404, { error: { code: "NOT_FOUND", message: "Task not found" } }));
    const error = await api.updateTask("t1", { done: true }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: "NOT_FOUND", message: "Task not found" });
  });

  it("falls back to INTERNAL when the body is not the envelope", async () => {
    mockFetch(new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(api.me()).rejects.toMatchObject({ status: 502, code: "INTERNAL" });
  });
});
