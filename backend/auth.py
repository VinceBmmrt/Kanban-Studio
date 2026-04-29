import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

tokens: set[str] = set()


def create_token() -> str:
    token = str(uuid.uuid4())
    tokens.add(token)
    return token


def revoke_token(token: str) -> None:
    tokens.discard(token)


def is_valid_token(token: str) -> bool:
    return token in tokens


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path.startswith("/api/") and not path.startswith("/api/auth/"):
            auth = request.headers.get("Authorization", "")
            token = auth.removeprefix("Bearer ").strip()
            if not is_valid_token(token):
                return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        return await call_next(request)
