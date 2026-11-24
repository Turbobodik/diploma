from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.constants import ErrorCode
from app.core.exceptions import ConflictError, UnauthorizedError
from app.core.security import hash_password, issue_access_token, verify_password
from app.models.schemas import AuthOut, LoginIn, RegisterIn, UserOut
from app.repositories.users import UserRepository


class AuthService:
    def __init__(self, db: Session) -> None:
        self._users = UserRepository(db)

    def register(self, body: RegisterIn) -> AuthOut:
        if self._users.get_by_email(body.email) is not None:
            raise ConflictError(ErrorCode.DUPLICATE_EMAIL, "An account with this email already exists")
        user = self._users.create(
            email=body.email,
            password_hash=hash_password(body.password),
            display_name=body.display_name.strip(),
        )
        return AuthOut(
            token=issue_access_token(user.id),
            expires_in=settings.jwt_ttl_seconds,
            user=UserOut(id=user.id, email=user.email, display_name=user.display_name),
        )

    def login(self, body: LoginIn) -> AuthOut:
        user = self._users.get_by_email(body.email)
        if user is None or not verify_password(body.password, user.password_hash):
            raise UnauthorizedError(ErrorCode.INVALID_LOGIN, "Email or password is wrong")
        return AuthOut(
            token=issue_access_token(user.id),
            expires_in=settings.jwt_ttl_seconds,
            user=UserOut(id=user.id, email=user.email, display_name=user.display_name),
        )
