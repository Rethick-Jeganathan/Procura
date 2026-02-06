"""
Base Connector
Abstract base class for all data source connectors
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
import structlog

logger = structlog.get_logger()


class BaseConnector(ABC):
    """Abstract base class for discovery connectors"""
    
    name: str = "base"
    source: str = "unknown"
    
    def __init__(self, api_key: Optional[str] = None, config: Optional[Dict] = None):
        self.api_key = api_key
        self.config = config or {}
        self.client = httpx.AsyncClient(timeout=30.0)
        self._authenticated = False
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()
    
    @abstractmethod
    async def fetch_opportunities(self, since: Optional[datetime] = None) -> List[Dict]:
        """Fetch opportunities from the source"""
        pass
    
    @abstractmethod
    def normalize(self, raw_data: Dict) -> Dict:
        """Normalize raw data to standard opportunity format"""
        pass
    
    async def authenticate(self) -> bool:
        """Authenticate with the source (optional)"""
        self._authenticated = True
        return True
    
    def get_headers(self) -> Dict[str, str]:
        """Get request headers"""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    async def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Make HTTP request with retry logic"""
        headers = kwargs.pop("headers", {})
        headers.update(self.get_headers())
        
        response = await self.client.request(method, url, headers=headers, **kwargs)
        response.raise_for_status()
        return response
    
    async def run_discovery(self, since: Optional[datetime] = None) -> Dict[str, Any]:
        """Run full discovery process"""
        start_time = datetime.now(timezone.utc)
        result = {
            "connector": self.name,
            "source": self.source,
            "start_time": start_time,
            "records_fetched": 0,
            "opportunities": [],
            "errors": []
        }
        
        try:
            # Authenticate if needed
            if not self._authenticated:
                await self.authenticate()
            
            # Fetch raw opportunities
            raw_opportunities = await self.fetch_opportunities(since)
            result["records_fetched"] = len(raw_opportunities)
            
            # Normalize each
            for raw in raw_opportunities:
                try:
                    normalized = self.normalize(raw)
                    normalized["source"] = self.source
                    result["opportunities"].append(normalized)
                except Exception as e:
                    logger.warning("Failed to normalize opportunity", error=str(e))
                    result["errors"].append(str(e))
            
            result["end_time"] = datetime.now(timezone.utc)
            result["success"] = True
            
        except Exception as e:
            logger.error("Discovery failed", connector=self.name, error=str(e))
            result["end_time"] = datetime.now(timezone.utc)
            result["success"] = False
            result["errors"].append(str(e))
        
        return result
