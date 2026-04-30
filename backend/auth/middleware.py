from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from auth.tokens import get_token_user_id


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
