import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from auth import AuthMiddleware
from routers.auth import router as auth_router

app = FastAPI()
app.add_middleware(AuthMiddleware)
app.include_router(auth_router)


@app.get("/api/hello")
def hello():
    return {"message": "hello"}


if os.path.isdir("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
