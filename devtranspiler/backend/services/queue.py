"""
services/queue.py
Enqueues conversion jobs by calling the Node.js producer service via HTTP.
The producer handles pushing jobs into Bull correctly, so the worker receives
a clean job.data without any double-nesting hacks.

Status is written back by the worker to: bull:job:<job_id> (Redis hash),
which get_status reads directly via Redis.
"""

import os
import time
from typing import Optional

import httpx
import redis.asyncio as aioredis

from core.config import settings
from core.logger import logger


JOB_HASH_PREFIX = "bull:job:"

PRODUCER_URL = os.getenv("PRODUCER_URL", "http://producer:3001/enqueue")


class JobQueue:
    def __init__(self):
        self._client: Optional[aioredis.Redis] = None

    async def _get_client(self) -> aioredis.Redis:
        if self._client is None:
            self._client = await aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
        return self._client

    async def enqueue(
        self,
        job_id: str,
        source_lang: str,
        target_lang: str,
        input_code: str,
        cache_key: str,
    ) -> str:
        """Send job payload to the producer service via HTTP. Returns job_id."""

        payload = {
            "id": job_id,
            "source_lang": source_lang,
            "target_lang": target_lang,
            "input_code": input_code,
            "cache_key": cache_key,
        }

        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(PRODUCER_URL, json=payload)
                res.raise_for_status()

            logger.info(f"Job enqueued → {job_id} ({source_lang} → {target_lang})")

        except Exception as exc:
            logger.error(f"Enqueue failed: {exc}")
            raise RuntimeError("Failed to enqueue conversion job.") from exc

        return job_id

    async def get_status(self, job_id: str) -> Optional[dict]:
        """
        Returns the job hash written by the worker, or None if not found.
        Shape: { status, output_code?, error?, duration_ms?, completed_at? }
        """
        try:
            client = await self._get_client()
            data = await client.hgetall(f"{JOB_HASH_PREFIX}{job_id}")
            return data if data else None
        except Exception as exc:
            logger.warning(f"get_status error for {job_id}: {exc}")
            return None

    async def ping(self) -> bool:
        try:
            client = await self._get_client()
            return await client.ping()
        except Exception:
            return False

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None


# Singleton
job_queue = JobQueue()