"""
Feeds Router
Market intelligence feeds (e.g., NewsAPI) for the UI.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..config import settings
from ..dependencies import get_current_user

logger = structlog.get_logger()
router = APIRouter()

_LAST_NEWS_BY_USER: dict[str, datetime] = {}
_NEWS_COOLDOWN_SECONDS = 10


def _is_placeholder(value: Optional[str]) -> bool:
    if not value:
        return True
    v = value.strip()
    if not v:
        return True
    upper = v.upper()
    return upper == "PLACEHOLDER" or "PLACEHOLDER" in upper or v.startswith("your-")


@router.get("/news")
async def get_news_feed(
    q: str = Query("government contracts OR federal procurement", min_length=1),
    days: int = Query(7, ge=1, le=30),
    page_size: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Fetch a small "market intelligence" feed from NewsAPI.

    This is a proxy endpoint so the frontend never needs the NewsAPI key.
    """
    now = datetime.now(timezone.utc)
    last = _LAST_NEWS_BY_USER.get(user["id"])
    if last and (now - last).total_seconds() < _NEWS_COOLDOWN_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"News feed is rate-limited. Try again in {_NEWS_COOLDOWN_SECONDS} seconds.",
        )
    _LAST_NEWS_BY_USER[user["id"]] = now

    if _is_placeholder(settings.NEWS_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="NEWS_API_KEY is not configured on the backend",
        )

    base = (settings.NEWS_API_BASE or "https://newsapi.org/v2").rstrip("/")
    # SSRF guard: only allow known external hosts
    from urllib.parse import urlparse
    parsed = urlparse(base)
    allowed_hosts = {"newsapi.org", "www.newsapi.org"}
    if parsed.hostname not in allowed_hosts:
        logger.warning("NEWS_API_BASE points to disallowed host", host=parsed.hostname)
        raise HTTPException(status_code=500, detail="News feed misconfigured")
    from_date = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()

    params = {
        "q": q,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": page_size,
        "from": from_date,
        "apiKey": settings.NEWS_API_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{base}/everything", params=params)

        if response.status_code != 200:
            logger.warning("NewsAPI request failed", status_code=response.status_code, body=response.text[:200])
            raise HTTPException(status_code=response.status_code, detail="News feed provider error")

        data = response.json()
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("News feed failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch news feed")
