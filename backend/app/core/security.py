from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from jwt import InvalidTokenError

from app.core.config import settings
from app.core.constants import JWT_ISSUER, JWT_TOKEN_TYPE

_password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """Hash a password using Argon2id (OWASP recommended)."""
    return _password_hasher.hash(password)


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a plaintext password against a stored Argon2id hash."""
    try:
        return _password_hasher.verify(stored_hash, password)
    except (VerifyMismatchError, InvalidHashError, ValueError):
        return False


def issue_access_token(user_id: str) -> str:
    """Issue a standard RFC 7519 JWT access token."""
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "iss": JWT_ISSUER,
        "type": JWT_TOKEN_TYPE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.jwt_ttl_seconds)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str | None) -> str | None:
    """Validate a JWT access token and return its subject (`user_id`), or None."""
    if not token:
        return None
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer=JWT_ISSUER,
            options={"require": ["sub", "exp", "iat", "iss"]},
        )
    except InvalidTokenError:
        return None
    if payload.get("type") != JWT_TOKEN_TYPE:
        return None
    sub = payload.get("sub")
    return str(sub) if sub else None
