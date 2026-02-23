"""
DevTranspiler — FastAPI Backend
Entry point: uvicorn main:app --reload
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from core.config import settings
from core.logger import logger
from db.session import init_db
from api.routes import conversions, history, health, execute


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info("Starting DevTranspiler API …")
    await init_db()
    logger.info("Database initialised.")
    yield
    logger.info("Shutting down DevTranspiler API.")


app = FastAPI(
    title="DevTranspiler API",
    description="AI-powered code conversion service with job-queue and caching.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── Middleware ────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.ALLOWED_HOSTS,
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(health.router,       prefix="/api/v1", tags=["Health"])
app.include_router(conversions.router,  prefix="/api/v1", tags=["Conversions"])
app.include_router(history.router,      prefix="/api/v1", tags=["History"])
app.include_router(execute.router,      prefix="/api/v1", tags=["Execute"])