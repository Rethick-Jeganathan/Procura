"""
GovCon API Connector
Fetches federal contract opportunities from GovCon API
"""
from typing import List, Dict, Optional
from datetime import datetime, date, timedelta, timezone
import structlog
import httpx

from .base import BaseConnector

logger = structlog.get_logger()


class GovConAPIConnector(BaseConnector):
    """Connector for GovCon API (aggregated federal opportunities)"""
    
    name = "govcon"
    source = "govcon"
    # GovCon API base URL (see docs: https://govconapi.com/docs)
    base_url = "https://govconapi.com/api/v1"
    
    async def fetch_opportunities(self, since: Optional[datetime] = None) -> List[Dict]:
        """Fetch opportunities from GovCon API"""
        # Free tier often caps to 50; paid tiers support higher limits.
        limit = int(self.config.get("limit") or 50)
        offset = int(self.config.get("offset") or 0)

        url = f"{self.base_url}/opportunities/search"

        # Some filters are plan-dependent; we try with a date filter first, then
        # gracefully fall back to a basic request if the API rejects it.
        base_params: Dict[str, str | int] = {
            "limit": max(1, min(limit, 100)),
            "offset": max(0, offset),
        }

        params = dict(base_params)
        if since:
            # GovCon supports `posted_after` (YYYY-MM-DD) as an advanced filter on some plans.
            params["posted_after"] = since.strftime("%Y-%m-%d")

        headers = self.get_headers()
        try:
            response = await self.client.get(url, params=params, headers=headers)
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            if since and e.response is not None and e.response.status_code in (400, 403, 422):
                # Likely rejected filter on this plan; retry once without date filter.
                logger.warning(
                    "GovCon API rejected date filter; retrying without posted_after",
                    status_code=e.response.status_code,
                )
                response = await self.client.get(url, params=base_params, headers=headers)
                response.raise_for_status()
            else:
                raise

        data = response.json()
        opportunities = data.get("data", [])
        logger.info("Fetched from GovCon API", count=len(opportunities))
        return opportunities
    
    def normalize(self, raw: Dict) -> Dict:
        """Normalize GovCon API response to standard format"""
        # Helper to coerce various date-like fields into YYYY-MM-DD strings,
        # which Supabase can cast into DATE columns.
        def _to_date_str(value: object) -> str:
            if isinstance(value, date):
                return value.strftime("%Y-%m-%d")
            if isinstance(value, str):
                # Common cases: "YYYY-MM-DD", "YYYY-MM-DDTHH:MM:SSZ"
                if len(value) >= 10 and value[4] == "-" and value[7] == "-":
                    return value[:10]
            return ""

        posted_date = _to_date_str(raw.get("posted_date") or raw.get("postedDate"))
        due_date_raw = raw.get("response_deadline") or raw.get("responseDeadline") or raw.get("due_date") or raw.get("dueDate")
        due_date = _to_date_str(
            raw.get("response_deadline")
            or raw.get("responseDeadline")
            or raw.get("due_date")
            or raw.get("dueDate")
        )

        # Required by schema: posted_date and due_date must be non-null.
        # If the source record doesn't include these, fall back to "today"
        # and mark the raw payload so the UI can show "TBD" / "assumed".
        today_date = datetime.now(timezone.utc).date()
        today = today_date.strftime("%Y-%m-%d")
        if not posted_date:
            posted_date = today
        if not due_date:
            # Avoid marking every record as due today (bad UX). Assume a default horizon.
            try:
                base = datetime.strptime(posted_date, "%Y-%m-%d").date()
            except Exception:
                base = today_date
            due_date = (base + timedelta(days=30)).strftime("%Y-%m-%d")
            raw = dict(raw)
            raw["_due_date_missing"] = True
            raw["_due_date_assumed"] = due_date
        elif due_date_raw is None:
            raw = dict(raw)
            raw["_due_date_missing"] = True
            raw["_due_date_assumed"] = due_date

        naics = raw.get("naics") or raw.get("naics_code") or raw.get("naicsCode")
        if isinstance(naics, list):
            naics_code = str(naics[0]) if naics else None
        else:
            naics_code = str(naics) if naics else None

        return {
            "external_ref": raw.get("solicitation_number") or raw.get("notice_id") or raw.get("id"),
            "title": raw.get("title", "Untitled"),
            "agency": raw.get("agency") or raw.get("department") or "Unknown",
            "description": raw.get("description_text") or raw.get("description") or "",
            "naics_code": naics_code,
            "set_aside": raw.get("set_aside_type") or raw.get("set_aside") or raw.get("setAside"),
            "posted_date": posted_date,
            "due_date": due_date,
            "estimated_value": raw.get("estimated_value") or raw.get("contract_value") or raw.get("contractValue"),
            "raw_data": raw
        }
