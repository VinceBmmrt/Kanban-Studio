@echo off
cd /d "%~dp0.."
echo Starting backend on http://localhost:8001
start "Backend" cmd /k "cd backend && uv run uvicorn main:app --reload --port 8001"
echo Starting frontend on http://localhost:3000
start "Frontend" cmd /k "cd frontend && npm run dev"
