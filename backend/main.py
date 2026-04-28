from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI()


@app.get("/", response_class=HTMLResponse)
def root():
    return """<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Hello World</title></head>
<body><h1>Hello World</h1></body>
</html>"""


@app.get("/api/hello")
def hello():
    return {"message": "hello"}
