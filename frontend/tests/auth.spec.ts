import { test, expect } from "@playwright/test";

test("unauthenticated visit to / redirects to /login", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("**/login/**");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("login with wrong credentials shows error", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Username").fill("wrong");
  await page.getByPlaceholder("Password").fill("wrong");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
});

test("login with correct credentials shows board", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Username").fill("user");
  await page.getByPlaceholder("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
});

test("logout returns to /login and board is inaccessible", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Username").fill("user");
  await page.getByPlaceholder("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("/");
  await page.getByRole("button", { name: /log out/i }).click();
  await page.waitForURL("**/login/**");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
