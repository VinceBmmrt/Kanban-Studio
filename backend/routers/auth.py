from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from auth import create_token, revoke_token

router = APIRouter(prefix="/api/auth")


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginRequest):
    if body.username != "user" or body.password != "password":
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": create_token()}


@router.post("/logout")
def logout(request: Request):
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    revoke_token(token)
    return {"ok": True}
