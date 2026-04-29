import { describe, it, expect, beforeEach, vi } from "vitest";
import { apiFetch } from "./api";

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
