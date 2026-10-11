"""Shared pytest fixtures.

pytest-asyncio (auto mode) runs each async test on its own event loop, but the
application's async SQLAlchemy engine is created once at import and pools
asyncpg connections bound to the loop that first used them. Reusing a pooled
connection on a later test's loop raises
"Future ... attached to a different loop".

Disposing the engine after every test guarantees each test creates fresh
connections on its own loop.
"""
import pytest

from app.dependencies import engine


@pytest.fixture(autouse=True)
async def _dispose_engine_between_tests():
    yield
    await engine.dispose()
