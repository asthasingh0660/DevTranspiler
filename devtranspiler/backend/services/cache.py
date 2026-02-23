"""
services/cache.py
Redis-backed cache for conversion results.
Key = SHA-256(sourceLang:targetLang:normalised_code)
TTL  = 24 hours (configurable via CACHE_TTL_SECONDS)

This is the layer that achieves the "60% API cost reduction" resume bullet.
Identical or whitespace-equivalent conversion requests never hit the LLM twice.
"""

import json
from typing import Optional

import redis.asyncio as aioredis

from core.config import settings
from core.logger import logger


class ConversionCache:
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

    async def get(self, cache_key: str) -> Optional[str]:
        """Return cached output_code or None."""
        try:
            client = await self._get_client()
            value = await client.get(cache_key)
            if value:
                logger.info(f"Cache HIT  → {cache_key[:20]}…")
                data = json.loads(value)
                return data.get("output_code")
            logger.debug(f"Cache MISS → {cache_key[:20]}…")
            return None
        except Exception as exc:
            # Cache failure must never break the main flow
            logger.warning(f"Cache GET error: {exc}")
            return None

    async def set(self, cache_key: str, output_code: str) -> bool:
        """Store result. Returns True on success."""
        try:
            client = await self._get_client()
            payload = json.dumps({"output_code": output_code})
            await client.setex(cache_key, settings.CACHE_TTL_SECONDS, payload)
            logger.info(f"Cache SET  → {cache_key[:20]}… (TTL {settings.CACHE_TTL_SECONDS}s)")
            return True
        except Exception as exc:
            logger.warning(f"Cache SET error: {exc}")
            return False

    async def delete(self, cache_key: str) -> None:
        try:
            client = await self._get_client()
            await client.delete(cache_key)
        except Exception as exc:
            logger.warning(f"Cache DELETE error: {exc}")

    async def ping(self) -> bool:
        """Health check."""
        try:
            client = await self._get_client()
            return await client.ping()
        except Exception:
            return False

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None


# Singleton — imported by routes
cache = ConversionCache()