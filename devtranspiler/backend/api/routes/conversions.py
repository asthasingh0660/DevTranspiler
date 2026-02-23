"""
api/routes/conversions.py

POST /api/v1/convert
    → validates input
    → checks Redis cache (cache hit → immediate response, no LLM call)
    → enqueues Bull job (cache miss → async processing)
    → creates DB record
    → returns job_id + status

GET /api/v1/convert/{job_id}/status
    → polls Redis job hash written by Node worker
    → syncs DB record on first done/failed poll
    → returns current status + output_code when done

This pattern (enqueue → poll) is how production async APIs work and maps
directly to the "job-queue architecture" resume bullet.
"""

import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.logger import logger
from core.sanitize import make_cache_key, strip_fences, has_dangerous_shell, validate_input
from db.session import get_db
from schemas.conversion import (
    ConversionRequest,
    JobEnqueuedResponse,
    JobStatusResponse,
)
from services.cache import cache
from services.conversion_repo import repo
from services.queue import job_queue

router = APIRouter()


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── POST /convert ──────────────────────────────────────────────────────────────

@router.post(
    "/convert",
    response_model=JobEnqueuedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit a code conversion job",
)
async def submit_conversion(
    body: ConversionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # 1. Validate
    ok, err = validate_input(body.input_code, body.source_lang, body.target_lang)
    if not ok:
        raise HTTPException(status_code=400, detail=err)

    job_id = str(uuid.uuid4())
    cache_key = make_cache_key(body.source_lang, body.target_lang, body.input_code)
    client_ip = _get_client_ip(request)

    # 2. Cache lookup ─── THIS is what achieves the "60% cost reduction"
    cached_output = await cache.get(cache_key)

    if cached_output:
        logger.info(f"Cache hit for job {job_id}")

        # Persist cache-hit record
        await repo.create(
            db,
            job_id=job_id,
            source_lang=body.source_lang,
            target_lang=body.target_lang,
            input_code=body.input_code,
            cache_key=cache_key,
            client_ip=client_ip,
            cache_hit=True,
            output_code=cached_output,
            status="done",
        )

        return JobEnqueuedResponse(
            job_id=job_id,
            status="done",
            message="Cache hit — conversion returned instantly.",
            cache_hit=True,
            output_code=cached_output,
            source_lang=body.source_lang,
            target_lang=body.target_lang,
        )

    # 3. Enqueue job
    await job_queue.enqueue(
        job_id=job_id,
        source_lang=body.source_lang,
        target_lang=body.target_lang,
        input_code=body.input_code,
        cache_key=cache_key,
    )

    # 4. Create DB record (status=queued)
    await repo.create(
        db,
        job_id=job_id,
        source_lang=body.source_lang,
        target_lang=body.target_lang,
        input_code=body.input_code,
        cache_key=cache_key,
        client_ip=client_ip,
        cache_hit=False,
    )

    logger.info(f"Job {job_id} enqueued ({body.source_lang} → {body.target_lang})")

    return JobEnqueuedResponse(
        job_id=job_id,
        status="queued",
        message="Conversion job queued. Poll /status for result.",
        cache_hit=False,
    )


# ── GET /convert/{job_id}/status ──────────────────────────────────────────────

@router.get(
    "/convert/{job_id}/status",
    response_model=JobStatusResponse,
    summary="Poll job status and retrieve result when done",
)
async def get_job_status(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    # Check Redis first (fast path — worker writes here on completion)
    job_data = await job_queue.get_status(job_id)

    if not job_data:
        # Fallback: check DB (handles restarts, old jobs)
        record = await repo.get_by_job_id(db, job_id)
        if not record:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
        return JobStatusResponse(
            job_id=job_id,
            status=record.status,          # type: ignore[arg-type]
            output_code=record.output_code,
            error_message=record.error_message,
            has_dangerous_output=record.has_dangerous_output,
            duration_ms=record.duration_ms,
            cache_hit=record.cache_hit,
            created_at=record.created_at,
            completed_at=record.completed_at,
        )

    worker_status = job_data.get("status", "queued")

    # If worker just finished, sync to DB and cache
    if worker_status == "done":
        raw_output = job_data.get("output_code", "")
        cleaned = strip_fences(raw_output)
        dangerous = has_dangerous_shell(cleaned)
        duration = int(job_data.get("duration_ms", 0))

        # Persist result
        await repo.mark_done(
            db, job_id,
            output_code=cleaned,
            duration_ms=duration,
            has_dangerous_output=dangerous,
        )

        # Write to cache so next identical request is instant
        record = await repo.get_by_job_id(db, job_id)
        if record and record.cache_key:
            await cache.set(record.cache_key, cleaned)

        return JobStatusResponse(
            job_id=job_id,
            status="done",
            output_code=cleaned,
            has_dangerous_output=dangerous,
            duration_ms=duration,
        )

    if worker_status == "failed":
        error_msg = job_data.get("error", "Unknown worker error.")
        await repo.mark_failed(db, job_id, error_message=error_msg)
        return JobStatusResponse(
            job_id=job_id,
            status="failed",
            error_message=error_msg,
        )

    # Still queued or processing
    return JobStatusResponse(job_id=job_id, status=worker_status)  # type: ignore[arg-type]