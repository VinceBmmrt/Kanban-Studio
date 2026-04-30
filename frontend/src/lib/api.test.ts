import { describe, it, expect, beforeEach, vi } from "vitest";
import { apiFetch, fetchBoard, apiRenameColumn, apiCreateCard, apiDeleteCard, apiMoveCard } from "./api";
import { initialData } from "./kanban";

describe("apiFetch", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  });

  it("adds Authorization header when token exists", async () => {
    localStorage.setItem("token", "my-token");
    await apiFetch("/api/hello");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/hello",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer my-token" }),
      })
    );
  });

  it("omits Authorization header when no token", async () => {
    await apiFetch("/api/hello");
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>)?.Authorization).toBeUndefined();
  });
});

describe("typed API helpers", () => {
  beforeEach(() => {
    localStorage.setItem("token", "test-token");
  });

  it("fetchBoard parses board data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(initialData), { status: 200 }))
    );
    const board = await fetchBoard();
    expect(board.columns).toHaveLength(5);
  });

  it("fetchBoard throws on error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await expect(fetchBoard()).rejects.toThrow("Failed to load board");
  });

  it("apiRenameColumn sends PUT with title", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    await apiRenameColumn("col-backlog", "To Do");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/board/column/col-backlog",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ title: "To Do" }) })
    );
  });

  it("apiCreateCard returns the new card", async () => {
    const card = { id: "card-x", title: "X", details: "" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(card), { status: 200 }))
    );
    const result = await apiCreateCard("col-backlog", "X", "");
    expect(result).toEqual(card);
  });

  it("apiDeleteCard sends DELETE", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    await apiDeleteCard("card-1");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/board/card/card-1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("apiMoveCard sends PUT with column_id and position", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    await apiMoveCard("card-1", "col-done", 2);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/board/card/card-1/move",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ column_id: "col-done", position: 2 }),
      })
    );
  });
});
