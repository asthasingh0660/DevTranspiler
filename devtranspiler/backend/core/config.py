"""
core/config.py
All configuration is read from environment variables (or .env file).
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

    # ── CORS / Hosts — stored as plain strings, parsed by properties ─────
    CORS_ORIGINS_STR: str = "http://localhost:5173,http://localhost:3000,http://localhost:4173"
    ALLOWED_HOSTS_STR: str = "*"

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

    # ── Judge0 ────────────────────────────────────────────────────────────
    JUDGE0_URL: str = "http://localhost:2358"
    JUDGE0_AUTH_TOKEN: str = ""

    # ── Supported languages ───────────────────────────────────────────────
    SUPPORTED_LANGUAGES_STR: str = "JavaScript,TypeScript,Python,Java,C++,C#,Ruby,Go,PHP,Swift,Kotlin"

    @property
    def CORS_ORIGINS(self) -> List[str]:
        return [x.strip() for x in self.CORS_ORIGINS_STR.split(",") if x.strip()]

    @property
    def ALLOWED_HOSTS(self) -> List[str]:
        return [x.strip() for x in self.ALLOWED_HOSTS_STR.split(",") if x.strip()]

    @property
    def SUPPORTED_LANGUAGES(self) -> List[str]:
        return [x.strip() for x in self.SUPPORTED_LANGUAGES_STR.split(",") if x.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()