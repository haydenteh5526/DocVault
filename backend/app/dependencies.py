import uuid
from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.services.auth_service import decode_token

engine = create_async_engine(settings.DATABASE_URL)
async_session = async_sessionmaker(engine, expire_on_commit=False)

security = HTTPBearer()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> uuid.UUID:
    user_id = decode_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return user_id
