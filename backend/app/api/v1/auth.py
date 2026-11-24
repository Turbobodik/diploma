from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.db import get_db
from app.models.schemas import AuthOut, ErrorOut, LoginIn, RegisterIn, UserOut
from app.repositories.users import UserRepository
from app.services.auth_service import AuthService

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=AuthOut,
    status_code=201,
    summary="Register a researcher account",
    responses={
        409: {"model": ErrorOut, "description": "Email is already registered"},
        422: {"model": ErrorOut, "description": "Invalid email or password shorter than 8 characters"},
    },
)
def register(body: RegisterIn, db: Session = Depends(get_db)) -> AuthOut:
    return AuthService(db).register(body)


@router.post(
    "/login",
    response_model=AuthOut,
    summary="Authenticate with email and password",
    responses={
        401: {"model": ErrorOut, "description": "Invalid email or password"},
    },
)
def login(body: LoginIn, db: Session = Depends(get_db)) -> AuthOut:
    return AuthService(db).login(body)


@router.get(
    "/me",
    response_model=UserOut,
    summary="Return the currently authenticated user profile",
    responses={401: {"model": ErrorOut, "description": "Missing or expired Bearer JWT"}},
)
def me(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)) -> UserOut:
    user = UserRepository(db).get_by_id(user_id)
    assert user is not None
    return UserOut(id=user.id, email=user.email, display_name=user.display_name)
