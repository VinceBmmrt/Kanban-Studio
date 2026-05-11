import os
import time
import uuid
from collections import defaultdict

TOKEN_TTL = 86400  # 24 hours

# token → (user_id, expiry_timestamp)
tokens: dict[str, tuple[int, float]] = {}

# ip → list of attempt timestamps within the sliding window
_login_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = int(os.getenv("LOGIN_RATE_WINDOW", "60"))   # seconds
_RATE_LIMIT = int(os.getenv("LOGIN_RATE_LIMIT", "20"))     # max attempts per window


def _purge_expired_tokens() -> None:
    now = time.time()
    expired = [tok for tok, (_, exp) in list(tokens.items()) if now > exp]
    for tok in expired:
        tokens.pop(tok, None)


def create_token(user_id: int) -> str:
    _purge_expired_tokens()
    token = str(uuid.uuid4())
    tokens[token] = (user_id, time.time() + TOKEN_TTL)
    return token


def revoke_token(token: str) -> None:
    tokens.pop(token, None)


def get_token_user_id(token: str) -> int | None:
    entry = tokens.get(token)
    if entry is None:
        return None
    user_id, expiry = entry
    if time.time() > expiry:
        tokens.pop(token, None)
        return None
    return user_id


def check_login_rate(ip: str) -> bool:
    """Return False if the IP has exceeded the login rate limit."""
    now = time.time()
    attempts = [t for t in _login_attempts.get(ip, []) if now - t < _RATE_WINDOW]
    if len(attempts) >= _RATE_LIMIT:
        _login_attempts[ip] = attempts
        return False
    attempts.append(now)
    if attempts:
        _login_attempts[ip] = attempts
    else:
        _login_attempts.pop(ip, None)
    return True
