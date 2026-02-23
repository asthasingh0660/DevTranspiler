"""
core/config.py
All configuration is read from environment variables (or .env file).
Copy .env.example → .env and fill in your values.
"""

"""
core/config.py
All configuration is read from environment variables (or .env file).
Copy .env.example → .env and fill in your values.
"""

from functools import lru_cache
from typing import Any, List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────────────
    APP_ENV: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str = "change-me-in-production"

    # ── CORS / Hosts ─────────────────────────────────────────────────────
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:4173",
    ]
    ALLOWED_HOSTS: List[str] = ["*"]

    # ── Database (Postgres) ───────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://devuser:devpass@localhost:5432/devtranspiler"

    # ── Redis ─────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL_SECONDS: int = 86_400

    # ── LLM / AI ─────────────────────────────────────────────────────────
    GROQ_API_KEY: str = ""
    LLM_MODEL: str = "llama-3.3-70b-versatile"
    LLM_MAX_TOKENS: int = 4096
    LLM_TEMPERATURE: float = 0.1

    # ── Rate limiting ─────────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 20
    RATE_LIMIT_PER_DAY: int = 200

    # ── Job queue ─────────────────────────────────────────────────────────
    JOB_TIMEOUT_SECONDS: int = 60
    JOB_POLL_INTERVAL_MS: int = 500

    # ── Judge0 ──────────────────────────────────────────────────────────
    JUDGE0_URL: str = "http://localhost:2358"
    JUDGE0_AUTH_TOKEN: str = ""

    # ── Supported languages ───────────────────────────────────────────────
    SUPPORTED_LANGUAGES: List[str] = [
        "JavaScript", "TypeScript", "Python", "Java",
        "C++", "C#", "Ruby", "Go", "PHP", "Swift", "Kotlin",
    ]

    @field_validator("CORS_ORIGINS", "ALLOWED_HOSTS", "SUPPORTED_LANGUAGES", mode="before")
    @classmethod
    def parse_list(cls, v: Any) -> Any:
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            # Try JSON array first
            if v.startswith("["):
                import json
                return json.loads(v)
            # Comma-separated or single value
            return [item.strip().strip('"').strip("'") for item in v.split(",")]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()