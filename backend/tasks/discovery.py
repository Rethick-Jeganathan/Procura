"""
Discovery Tasks
Celery tasks for scheduled opportunity discovery
"""
import asyncio
from datetime import datetime, timedelta, timezone
from celery import shared_task
import structlog

from .celery_app import celery_app
from ..database import get_supabase_client
from ..config import settings
from ..scrapers import GovConAPIConnector, SAMGovConnector, USASpendingConnector
from ..security.vault import decrypt_credentials

logger = structlog.get_logger()

CONNECTORS = {
    "govcon": GovConAPIConnector,
    "sam": SAMGovConnector,
    "usaspending": USASpendingConnector,
}


@celery_app.task(bind=True, max_retries=3)
def run_discovery_task(self, connector_name: str, since_days: int = 7):
    """
    Celery task to run discovery for a specific connector
    """
    return asyncio.run(_run_discovery(connector_name, since_days, self.request.id))


async def _run_discovery(connector_name: str, since_days: int, task_id: str):
    """Async discovery implementation"""
    supabase = get_supabase_client()
    start_time = datetime.now(timezone.utc)
    
    # Create run record
    run = supabase.table("discovery_runs").insert({
        "connector_name": connector_name,
        "run_type": "scheduled",
        "status": "running",
        "start_time": start_time.isoformat()
    }).execute()
    run_id = run.data[0]["id"]
    
    try:
        # Get connector class
        connector_class = CONNECTORS.get(connector_name)
        if not connector_class:
            raise ValueError(f"Unknown connector: {connector_name}")
        
        # Get credentials from database
        connector_record = supabase.table("connectors").select("*").eq("name", connector_name).execute()
        api_key = None
        if connector_record.data:
            try:
                creds = decrypt_credentials(connector_record.data[0]["encrypted_credentials"])
                api_key = creds.get("api_key")
            except:
                pass

        # Dev-friendly fallback: allow running discovery without seeding the `connectors` table.
        if not api_key:
            if connector_name == "govcon":
                api_key = settings.GOVCON_API_KEY
            elif connector_name == "sam":
                api_key = settings.SAM_GOV_API_KEY
        
        # Run discovery
        async with connector_class(api_key=api_key) as connector:
            since = datetime.now(timezone.utc) - timedelta(days=since_days)
            result = await connector.run_discovery(since)
        
        # Process opportunities
        created = 0
        updated = 0
        for opp in result.get("opportunities", []):
            try:
                # Upsert opportunity
                existing = supabase.table("opportunities").select("id").eq("external_ref", opp["external_ref"]).execute()
                
                if existing.data:
                    supabase.table("opportunities").update(opp).eq("id", existing.data[0]["id"]).execute()
                    updated += 1
                else:
                    supabase.table("opportunities").insert(opp).execute()
                    created += 1
            except Exception as e:
                logger.warning("Failed to upsert opportunity", error=str(e))
        
        # Update run record
        end_time = datetime.now(timezone.utc)
        supabase.table("discovery_runs").update({
            "status": "success",
            "end_time": end_time.isoformat(),
            "duration_ms": int((end_time - start_time).total_seconds() * 1000),
            "records_fetched": result.get("records_fetched", 0),
            "opportunities_created": created,
            "opportunities_updated": updated,
            "errors": len(result.get("errors", []))
        }).eq("id", run_id).execute()
        
        # Update connector last_run
        if connector_record.data:
            supabase.table("connectors").update({
                "last_run_at": end_time.isoformat(),
                "last_success_at": end_time.isoformat(),
                "error_count": 0
            }).eq("id", connector_record.data[0]["id"]).execute()
        
        logger.info("Discovery completed", connector=connector_name, created=created, updated=updated)
        return {"success": True, "created": created, "updated": updated}
        
    except Exception as e:
        logger.error("Discovery failed", connector=connector_name, error=str(e))
        
        # Update run as failed
        supabase.table("discovery_runs").update({
            "status": "failed",
            "end_time": datetime.now(timezone.utc).isoformat(),
            "error_message": str(e)
        }).eq("id", run_id).execute()
        
        raise
