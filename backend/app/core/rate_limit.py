import threading
import time
from collections import deque

from app.core.config import settings
from app.core.exceptions import RateLimitError


class SlidingWindowRateLimiter:
    """Per-client sliding-window rate limiter enforcing NFR-06 (<= 60 req/min)."""

    def __init__(self, max_requests: int | None = None, window_seconds: float = 60.0) -> None:
        self._max_requests = max_requests
        self._window = window_seconds
        self._lock = threading.Lock()
        self._hits: dict[str, deque[float]] = {}

    @property
    def limit(self) -> int:
        return self._max_requests if self._max_requests is not None else settings.rate_limit_per_minute

    def check(self, key: str) -> tuple[int, int]:
        """Record a hit and return `(limit, remaining)`, or raise `RateLimitError`."""
        now = time.monotonic()
        cutoff = now - self._window
        limit = self.limit
        with self._lock:
            bucket = self._hits.setdefault(key, deque())
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = max(1, int(self._window - (now - bucket[0])) + 1)
                raise RateLimitError(retry_after_seconds=retry_after)
            bucket.append(now)
            return limit, max(0, limit - len(bucket))

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


rate_limiter = SlidingWindowRateLimiter()
