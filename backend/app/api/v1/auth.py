from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_id
from app.db import get_db
from app.models.schemas import AuthOut, ErrorOut, GuestDemoOut, LoginIn, RegisterIn, UserOut
from app.repositories.users import UserRepository
from app.services.auth_service import AuthService

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=AuthOut,
    status_code=201,
    summary="Register a researcher account",
    openapi_extra={"security": []},
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
    openapi_extra={"security": []},
    responses={
        401: {"model": ErrorOut, "description": "Invalid email or password"},
    },
)
def login(body: LoginIn, db: Session = Depends(get_db)) -> AuthOut:
    return AuthService(db).login(body)


@router.post(
    "/guest",
    response_model=GuestDemoOut,
    status_code=201,
    summary="Create an isolated guest session with a preloaded demo workspace for instant evaluation",
    openapi_extra={"security": []},
)
def guest_demo(db: Session = Depends(get_db)) -> GuestDemoOut:
    return AuthService(db).login_guest_demo()


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
