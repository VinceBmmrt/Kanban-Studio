# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Full-stack Kanban board app: Python 3.12 FastAPI backend + Next.js 16 (React 19, TypeScript, Tailwind v4) frontend. SQLite database. OpenAI-powered chat sidebar that can create, update, move, and delete cards.

---

## Development commands

### Backend

```bash
cd backend
uv run uvicorn main:app --reload   # dev server on :8001
uv run pytest                      # run tests
uv add <package>                   # add dependency
```

Requires a `.env` file at the repo root with `OPENAI_API_KEY=sk-...`.

### Frontend

```bash
cd frontend
pnpm dev          # dev server on :3000 (proxies /api/* → :8001)
pnpm test:unit    # vitest (unit, jsdom)
pnpm test:e2e     # playwright (requires full stack on :8000)
pnpm build        # static export to frontend/out/
```

### Production mode

Build frontend (`pnpm build` → `frontend/out/`), copy `out/` to `backend/static/`, then run the backend. FastAPI serves the static export from `/` and the API from `/api/*`.

---

## Architecture

### Backend (`backend/`)

| File | Role |
|------|------|
| `main.py` | FastAPI app entry; registers middleware + routers; serves `static/` in prod |
| `auth.py` | In-memory token store (`dict[str, int]`); `AuthMiddleware` guards all `/api/*` except `/api/auth/*` |
| `database.py` | SQLite via raw `sqlite3`; `get_db()` context manager; `init_db()` creates schema + seeds on first run |
| `models.py` | Pydantic request/response models shared by all routers |
| `ai.py` | OpenAI `AsyncOpenAI` client; model is `gpt-4o-mini` |
| `routers/auth.py` | `POST /api/auth/login`, `POST /api/auth/logout` |
| `routers/board.py` | CRUD for columns and cards; position-based ordering maintained in DB |
| `routers/ai.py` | `POST /api/ai/chat` — fetches board state, calls OpenAI structured output, applies mutations |

**Auth tokens are in-memory and lost on restart.** The seeded user is `user` / `password`.

**Database schema**: `users`, `boards` (one per user), `columns` (positional), `cards` (positional within column). `DB_PATH` env var overrides the default `kanban.db`.

### Frontend (`frontend/src/`)

| Path | Role |
|------|------|
| `app/page.tsx` | Root page — renders `<KanbanBoard />` wrapped in `<AuthGuard />` |
| `app/login/page.tsx` | Login form |
| `components/KanbanBoard.tsx` | Top-level state owner: `BoardData`, drag-and-drop wiring, logout, AI mutation handler |
| `components/KanbanColumn.tsx` | Droppable zone + sortable card list + rename input |
| `components/KanbanCard.tsx` | Sortable card; shows title/details; delete button |
| `components/AISidebar.tsx` | Chat UI; sends full message history to `/api/ai/chat`; calls `onMutation` with the response |
| `components/AuthGuard.tsx` | Redirects to `/login` if no token in localStorage |
| `lib/kanban.ts` | `BoardData`, `Column`, `Card` types; pure `moveCard()` function |
| `lib/api.ts` | All `fetch` calls; `apiFetch()` injects `Authorization` header and redirects on 401 |
| `lib/auth.ts` | `getToken` / `setToken` / `clearToken` (localStorage) |

**State model**: `KanbanBoard` holds a single `BoardData = { columns: Column[], cards: Record<string, Card> }`. Columns own ordered `cardIds`; card objects are looked up by id. All mutations optimistically update local state then fire API calls.

### Drag and drop

Uses `@dnd-kit/core` + `@dnd-kit/sortable`. `PointerSensor` activates at 6 px movement. Collision strategy: `pointerWithin` with `rectIntersection` fallback. `DragOverlay` renders `KanbanCardPreview` during drag.

### AI chat flow

1. `AISidebar` posts full conversation history to `POST /api/ai/chat`.
2. Backend injects current board JSON into the system prompt, calls OpenAI with `response_format=AIResponse` (structured output via `.beta.chat.completions.parse`).
3. Backend applies `new_cards` / `update_cards` / `delete_card_ids` to SQLite and returns the applied mutations.
4. Frontend's `handleAIMutation` in `KanbanBoard` patches local `BoardData` accordingly.

### Dev proxy

`next.config.ts` rewrites `/api/:path*` → `http://localhost:8001/api/:path*` in development. In production (`output: "export"`), the static build is served by FastAPI so no proxy is needed.

---

## Testing

- **Unit tests** (Vitest, jsdom): `src/**/*.{test,spec}.{ts,tsx}` — test lib logic and component interactions.
- **E2E tests** (Playwright): `frontend/tests/` — target `http://localhost:8000` (full stack).
- **Backend tests** (pytest): `backend/` — run with `uv run pytest`.
