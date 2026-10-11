"""Create the verified account used by Playwright in an ephemeral CI database."""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.dependencies import async_session
from app.models.base import User
from app.services.auth_service import hash_password


async def main() -> None:
    if os.getenv("ALLOW_E2E_SEED") != "true":
        raise RuntimeError("Refusing to seed outside an explicitly enabled E2E environment")

    email = os.environ["E2E_SEED_EMAIL"]
    password = os.environ["E2E_SEED_PASSWORD"]
    async with async_session() as db:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            user = User(email=email, hashed_password=hash_password(password), is_verified=True)
            db.add(user)
        else:
            user.hashed_password = hash_password(password)
            user.is_verified = True
            user.verification_token = None
        await db.commit()


if __name__ == "__main__":
    asyncio.run(main())
