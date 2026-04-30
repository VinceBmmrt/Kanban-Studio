import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# token → user_id
tokens: dict[str, int] = {}


def create_token(user_id: int) -> str:
    token = str(uuid.uuid4())
    tokens[token] = user_id
    return token


def revoke_token(token: str) -> None:
    tokens.pop(token, None)


def get_token_user_id(token: str) -> int | None:
    return tokens.get(token)


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path.startswith("/api/") and not path.startswith("/api/auth/"):
            auth = request.headers.get("Authorization", "")
            token = auth.removeprefix("Bearer ").strip()
            user_id = get_token_user_id(token)
            if user_id is None:
                return JSONResponse({"detail": "Unauthorized"}, status_code=401)
            request.state.user_id = user_id
        return await call_next(request)
