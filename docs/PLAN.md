# Project Plan

## Part 1: Plan (complete)

- [x] Enrich this document with detailed substeps, tests, and success criteria
- [x] Create `frontend/AGENTS.md` documenting the existing frontend code
- [x] User reviews and approves the plan

---

## Part 2: Scaffolding

Set up Docker infrastructure, FastAPI backend, and start/stop scripts. Serve a "Hello World" HTML page and confirm a working API call.

### Steps

- [x] Initialise Python project in `backend/` using `uv init`
- [x] Add FastAPI and uvicorn: `uv add fastapi uvicorn`
- [x] Create `backend/main.py` with:
  - `GET /` returning a static HTML "Hello World" page
  - `GET /api/hello` returning `{"message": "hello"}` JSON
- [x] Create `Dockerfile` at project root:
  - Base: `python:3.12-slim`
  - Install `uv`, copy `backend/`, install deps via `uv sync`
  - Expose port 8000, run with `uv run uvicorn main:app --host 0.0.0.0 --port 8000`
- [x] Create `docker-compose.yml` mounting `.env` and mapping port 8000
- [x] Create `scripts/start.sh` (Mac/Linux) and `scripts/start.bat` (Windows)
- [x] Create `scripts/stop.sh` and `scripts/stop.bat`
- [x] Update `backend/AGENTS.md` to describe the backend structure

### Tests & Success Criteria

- `docker compose up --build` completes without errors
- `curl http://localhost:8000/` returns HTML containing "Hello World"
- `curl http://localhost:8000/api/hello` returns `{"message": "hello"}`
- Start and stop scripts run cleanly on the target OS

---

## Part 3: Add in Frontend

Statically build the Next.js frontend and serve it via FastAPI so the Kanban board is live at `/`.

### Steps

- [x] Add `output: "export"` to `frontend/next.config.ts` to enable static export
- [x] Run `npm run build` in `frontend/` to verify the export produces `frontend/out/`
- [x] Update `Dockerfile`:
  - Add Node.js build stage to build the frontend (`npm ci && npm run build`)
  - Copy `out/` into the Python image at `backend/static/`
- [x] Mount `backend/static/` via FastAPI `StaticFiles` at `/`, with `index.html` fallback
- [x] Remove the placeholder `GET /` HTML route (static files now handle it)
- [x] Rebuild the Docker image and confirm the Kanban board loads at `http://localhost:8000/`
- [x] Confirm existing unit tests pass: `npm run test:unit` inside `frontend/`
- [x] Confirm e2e tests pass against the Docker-served app: `npm run test:e2e`

### Tests & Success Criteria

- `http://localhost:8000/` renders the Kanban board ("Kanban Studio" heading visible)
- All 5 columns visible; drag and drop works in-browser
- All existing Vitest unit tests pass
- All existing Playwright e2e tests pass against the containerised app

---

## Part 4: Add in a Fake User Sign-In Experience

Gate the Kanban board behind a login page using hardcoded credentials (`user` / `password`).

### Steps

- [ ] Create `frontend/src/app/login/page.tsx` with a login form (username + password fields, submit button)
- [ ] Add a `POST /api/auth/login` backend route that accepts `{username, password}` and returns a session token (a simple UUID stored server-side in memory) on success, or 401 on failure
- [ ] Add a `POST /api/auth/logout` route that invalidates the token
- [ ] Add auth middleware in FastAPI that checks `Authorization: Bearer <token>` on all `/api/` routes except `/api/auth/*`
- [ ] In the frontend, store the token in `localStorage` after login; attach it to all API calls via a shared fetch wrapper
- [ ] In `frontend/src/app/layout.tsx` (or a client wrapper), redirect unauthenticated users to `/login`
- [ ] Add a logout button to the Kanban header that calls `/api/auth/logout` and clears `localStorage`
- [ ] Rebuild Docker image; re-run all tests
- [ ] Write Vitest unit tests for the auth fetch wrapper and redirect logic
- [ ] Write Playwright e2e tests: unauthenticated redirect, successful login, logout flow

### Tests & Success Criteria

- Hitting `http://localhost:8000/` without a token redirects to `/login`
- Logging in with `user` / `password` shows the Kanban board
- Logging in with wrong credentials shows an error message
- Logout returns to `/login` and the token is invalidated (subsequent API calls with the old token return 401)
- All prior tests still pass

---

## Part 5: Database Modeling

Design and document the SQLite schema; get user sign-off before writing any database code.

### Steps

- [ ] Design JSON schema representing:
  - `users` table: `id`, `username`, `password_hash`
  - `boards` table: `id`, `user_id`, `name`
  - `columns` table: `id`, `board_id`, `title`, `position`
  - `cards` table: `id`, `column_id`, `title`, `details`, `position`
- [ ] Save schema as `docs/schema.json`
- [ ] Write `docs/DATABASE.md` documenting the schema, rationale, and SQLite file location
- [ ] Present to user for sign-off before proceeding to Part 6

### Tests & Success Criteria

- `docs/schema.json` is valid JSON with all tables and columns specified
- `docs/DATABASE.md` explains relationships, data types, and constraints
- User explicitly approves before Part 6 starts

---

## Part 6: Backend API

Implement all Kanban API routes backed by SQLite; full backend test coverage.

### Steps

- [ ] Add SQLite dependency: `uv add aiosqlite` (or use stdlib `sqlite3` synchronously)
- [ ] Create `backend/database.py`: init DB function that creates all tables from the schema if they don't exist; seed the hardcoded `user` / `password` user on first run
- [ ] Create `backend/models.py`: dataclasses / Pydantic models for Board, Column, Card
- [ ] Implement API routes in `backend/routers/board.py`:
  - `GET /api/board` — return the full board (columns + cards) for the authenticated user
  - `PUT /api/board/column/{column_id}` — rename a column
  - `POST /api/board/card` — create a card in a column
  - `PUT /api/board/card/{card_id}` — update card title/details
  - `DELETE /api/board/card/{card_id}` — delete a card
  - `PUT /api/board/card/{card_id}/move` — move card to a new column + position
- [ ] Mount the router in `main.py`
- [ ] Write `backend/tests/test_board.py` using pytest + `httpx.AsyncClient` (test client):
  - Test each route: happy path and error cases
  - Confirm DB is created on startup
  - Use an in-memory or temp-file SQLite DB for tests
- [ ] Run tests: `uv run pytest`

### Tests & Success Criteria

- All 6 board routes return correct responses
- Data persists across container restarts (SQLite file survives via a Docker volume)
- `uv run pytest` passes with 100% route coverage
- Auth middleware correctly rejects unauthenticated requests on board routes

---

## Part 7: Frontend + Backend Integration

Wire the frontend to the real API so the Kanban board is fully persistent.

### Steps

- [ ] Create `frontend/src/lib/api.ts`: a fetch wrapper that attaches the auth token from `localStorage` to all requests
- [ ] On Kanban board mount, call `GET /api/board` and populate state (remove `initialData` seeding)
- [ ] Replace all local state mutations (add card, delete card, rename column, move card) with API calls followed by local state update on success
- [ ] Display a loading skeleton while the board is fetching
- [ ] On API error, show a minimal inline error message
- [ ] Rebuild Docker image; test manually in browser
- [ ] Update Vitest unit tests to mock the API module
- [ ] Update Playwright e2e tests: confirm card added in one session persists after page reload

### Tests & Success Criteria

- Adding a card, refreshing the page → card still present
- Renaming a column, refreshing → new name persists
- Moving a card, refreshing → card in new column
- Deleting a card, refreshing → card gone
- All Vitest and Playwright tests pass
- No `initialData` used at runtime (only as a type reference / seed for DB)

---

## Part 8: AI Connectivity

Connect the backend to the AI via OpenAI-compatible API (OpenRouter); confirm with a "2+2" smoke test.

### Steps

- [ ] Add openai SDK: `uv add openai`
- [ ] Create `backend/ai.py`: initialise `openai.AsyncOpenAI` with `base_url="https://openrouter.ai/api/v1"` and `api_key` from env `OPENAI_API_KEY`; use model `openai/gpt-oss-120b`
- [ ] Add `GET /api/ai/test` route that sends the message `"What is 2+2?"` and returns the AI's response as `{"answer": "..."}`
- [ ] Pass `OPENAI_API_KEY` through to the container via `docker-compose.yml` env
- [ ] Test manually: `curl http://localhost:8000/api/ai/test`

### Tests & Success Criteria

- `GET /api/ai/test` returns a JSON body containing the correct answer
- No API key is hard-coded in source; key comes from env only
- Request logged to console (for debugging), response time < 30 s

---

## Part 9: AI Chat with Kanban Context and Structured Outputs

Extend the AI route to accept conversation history, include the full board as context, and return structured outputs (reply + optional board update).

### Steps

- [ ] Define Pydantic models for structured output:
  - `CardUpdate`: `id`, `title?`, `details?`, `column_id?`, `position?`
  - `NewCard`: `title`, `details`, `column_id`
  - `AIResponse`: `message` (str), `new_cards?` (list[NewCard]), `update_cards?` (list[CardUpdate]), `delete_card_ids?` (list[str])
- [ ] Create `POST /api/ai/chat`:
  - Accept `{messages: [{role, content}]}` (full conversation history from frontend)
  - Fetch the current board from DB and serialize to JSON
  - Build system prompt including board JSON and instructions on when/how to return board mutations
  - Call AI with structured output mode (response_format using JSON schema)
  - If response includes board mutations, apply them to the DB before returning
  - Return `AIResponse` to the client
- [ ] Write `backend/tests/test_ai.py`:
  - Mock the openai client
  - Test that board JSON is included in the system prompt
  - Test that returned mutations are applied to the DB

### Tests & Success Criteria

- Asking "add a card called X to Backlog" → response includes the new card; board updated in DB
- Asking a general question → `new_cards`, `update_cards`, `delete_card_ids` are null/empty
- Conversation history is sent to the AI on each turn
- `uv run pytest` passes

---

## Part 10: AI Chat Sidebar UI

Add a full-featured chat sidebar to the frontend; board updates from AI are applied instantly.

### Steps

- [ ] Create `frontend/src/components/AISidebar.tsx`:
  - Toggle open/closed via a button in the Kanban header
  - Displays conversation history (user + assistant messages)
  - Input field + submit button (also submits on Enter)
  - Shows a loading indicator while waiting for AI response
  - Scrolls to latest message automatically
- [ ] On AI response, if `new_cards`, `update_cards`, or `delete_card_ids` are present, merge them into the board state held in `KanbanBoard`
- [ ] Lift board state up if needed so `AISidebar` and `KanbanBoard` share it
- [ ] Style sidebar using the project color scheme; sidebar overlays on narrow screens
- [ ] Write Vitest unit tests for `AISidebar` (message rendering, submit, loading state)
- [ ] Write Playwright e2e test: open sidebar, send message, verify board updates

### Tests & Success Criteria

- Sidebar opens and closes without breaking the board layout
- Sending a message shows the user message immediately, then the assistant reply
- If AI returns a new card, it appears on the board without a page reload
- If AI returns a card update or deletion, board reflects it instantly
- All Vitest and Playwright tests pass
