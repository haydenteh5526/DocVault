import json

from app.config import settings
from app.logging_config import get_logger

logger = get_logger("cache")

_memory: dict[str, str] = {}
_redis = None


def _get_redis():
    global _redis
    if _redis is None and settings.REDIS_URL:
        try:
            import redis
            _redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
            _redis.ping()
            logger.info("Connected to Redis")
        except Exception as e:  # noqa: BLE001
            logger.warning("Redis unavailable (%s); using in-memory cache", type(e).__name__)
            _redis = False  # mark as unavailable
    return _redis or None


def cache_get(key: str) -> list | dict | None:
    r = _get_redis()
    raw = r.get(key) if r else _memory.get(key)
    return json.loads(raw) if raw else None


def cache_set(key: str, value: list | dict, ttl: int = 3600) -> None:
    payload = json.dumps(value)
    r = _get_redis()
    if r:
        r.setex(key, ttl, payload)
    else:
        _memory[key] = payload
