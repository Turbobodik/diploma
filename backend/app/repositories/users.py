from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.orm import AppUser


class UserRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def get_by_id(self, user_id: str) -> AppUser | None:
        return self._db.get(AppUser, user_id)

    def get_by_email(self, email: str) -> AppUser | None:
        stmt = select(AppUser).where(AppUser.email == email.lower())
        return self._db.scalar(stmt)

    def create(self, *, email: str, password_hash: str, display_name: str) -> AppUser:
        user = AppUser(email=email.lower(), password_hash=password_hash, display_name=display_name)
        self._db.add(user)
        self._db.commit()
        self._db.refresh(user)
        return user
