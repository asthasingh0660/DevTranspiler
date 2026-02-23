"""
core/config.py
All configuration is read from environment variables (or .env file).
Copy .env.example → .env and fill in your values.
"""

from functools import lru_cache
from typing import List

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
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",
        "http://localhost:4173",   # Vite preview
    ]
    ALLOWED_HOSTS: List[str] = ["*"]

    # ── Database (Postgres) ───────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://devuser:devpass@localhost:5432/devtranspiler"

    # ── Redis ─────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL_SECONDS: int = 86_400          # 24 h — identical conversions cached for a day

    # ── LLM / AI ─────────────────────────────────────────────────────────
    GROQ_API_KEY: str = ""                   # used by the Node worker; get free key at console.groq.com
    LLM_MODEL: str = "llama-3.3-70b-versatile"
    LLM_MAX_TOKENS: int = 4096
    LLM_TEMPERATURE: float = 0.1            # low temp → deterministic code output

    # ── Rate limiting ─────────────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 20          # per IP
    RATE_LIMIT_PER_DAY: int = 200

    # ── Job queue ─────────────────────────────────────────────────────────
    JOB_TIMEOUT_SECONDS: int = 60
    JOB_POLL_INTERVAL_MS: int = 500

    # ── Judge0 (sandboxed execution) ──────────────────────────────────────
    JUDGE0_URL: str = "http://localhost:2358"
    JUDGE0_AUTH_TOKEN: str = ""              # leave empty for local Judge0

    # ── Supported languages ───────────────────────────────────────────────
    SUPPORTED_LANGUAGES: List[str] = [
        "JavaScript", "TypeScript", "Python", "Java",
        "C++", "C#", "Ruby", "Go", "PHP", "Swift", "Kotlin",
    ]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()