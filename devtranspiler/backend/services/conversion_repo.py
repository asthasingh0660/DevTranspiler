"""
services/conversion_repo.py
All database reads/writes for the `conversions` table.
Keeps route handlers thin — all SQL lives here.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from models.conversion import Conversion
from core.logger import logger


class ConversionRepository:

    # ── Write ──────────────────────────────────────────────────────────────

    async def create(
        self,
        db: AsyncSession,
        *,
        job_id: str,
        source_lang: str,
        target_lang: str,
        input_code: str,
        cache_key: str,
        client_ip: Optional[str] = None,
        cache_hit: bool = False,
        output_code: Optional[str] = None,
        status: str = "queued",
    ) -> Conversion:
        record = Conversion(
            job_id=job_id,
            source_lang=source_lang,
            target_lang=target_lang,
            input_code=input_code,
            cache_key=cache_key,
            client_ip=client_ip,
            cache_hit=cache_hit,
            output_code=output_code,
            status=status,
            input_chars=len(input_code),
        )
        db.add(record)
        await db.flush()
        logger.debug(f"DB: created conversion record {record.id}")
        return record

    async def mark_done(
        self,
        db: AsyncSession,
        job_id: str,
        *,
        output_code: str,
        duration_ms: int,
        has_dangerous_output: bool = False,
    ) -> Optional[Conversion]:
        record = await self._get_by_job_id(db, job_id)
        if not record:
            return None
        record.status = "done"
        record.output_code = output_code
        record.output_chars = len(output_code)
        record.duration_ms = duration_ms
        record.has_dangerous_output = has_dangerous_output
        record.completed_at = datetime.now(timezone.utc)
        await db.flush()
        return record

    async def mark_failed(
        self,
        db: AsyncSession,
        job_id: str,
        *,
        error_message: str,
    ) -> Optional[Conversion]:
        record = await self._get_by_job_id(db, job_id)
        if not record:
            return None
        record.status = "failed"
        record.error_message = error_message
        record.completed_at = datetime.now(timezone.utc)
        await db.flush()
        return record

    # ── Read ───────────────────────────────────────────────────────────────

    async def get_by_job_id(
        self, db: AsyncSession, job_id: str
    ) -> Optional[Conversion]:
        return await self._get_by_job_id(db, job_id)

    async def list_recent(
        self,
        db: AsyncSession,
        *,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
    ) -> tuple[list[Conversion], int]:
        q = select(Conversion)
        if status:
            q = q.where(Conversion.status == status)
        q = q.order_by(desc(Conversion.created_at))

        # Total count
        count_q = select(func.count()).select_from(q.subquery())
        total = (await db.execute(count_q)).scalar_one()

        # Paginated results
        q = q.offset((page - 1) * page_size).limit(page_size)
        rows = (await db.execute(q)).scalars().all()
        return list(rows), total

    async def get_stats(self, db: AsyncSession) -> dict:
        total = (await db.execute(select(func.count(Conversion.id)))).scalar_one()
        hits = (
            await db.execute(
                select(func.count(Conversion.id)).where(Conversion.cache_hit.is_(True))
            )
        ).scalar_one()
        avg_dur = (
            await db.execute(
                select(func.avg(Conversion.duration_ms)).where(
                    Conversion.status == "done"
                )
            )
        ).scalar_one()

        # Top source langs
        top_src = (
            await db.execute(
                select(Conversion.source_lang, func.count().label("n"))
                .group_by(Conversion.source_lang)
                .order_by(desc("n"))
                .limit(5)
            )
        ).all()

        top_tgt = (
            await db.execute(
                select(Conversion.target_lang, func.count().label("n"))
                .group_by(Conversion.target_lang)
                .order_by(desc("n"))
                .limit(5)
            )
        ).all()

        return {
            "total_conversions": total,
            "cache_hits": hits,
            "cache_hit_rate_pct": round(hits / total * 100, 1) if total else 0.0,
            "avg_duration_ms": round(float(avg_dur), 1) if avg_dur else None,
            "top_source_langs": [{"lang": r[0], "count": r[1]} for r in top_src],
            "top_target_langs": [{"lang": r[0], "count": r[1]} for r in top_tgt],
        }

    # ── Private ────────────────────────────────────────────────────────────

    async def _get_by_job_id(
        self, db: AsyncSession, job_id: str
    ) -> Optional[Conversion]:
        result = await db.execute(
            select(Conversion).where(Conversion.job_id == job_id)
        )
        return result.scalar_one_or_none()


# Singleton
repo = ConversionRepository()