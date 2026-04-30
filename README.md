# Kanban Studio

A single-board Kanban app with an AI assistant that can add, move, rename, and delete cards on command.

**Stack:** FastAPI · SQLite · Next.js · dnd-kit · OpenAI

---

## Get started

**Dev** (two servers, hot reload)
```
scripts\dev.bat
```
Frontend → http://localhost:3000  
Backend → http://localhost:8001

**Production** (single container)
```
docker compose up --build
```
App → http://localhost:8000

Default credentials: `user` / `password`

---

## Features

- **Drag & drop** cards across five columns
- **Inline rename** columns (saved on blur)
- **AI sidebar** — type a prompt, the board updates live
- **Persistent** — SQLite on disk, survives restarts

---

## Project structure

```
backend/    FastAPI app, SQLite, OpenAI integration
frontend/   Next.js app with Tailwind + dnd-kit
scripts/    dev.bat — starts everything locally
docs/       schema and planning docs
```

---

## Environment

Create a `.env` at the project root:
```
OPENAI_API_KEY=sk-...
```
