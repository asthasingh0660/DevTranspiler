"""
models/conversion.py
ORM model for the `conversions` table — stores every completed conversion.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column

from db.session import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Conversion(Base):
    __tablename__ = "conversions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    job_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)

    # Languages
    source_lang: Mapped[str] = mapped_column(String(32), index=True)
    target_lang: Mapped[str] = mapped_column(String(32), index=True)

    # Code content
    input_code: Mapped[str] = mapped_column(Text)
    output_code: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Cache
    cache_key: Mapped[str] = mapped_column(String(80), index=True)
    cache_hit: Mapped[bool] = mapped_column(Boolean, default=False)

    # Job status: queued | processing | done | failed
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Safety flags
    has_dangerous_output: Mapped[bool] = mapped_column(Boolean, default=False)

    # Performance metrics
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    input_chars: Mapped[int] = mapped_column(Integer, default=0)
    output_chars: Mapped[int] = mapped_column(Integer, default=0)

    # Client info
    client_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )