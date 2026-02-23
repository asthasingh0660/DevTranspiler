"""
schemas/conversion.py
Pydantic v2 schemas — request bodies, responses, and job status payloads.
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from core.config import settings

# ── Types ─────────────────────────────────────────────────────────────────────

JobStatus = Literal["queued", "processing", "done", "failed"]


# ── Request ───────────────────────────────────────────────────────────────────

class ConversionRequest(BaseModel):
    source_lang: str = Field(..., description="Source programming language")
    target_lang: str = Field(..., description="Target programming language")
    input_code: str = Field(..., min_length=1, max_length=50_000)

    @field_validator("source_lang", "target_lang")
    @classmethod
    def validate_language(cls, v: str) -> str:
        if v not in settings.SUPPORTED_LANGUAGES:
            raise ValueError(
                f"Unsupported language '{v}'. "
                f"Supported: {', '.join(settings.SUPPORTED_LANGUAGES)}"
            )
        return v

    @field_validator("target_lang")
    @classmethod
    def langs_must_differ(cls, v: str, info) -> str:
        src = info.data.get("source_lang")
        if src and src == v:
            raise ValueError("source_lang and target_lang must be different.")
        return v


# ── Responses ─────────────────────────────────────────────────────────────────

class JobEnqueuedResponse(BaseModel):
    job_id: str
    status: JobStatus
    message: str
    cache_hit: bool = False
    output_code: Optional[str] = None
    source_lang: Optional[str] = None
    target_lang: Optional[str] = None


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    output_code: Optional[str] = None
    error_message: Optional[str] = None
    has_dangerous_output: bool = False
    duration_ms: Optional[int] = None
    cache_hit: bool = False
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class ConversionRecord(BaseModel):
    id: str
    job_id: str
    source_lang: str
    target_lang: str
    input_code: str
    output_code: Optional[str]
    status: JobStatus
    cache_hit: bool
    has_dangerous_output: bool
    duration_ms: Optional[int]
    input_chars: int
    output_chars: int
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class HistoryResponse(BaseModel):
    items: list[ConversionRecord]
    total: int
    page: int
    page_size: int


# ── Analytics ─────────────────────────────────────────────────────────────────

class StatsResponse(BaseModel):
    total_conversions: int
    cache_hits: int
    cache_hit_rate_pct: float
    avg_duration_ms: Optional[float]
    top_source_langs: list[dict]
    top_target_langs: list[dict]