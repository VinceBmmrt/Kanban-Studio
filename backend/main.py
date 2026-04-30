import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

load_dotenv()

from auth import AuthMiddleware
from database import init_db
from routers.ai import router as ai_router
from routers.auth import router as auth_router
from routers.board import router as board_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(AuthMiddleware)
app.include_router(auth_router)
app.include_router(board_router)
app.include_router(ai_router)


@app.get("/api/hello")
def hello():
    return {"message": "hello"}


if os.path.isdir("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
