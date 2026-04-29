import { describe, it, expect, beforeEach } from "vitest";
import { getToken, setToken, clearToken } from "./auth";

describe("auth helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("getToken returns null when not set", () => {
    expect(getToken()).toBeNull();
  });

  it("setToken stores the token", () => {
    setToken("abc123");
    expect(localStorage.getItem("token")).toBe("abc123");
  });

  it("getToken returns the stored token", () => {
    localStorage.setItem("token", "abc123");
    expect(getToken()).toBe("abc123");
  });

  it("clearToken removes the token", () => {
    localStorage.setItem("token", "abc123");
    clearToken();
    expect(localStorage.getItem("token")).toBeNull();
  });
});
