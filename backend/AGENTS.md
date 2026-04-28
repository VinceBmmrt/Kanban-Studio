# Backend

Python 3.12 FastAPI app managed with `uv`. Runs inside Docker on port 8000.

## Structure

```
backend/
  main.py          FastAPI app entrypoint
  pyproject.toml   uv project manifest + dependencies
  uv.lock          Locked dependency versions
```

## Running locally (without Docker)

```bash
cd backend
uv run uvicorn main:app --reload
```

## Routes

| Method | Path         | Description               |
|--------|--------------|---------------------------|
| GET    | /            | Serves HTML (Hello World / static frontend) |
| GET    | /api/hello   | Health-check JSON         |

## Adding dependencies

```bash
cd backend
uv add <package>
```
