# Code Review — Kanban Studio

**Reviewed:** 2026-04-30  
**Scope:** Full repository — backend (Python/FastAPI), frontend (Next.js/React), Dockerfile, tests  
**Test results at time of review:** 23 backend + 26 frontend unit tests passing; 8/9 e2e passing (1 failure detailed below)

---

## Summary

The overall codebase is clean, well-structured, and demonstrably working. Tests are meaningful and cover the critical paths. The primary concerns are around security model gaps (tokens, AI mutation ownership), a few production-build issues, and thin test coverage in specific areas.

---

## Critical

### C1 — AI router mutations are not user-scoped

**File:** `backend/routers/ai.py` lines 108–145

When the AI returns `update_cards` or `delete_card_ids`, the backend queries cards by ID without verifying they belong to the current user's board:

```python
row = conn.execute(
    "SELECT title, details, column_id, position FROM cards WHERE id = ?", (uc.id,)
).fetchone()
```

A user who knows another user's card ID (e.g. from guessing the `card-{8hex}` pattern) could instruct the AI to modify or delete it. The board router correctly uses a `JOIN` through `columns → boards → user_id`; the AI router must do the same.

**Fix:** Before applying any mutation, verify the card belongs to the authenticated user's board by joining through the columns/boards tables.

---

### C2 — Auth tokens never expire and survive indefinitely

**File:** `backend/auth.py`

Tokens (UUID strings in a memory dict) have no TTL. A stolen token is permanently valid until the user explicitly logs out. Combined with localStorage storage on the frontend (visible to any JS running on the page), this is a meaningful risk.

**Fix (short-term):** Add an expiry timestamp when creating tokens; check and prune in the middleware. **Fix (longer-term):** Move to signed JWTs or server-side sessions with a configurable TTL.

---

## High Priority

### H1 — Stale Docker image causes e2e test failure

**File:** `Dockerfile`

The `pm-app` Docker container was last built 5 hours before the review. The AISidebar toggle button exists in the source (`KanbanBoard.tsx` line 229, `aria-label="Toggle AI sidebar"`) but not in the static files baked into the running container. This causes the Playwright test `AI sidebar opens and closes` to time out.

**Fix:** Run `docker compose up --build -d` to rebuild the image with the current frontend code.

---

### H2 — `pytest` is a runtime dependency, installed into the production image

**File:** `backend/pyproject.toml` line 8

```toml
dependencies = [
    ...
    "pytest>=9.0.3",
    ...
]
```

`pytest` is listed under `[project].dependencies` (runtime deps). The Dockerfile runs `uv sync --frozen --no-dev`, but because pytest is a runtime dep, not a dev dep, it is installed into the production image unnecessarily.

**Fix:** Move pytest to `[dependency-groups]` dev section:
```toml
[dependency-groups]
dev = ["pytest>=9.0.3"]
```
Then the Dockerfile's `--no-dev` flag will correctly exclude it.

---

### H3 — Dockerfile uses `npm ci` but the project uses pnpm

**File:** `Dockerfile` line 4

```dockerfile
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
```

The working dev environment uses pnpm (`pnpm-lock.yaml` exists, `pnpm` commands documented). Docker uses `package-lock.json` and `npm ci`, which may resolve slightly different dependency versions from those tested locally.

**Fix:** Either commit to pnpm throughout (replace `npm ci` with `corepack enable && pnpm install --frozen-lockfile`) or commit to npm and remove the pnpm lockfile to avoid confusion.

---

### H4 — `GET /api/ai/test` debug endpoint is live in production

**File:** `backend/routers/ai.py` lines 57–66

```python
@router.get("/test")
async def ai_test():
    ...  # calls OpenAI with "What is 2+2?"
```

This endpoint is unauthenticated (excluded from auth middleware? — actually it *is* protected by the middleware since it's under `/api/`), but it burns API credits on every call and is a surface area that should not exist in production.

**Fix:** Remove the endpoint or gate it behind an env var like `APP_ENV=development`.

---

### H5 — No rate limiting on the login endpoint

**File:** `backend/routers/auth.py`

`POST /api/auth/login` has no rate limiting. An attacker can brute-force the hardcoded `user` account without constraint.

**Fix:** Add a rate-limiting middleware (e.g. `slowapi`) or a simple per-IP counter, at minimum for the `/api/auth/login` path.

---

## Medium Priority

### M1 — `initialData` in `kanban.ts` duplicates the DB seed and could drift

**File:** `frontend/src/lib/kanban.ts` lines 18–72

`initialData` is a hardcoded copy of the seed data that also lives in `backend/database.py`. It is used only in `api.test.ts` as a fixture (not at runtime). The two copies will silently diverge as the seed evolves.

**Fix:** Use a minimal fixture object directly in `api.test.ts` rather than importing `initialData`. Remove or unexport `initialData` from the production module.

---

### M2 — `createId` is exported but never used

**File:** `frontend/src/lib/kanban.ts` line 164

The `createId` utility is exported but never imported anywhere in the codebase (card IDs are generated server-side). It also lacks a test.

**Fix:** Delete `createId` or, if it is intended for future use, mark it internal and add a test.

---

### M3 — Column title and card title allow empty strings

**Files:** `backend/models.py`, `frontend/src/components/KanbanColumn.tsx`

`RenameColumnRequest.title` and `CreateCardRequest.title` are plain `str` with no minimum length. A user can rename a column to `""` or create a blank card. The frontend column `<input>` has no `required` or `minLength` attribute.

**Fix:** Add `title: str = Field(min_length=1)` in the Pydantic models; add `required minLength={1}` to the column rename input.

---

### M4 — Test fixtures use `importlib.reload()` — fragile and order-dependent

**Files:** `backend/tests/test_board.py` lines 14–28, `backend/tests/test_ai.py` lines 26–35

Both test fixtures monkeypatch `DB_PATH` then reload six modules in a specific order to propagate the change. This breaks if module load order changes and leaves global state (`auth_mod.tokens`) that must be manually cleared.

The root cause is that `DB_PATH` is evaluated at module import time (`database.py` line 7). If `get_db()` and `init_db()` always accepted a `path` argument (they already do, optionally), tests could inject the path without reload gymnastics.

**Fix:** Make the app use a FastAPI dependency that resolves `DB_PATH` at request time, or at minimum inject it via an app-level setting object rather than a module-level variable.

---

### M5 — `AISidebar` test mocks are not reset between tests

**File:** `frontend/src/components/AISidebar.test.tsx`

`mockOnMutation` and `mockOnClose` are created with `vi.fn()` outside any `beforeEach`. Call counts accumulate across tests in the describe block, which can cause false positives in `toHaveBeenCalled` assertions.

**Fix:** Add `beforeEach(() => { vi.clearAllMocks(); })` inside the describe block.

---

### M6 — `AuthGuard` renders nothing while checking auth (content flash)

**File:** `frontend/src/components/AuthGuard.tsx` lines 18–19

```tsx
if (!ready) return null;
```

While the `useEffect` runs (one render cycle), the protected page renders nothing. On slow devices this is a visible blank flash.

**Fix:** Return a minimal loading state (e.g. a full-screen spinner matching the board's loading style) rather than `null`.

---

### M7 — No `.dockerignore` file

**File:** `Dockerfile`

`COPY frontend/ ./` in the Docker build stage copies the entire `frontend/` directory, which includes `node_modules/` (tens of thousands of files) unless excluded. This makes the build context unnecessarily large and slow.

**Fix:** Add a `.dockerignore` at the repo root:
```
frontend/node_modules
frontend/.next
frontend/out
backend/.venv
**/__pycache__
```

---

## Low Priority

### L1 — Error state in `KanbanBoard` does not clear on subsequent success

**File:** `frontend/src/components/KanbanBoard.tsx`

Once `error` is set (e.g. "Failed to move card"), it stays visible permanently. Subsequent successful operations don't clear it, leaving a stale error message.

**Fix:** Clear `error` at the start of each mutating operation (`setError(null)`).

---

### L2 — Delete button inside drag-enabled article

**File:** `frontend/src/components/KanbanCard.tsx` lines 42–49

The delete button sits inside an `<article>` that has `@dnd-kit` drag `{...listeners}` spread onto it. While the 6 px activation distance prevents accidental drags on a clean click, the listeners are still active on pointer-down over the button.

**Fix:** Add `onPointerDown={(e) => e.stopPropagation()}` to the delete button to prevent listener propagation, as recommended by `@dnd-kit` docs.

---

### L3 — AI chat has no message size guard

**File:** `frontend/src/components/AISidebar.tsx`, `backend/routers/ai.py`

There is no limit on message length or conversation history depth. A long conversation or a very large message sends an oversized payload to OpenAI, which may hit token limits or generate unexpectedly large API costs.

**Fix:** Cap input at a reasonable character limit on the frontend (`maxLength` on the `<textarea>`), and optionally trim history to the last N turns on the backend before building the prompt.

---

### L4 — `KanbanBoard` test coverage is thin

**File:** `frontend/src/components/KanbanBoard.test.tsx`

Only 3 tests exist: rename column, add card, remove card. Missing coverage:

- Loading state renders while `fetchBoard` is in-flight
- Error state renders when `fetchBoard` fails
- `handleAIMutation` correctly patches board state for all three mutation types (new, update, delete)
- Logout button calls logout API and redirects

---

### L5 — `moveCard` unit tests miss the cross-column insert-before case

**File:** `frontend/src/lib/kanban.test.ts`

The three existing tests cover same-column reorder, cross-column drop-to-end, and drop-onto-column-id. The untested branch is dropping a card *before* a specific card in a *different* column (the `overIndex` path in the cross-column case, lines 148–150 of `kanban.ts`).

---

### L6 — No `docker-compose.yml` in the repository

The `AGENTS.md` and `PLAN.md` reference `docker compose up --build` and `docker-compose.yml`, but no such file exists in the repository root. Either it was gitignored or never committed.

**Fix:** Commit `docker-compose.yml` (sanitised — no secrets) so the startup workflow is reproducible.

---

## Positive Observations

- Optimistic UI updates with API rollback pattern applied consistently in `KanbanBoard`
- Backend tests use isolated temp SQLite files — no shared state between test runs
- AI structured output (`response_format=AIResponse`) with Pydantic parsing is well-designed; the `AIResponse → ChatResponse` separation cleanly decouples the AI schema from the API contract
- `apiFetch` centralises auth header injection and 401 handling in one place
- `moveCard` is a pure function, making it trivially testable without DOM setup
- Playwright e2e tests cover the full auth flow (redirect, login, logout, token invalidation)

---

## Action Summary

| # | Priority | Action |
|---|---|---|
| C1 | Critical | Scope AI router mutations to the authenticated user's board |
| C2 | Critical | Add token TTL / expiry |
| H1 | High | Rebuild Docker image (`docker compose up --build -d`) |
| H2 | High | Move `pytest` to dev dependencies in `pyproject.toml` |
| H3 | High | Align Dockerfile package manager with project (pnpm or npm, not both) |
| H4 | High | Remove or gate the `/api/ai/test` debug endpoint |
| H5 | High | Add rate limiting on `/api/auth/login` |
| M1 | Medium | Remove/unexport `initialData`; use inline fixtures in tests |
| M2 | Medium | Delete unused `createId` export |
| M3 | Medium | Add min-length validation to column and card title fields |
| M4 | Medium | Replace `importlib.reload()` fixture with proper dependency injection |
| M5 | Medium | Add `beforeEach(vi.clearAllMocks)` to `AISidebar.test.tsx` |
| M6 | Medium | Replace `return null` in `AuthGuard` with a loading state |
| M7 | Medium | Add `.dockerignore` to exclude `node_modules` and build artefacts |
| L1 | Low | Clear error state on each new mutating operation |
| L2 | Low | Stop pointer event propagation on delete button inside drag article |
| L3 | Low | Add message length cap and conversation history truncation for AI chat |
| L4 | Low | Expand `KanbanBoard` unit tests (loading, error, AI mutations, logout) |
| L5 | Low | Add cross-column insert-before test case to `kanban.test.ts` |
| L6 | Low | Commit `docker-compose.yml` to the repository |
