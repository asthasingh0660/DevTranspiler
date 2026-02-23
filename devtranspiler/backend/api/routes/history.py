"""
api/routes/history.py
Conversion history + analytics endpoints.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import get_db
from schemas.conversion import HistoryResponse, StatsResponse
from services.conversion_repo import repo

router = APIRouter()


@router.get(
    "/history",
    response_model=HistoryResponse,
    summary="List recent conversions (paginated)",
)
async def list_history(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: Optional[str] = Query(
        default=None,
        pattern="^(queued|processing|done|failed)$",
    ),
    db: AsyncSession = Depends(get_db),
):
    items, total = await repo.list_recent(
        db, page=page, page_size=page_size, status=status
    )
    return HistoryResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/stats",
    response_model=StatsResponse,
    summary="Aggregate analytics — cache rate, top languages, conversion counts",
)
async def get_stats(db: AsyncSession = Depends(get_db)):
    stats = await repo.get_stats(db)
    return StatsResponse(**stats)