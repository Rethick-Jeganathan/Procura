"""
SAM.gov API Connector
Fetches contract opportunities from official SAM.gov API
NOTE: Must use official API only - scraping is prohibited per SAM.gov ToS
"""
from typing import List, Dict, Optional
from datetime import datetime, timezone
import structlog

from .base import BaseConnector

logger = structlog.get_logger()


class SAMGovConnector(BaseConnector):
    """Connector for SAM.gov Opportunities API"""
    
    name = "sam"
    source = "sam.gov"
    base_url = "https://api.sam.gov/opportunities/v2"
    
    def get_headers(self) -> Dict[str, str]:
        """SAM.gov uses API key in header"""
        return {
            "Content-Type": "application/json",
            "X-Api-Key": self.api_key or ""
        }
    
    async def fetch_opportunities(self, since: Optional[datetime] = None) -> List[Dict]:
        """Fetch opportunities from SAM.gov API"""
        params = {
            "limit": 100,
            "postedFrom": (since or datetime.now(timezone.utc)).strftime("%m/%d/%Y"),
            "status": "active"
        }
        
        response = await self._request("GET", f"{self.base_url}/search", params=params)
        data = response.json()
        
        opportunities = data.get("opportunitiesData", [])
        logger.info("Fetched from SAM.gov", count=len(opportunities))
        return opportunities
    
    def normalize(self, raw: Dict) -> Dict:
        """Normalize SAM.gov API response to standard format"""
        return {
            "external_ref": raw.get("noticeId") or raw.get("solicitationNumber"),
            "title": raw.get("title", "Untitled"),
            "agency": raw.get("department", {}).get("name") if isinstance(raw.get("department"), dict) else raw.get("department", "Unknown"),
            "description": raw.get("description", ""),
            "naics_code": raw.get("naicsCode"),
            "set_aside": raw.get("setAsideDescription") or raw.get("setAside"),
            "posted_date": raw.get("postedDate"),
            "due_date": raw.get("responseDeadLine") or raw.get("archiveDate"),
            "estimated_value": raw.get("awardAmount"),
            "raw_data": raw
        }
