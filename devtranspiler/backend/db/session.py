"""
db/session.py
Async SQLAlchemy engine + session factory.
Tables are created on startup via init_db().
"""

import ssl
import re
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from core.config import settings
from core.logger import logger


class Base(DeclarativeBase):
    pass


def _clean_db_url(url: str) -> str:
    """
    Strip query params that asyncpg cannot handle (sslmode, channel_binding)
    and ensure the scheme is postgresql+asyncpg://.
    """
    # Normalize scheme
    url = re.sub(r"^postgresql(?:\+asyncpg)?://", "postgresql+asyncpg://", url)
    # Remove unsupported query params
    url = re.sub(r"[?&]sslmode=[^&]*", "", url)
    url = re.sub(r"[?&]channel_binding=[^&]*", "", url)
    url = re.sub(r"[?&]ssl=true", "", url)
    # Clean up any trailing ? or & left behind
    url = re.sub(r"\?$", "", url)
    url = re.sub(r"&$", "", url)
    return url


def _needs_ssl(url: str) -> bool:
    """Return True if the original URL asked for SSL in any form."""
    return any(p in url for p in ("sslmode=require", "ssl=true", "neon.tech"))


_raw_url = settings.DATABASE_URL
_use_ssl = _needs_ssl(_raw_url)
_db_url = _clean_db_url(_raw_url)

# Build connect_args — pass SSL as a Python object, not a query param
_connect_args: dict = {}
if _use_ssl:
    _ssl_ctx = ssl.create_default_context()
    _connect_args["ssl"] = _ssl_ctx

engine = create_async_engine(
    _db_url,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    connect_args=_connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db() -> None:
    """Create all tables (idempotent). Use Alembic for production migrations."""
    from models import conversion  # noqa: F401 — registers model with Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("All tables created / verified.")


async def get_db():
    """FastAPI dependency — yields an async session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()