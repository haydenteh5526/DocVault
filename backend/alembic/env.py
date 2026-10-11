import os
import sys
from logging.config import fileConfig

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from alembic import context
from sqlalchemy import create_engine

from app.models.base import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

url = os.getenv("DATABASE_URL", config.get_main_option("sqlalchemy.url"))
# Alembic needs sync driver
if url and "+asyncpg" in url:
    url = url.replace("+asyncpg", "")


def run_migrations_online() -> None:
    connectable = create_engine(url)

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
