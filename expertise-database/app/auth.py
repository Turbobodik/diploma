import hashlib
import hmac
import os
import time

_ITERATIONS = 200_000
_SECRET = os.environ.get("TOKEN_SECRET", "local-dev-only").encode()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return f"pbkdf2_sha256${_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt_hex, digest_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(rounds)
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def issue_token(user_id: str) -> str:
    payload = f"{user_id}.{int(time.time())}"
    sig = hmac.new(_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def user_id_for(token: str | None) -> str | None:
    if not token:
        return None
    payload, _, sig = token.rpartition(".")
    if not payload or not sig:
        return None
    expected = hmac.new(_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    user_id, _, _issued = payload.partition(".")
    return user_id or None
