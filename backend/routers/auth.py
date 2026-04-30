import bcrypt
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from auth import check_login_rate, create_token, revoke_token
from database import get_db, get_user_by_username

router = APIRouter(prefix="/api/auth")


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(request: Request, body: LoginRequest):
    client_ip = request.client.host if request.client else "unknown"
    if not check_login_rate(client_ip):
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
    with get_db() as conn:
        user = get_user_by_username(conn, body.username)
    if not user or not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": create_token(user["id"])}


@router.post("/logout")
def logout(request: Request):
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    revoke_token(token)
    return {"ok": True}
