from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()


@app.get("/api/hello")
def hello():
    return {"message": "hello"}


app.mount("/", StaticFiles(directory="static", html=True), name="static")
