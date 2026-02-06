"""
USAspending API Connector
Fetches contract award data from USAspending.gov
"""
from typing import List, Dict, Optional
from datetime import datetime, timezone
import structlog

from .base import BaseConnector

logger = structlog.get_logger()


class USASpendingConnector(BaseConnector):
    """Connector for USAspending.gov API"""
    
    name = "usaspending"
    source = "usaspending"
    base_url = "https://api.usaspending.gov/api/v2"
    
    def get_headers(self) -> Dict[str, str]:
        """USAspending doesn't require auth for public endpoints"""
        return {"Content-Type": "application/json"}
    
    async def fetch_opportunities(self, since: Optional[datetime] = None) -> List[Dict]:
        """Fetch recent contract awards from USAspending"""
        # Note: USAspending is for awards, not opportunities
        # This is useful for market research and past performance
        payload = {
            "filters": {
                "time_period": [{"start_date": (since or datetime.now(timezone.utc)).strftime("%Y-%m-%d"), "end_date": datetime.now(timezone.utc).strftime("%Y-%m-%d")}],
                "award_type_codes": ["A", "B", "C", "D"]  # Contract types
            },
            "limit": 100,
            "page": 1
        }
        
        response = await self._request("POST", f"{self.base_url}/search/spending_by_award", json=payload)
        data = response.json()
        
        results = data.get("results", [])
        logger.info("Fetched from USAspending", count=len(results))
        return results
    
    def normalize(self, raw: Dict) -> Dict:
        """Normalize USAspending API response"""
        return {
            "external_ref": raw.get("Award ID") or raw.get("internal_id"),
            "title": raw.get("Award Description") or raw.get("description", "Untitled"),
            "agency": raw.get("Awarding Agency") or raw.get("awarding_agency", "Unknown"),
            "description": raw.get("Award Description", ""),
            "naics_code": raw.get("NAICS Code") or raw.get("naics_code"),
            "set_aside": raw.get("Set Aside"),
            "posted_date": raw.get("Start Date") or raw.get("date_signed"),
            "due_date": raw.get("End Date") or raw.get("period_of_performance_current_end_date"),
            "estimated_value": raw.get("Award Amount") or raw.get("total_obligation"),
            "raw_data": raw
        }
