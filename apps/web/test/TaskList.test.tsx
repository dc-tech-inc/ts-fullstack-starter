import type { Task } from "@app/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../src/api/client";
import { TaskList } from "../src/features/tasks/TaskList";

const task = (id: string, title: string, done = false): Task => ({
  id,
  title,
  done,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("TaskList", () => {
  beforeEach(() => {
    vi.spyOn(api, "listTasks").mockResolvedValue([task("1", "write tests"), task("2", "ship it", true)]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the user's tasks", async () => {
    render(<TaskList />);
    expect(await screen.findByText("write tests")).toBeDefined();
    expect(screen.getByRole("checkbox", { name: "ship it" })).toHaveProperty("checked", true);
  });

  it("creates a task and reloads the list", async () => {
    const create = vi.spyOn(api, "createTask").mockResolvedValue(task("3", "new one"));
    render(<TaskList />);
    await screen.findByText("write tests");

    fireEvent.change(screen.getByPlaceholderText("What needs doing?"), { target: { value: "new one" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await vi.waitFor(() => expect(create).toHaveBeenCalledWith({ title: "new one" }));
    await vi.waitFor(() => expect(api.listTasks).toHaveBeenCalledTimes(2));
  });

  it("asks the API for done tasks when the filter changes", async () => {
    render(<TaskList />);
    await screen.findByText("write tests");
    fireEvent.click(within(screen.getByRole("group", { name: "Filter tasks" })).getByRole("button", { name: "done" }));
    await vi.waitFor(() => expect(api.listTasks).toHaveBeenLastCalledWith({ done: true }));
  });

  it("toggles and deletes through the API", async () => {
    const update = vi.spyOn(api, "updateTask").mockResolvedValue(task("1", "write tests", true));
    const remove = vi.spyOn(api, "deleteTask").mockResolvedValue();
    render(<TaskList />);

    fireEvent.click(await screen.findByRole("checkbox", { name: "write tests" }));
    await vi.waitFor(() => expect(update).toHaveBeenCalledWith("1", { done: true }));

    fireEvent.click(screen.getByRole("button", { name: 'Delete "ship it"' }));
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith("2"));
  });

  it("shows API errors to the user", async () => {
    vi.spyOn(api, "createTask").mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "Request validation failed"));
    render(<TaskList />);
    await screen.findByText("write tests");

    fireEvent.change(screen.getByPlaceholderText("What needs doing?"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Request validation failed");
  });
});
