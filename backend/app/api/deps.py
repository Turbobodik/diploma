from fastapi import Depends, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import UnauthorizedError
from app.core.rate_limit import rate_limiter
from app.core.security import decode_access_token
from app.db import get_db
from app.repositories.users import UserRepository

bearer_scheme = HTTPBearer(auto_error=False, description="RFC 7519 Bearer JWT obtained from /api/v1/auth/login or /register")


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UnauthorizedError()
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise UnauthorizedError()
    if UserRepository(db).get_by_id(user_id) is None:
        raise UnauthorizedError()
    return user_id


def enforce_rate_limit(
    request: Request,
    response: Response,
    user_id: str = Depends(get_current_user_id),
) -> str:
    client_ip = request.client.host if request.client else "unknown"
    limit, remaining = rate_limiter.check(f"{user_id}:{client_ip}")
    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    return user_id
