import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.constants import HEADER_REQUEST_ID, ErrorCode
from app.core.logging import request_id_ctx

logger = logging.getLogger("factmap.errors")


class AppError(Exception):
    """Base domain exception mapped to a consistent JSON error payload."""

    def __init__(
        self,
        status_code: int,
        code: ErrorCode,
        message: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.headers = headers or {}


class UnauthorizedError(AppError):
    def __init__(self, code: ErrorCode = ErrorCode.UNAUTHORIZED, message: str = "Sign in required") -> None:
        super().__init__(401, code, message)


class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(404, ErrorCode.NOT_FOUND, message)


class ConflictError(AppError):
    def __init__(self, code: ErrorCode, message: str) -> None:
        super().__init__(409, code, message)


class PayloadTooLargeError(AppError):
    def __init__(self, message: str = "File must be between 1 byte and 20 MB") -> None:
        super().__init__(413, ErrorCode.BAD_SIZE, message)


class UnsupportedMediaError(AppError):
    def __init__(self, message: str = "Only PDF and plain text files are accepted") -> None:
        super().__init__(415, ErrorCode.BAD_TYPE, message)


class UnprocessableError(AppError):
    def __init__(self, code: ErrorCode, message: str) -> None:
        super().__init__(422, code, message)


class RateLimitError(AppError):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__(
            429,
            ErrorCode.RATE_LIMITED,
            f"Rate limit exceeded. Retry after {retry_after_seconds} seconds.",
            headers={"Retry-After": str(retry_after_seconds)},
        )


def _error_response(status_code: int, code: str, message: str, headers: dict[str, str] | None = None) -> JSONResponse:
    req_id = request_id_ctx.get()
    merged_headers = {HEADER_REQUEST_ID: req_id, **(headers or {})}
    return JSONResponse(
        status_code=status_code,
        content={"code": code, "message": message, "request_id": req_id},
        headers=merged_headers,
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        logger.warning("domain_error status=%s code=%s msg=%s", exc.status_code, exc.code.value, exc.message)
        return _error_response(exc.status_code, exc.code.value, exc.message, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {"msg": "Invalid request payload"}
        loc = ".".join(str(x) for x in first.get("loc", []))
        msg = f"{loc}: {first.get('msg')}" if loc else str(first.get("msg"))
        return _error_response(422, ErrorCode.VALIDATION_ERROR.value, msg)

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_exception: %s", exc)
        return _error_response(500, ErrorCode.INTERNAL_ERROR.value, "Internal server error")
