"""
Test Discovery Connectors
Quick smoke tests for configured discovery sources.

Notes:
- Reads config from `backend/.env` via `backend.config.settings`
- Prints only high-level info; does not print secrets

Usage:
  backend\\venv\\Scripts\\python.exe backend/test_connectors.py
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

import httpx

# Allow running as a script: `python backend/test_connectors.py`
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.config import settings
from backend.scrapers.govcon_api import GovConAPIConnector

USASPENDING_BASE = settings.USASPENDING_API_BASE or "https://api.usaspending.gov/api/v2"
NEWS_API_BASE = settings.NEWS_API_BASE or "https://newsapi.org/v2"


def _is_placeholder(value: str | None) -> bool:
    if not value:
        return True
    v = value.strip()
    if not v:
        return True
    upper = v.upper()
    return upper == "PLACEHOLDER" or "PLACEHOLDER" in upper or v.startswith("your-")


async def test_usaspending() -> list[dict]:
    """Test USAspending API - Public, no key needed"""
    print("\n" + "=" * 60)
    print("TESTING: USAspending.gov API")
    print("=" * 60)

    async with httpx.AsyncClient(timeout=30.0) as client:
        payload = {
            "filters": {
                "time_period": [
                    {
                        "start_date": (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d"),
                        "end_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    }
                ],
                "award_type_codes": ["A", "B", "C", "D"],  # Contracts
            },
            "fields": [
                "Award ID",
                "Recipient Name",
                "Award Amount",
                "Awarding Agency",
                "Description",
                "NAICS Code",
                "Start Date",
            ],
            "limit": 10,
            "page": 1,
            "sort": "Award Amount",
            "order": "desc",
        }

        response = await client.post(f"{USASPENDING_BASE}/search/spending_by_award", json=payload)

        if response.status_code != 200:
            print(f"FAILED - Status: {response.status_code}")
            print(response.text[:500])
            return []

        data = response.json()
        results = data.get("results", [])
        print(f"OK - Retrieved {len(results)} contract awards")
        return results


async def test_newsapi() -> list[dict]:
    """Test NewsAPI - Requires key"""
    print("\n" + "=" * 60)
    print("TESTING: NewsAPI (Government Contract News)")
    print("=" * 60)

    if _is_placeholder(settings.NEWS_API_KEY):
        print("SKIPPED - NEWS_API_KEY not configured")
        return []

    async with httpx.AsyncClient(timeout=30.0) as client:
        params = {
            "q": "government contracts OR federal procurement",
            "language": "en",
            "sortBy": "publishedAt",
            "pageSize": 5,
            "apiKey": settings.NEWS_API_KEY,
        }

        response = await client.get(f"{NEWS_API_BASE}/everything", params=params)

        if response.status_code != 200:
            print(f"FAILED - Status: {response.status_code}")
            print(response.text[:500])
            return []

        data = response.json()
        articles = data.get("articles", [])
        print(f"OK - Retrieved {len(articles)} news articles")
        return articles


async def test_sam_gov() -> list[dict]:
    """Test SAM.gov opportunities endpoint"""
    print("\n" + "=" * 60)
    print("TESTING: SAM.gov API (Opportunities)")
    print("=" * 60)

    if _is_placeholder(settings.SAM_GOV_API_KEY):
        print("SKIPPED - SAM_GOV_API_KEY not configured")
        return []

    async with httpx.AsyncClient(timeout=30.0) as client:
        params = {
            "limit": 10,
            "postedFrom": (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%m/%d/%Y"),
            "postedTo": datetime.now(timezone.utc).strftime("%m/%d/%Y"),
            "status": "active",
        }

        response = await client.get(
            "https://api.sam.gov/opportunities/v2/search",
            params=params,
            headers={"X-Api-Key": settings.SAM_GOV_API_KEY},
        )

        if response.status_code != 200:
            print(f"FAILED - Status: {response.status_code}")
            print(response.text[:500])
            return []

        data = response.json()
        opps = data.get("opportunitiesData", [])
        print(f"OK - Retrieved {len(opps)} opportunities")
        return opps


async def test_govcon() -> list[dict]:
    """Test GovCon API opportunities search (via our connector)"""
    print("\n" + "=" * 60)
    print("TESTING: GovCon API (Opportunities)")
    print("=" * 60)

    if _is_placeholder(settings.GOVCON_API_KEY):
        print("SKIPPED - GOVCON_API_KEY not configured")
        return []

    try:
        async with GovConAPIConnector(api_key=settings.GOVCON_API_KEY) as connector:
            results = await connector.fetch_opportunities()
            print(f"OK - Retrieved {len(results)} opportunities")
            return results
    except Exception as e:
        print(f"FAILED - GovCon API error: {e}")
        return []


async def main() -> dict:
    print("=" * 60)
    print("PROCURA DISCOVERY CONNECTOR TEST")
    print(f"Time: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)

    usaspending_data = await test_usaspending()
    news_data = await test_newsapi()
    sam_data = await test_sam_gov()
    govcon_data = await test_govcon()

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"USAspending: {len(usaspending_data)} records")
    print(f"NewsAPI: {len(news_data)} articles")
    print(f"SAM.gov: {len(sam_data)} opportunities")
    print(f"GovCon API: {len(govcon_data)} opportunities")

    return {
        "usaspending": usaspending_data,
        "news": news_data,
        "sam": sam_data,
        "govcon": govcon_data,
    }


if __name__ == "__main__":
    asyncio.run(main())
