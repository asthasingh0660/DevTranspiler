"""
api/routes/health.py
Health + readiness endpoint — used by Docker healthcheck and load balancers.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from services.cache import cache
from services.queue import job_queue

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    redis_cache: bool
    redis_queue: bool


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Liveness + dependency check.
    Returns 200 when all critical services are reachable.
    """
    redis_ok = await cache.ping()
    queue_ok = await job_queue.ping()

    return HealthResponse(
        status="ok" if (redis_ok and queue_ok) else "degraded",
        redis_cache=redis_ok,
        redis_queue=queue_ok,
    )