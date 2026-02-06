"""
Audit Logs Router
Cryptographically signed audit trail management
"""
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from supabase import Client
import structlog
import json
import io

from ..dependencies import get_current_user, require_admin, get_request_supabase
from ..models import AuditLogListResponse, BaseResponse
from ..security.audit import sign_audit_log, verify_audit_log

logger = structlog.get_logger()
router = APIRouter()


@router.get("", response_model=AuditLogListResponse)
async def list_audit_logs(
    submission_id: Optional[str] = None,
    portal: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_admin)
):
    """List audit logs with optional filters (admin only)"""
    try:
        query = supabase.table("audit_logs").select("*")
        
        if submission_id:
            query = query.eq("submission_id", submission_id)
        if portal:
            query = query.eq("portal", portal)
        
        query = query.order("timestamp", desc=True).limit(limit)
        response = query.execute()
        
        return AuditLogListResponse(success=True, data=response.data)
    except Exception as e:
        logger.error("Failed to list audit logs", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch audit logs")


@router.get("/{log_id}/verify", response_model=BaseResponse)
async def verify_log_integrity(
    log_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_admin),
):
    """Verify cryptographic integrity of an audit log"""
    try:
        response = supabase.table("audit_logs").select("*").eq("id", log_id).single().execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Audit log not found")
        
        is_valid = verify_audit_log(response.data, response.data["confirmation_hash"])
        
        if is_valid:
            return BaseResponse(success=True, message="Audit log integrity verified")
        return BaseResponse(success=False, message="Integrity check FAILED")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export/json")
async def export_logs(
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_admin),
):
    """Export audit logs as JSON"""
    response = supabase.table("audit_logs").select("*").order("timestamp", desc=True).execute()
    
    export_data = {"exported_at": datetime.now(timezone.utc).isoformat(), "logs": response.data}
    output = io.BytesIO(json.dumps(export_data, default=str).encode())
    output.seek(0)
    
    return StreamingResponse(output, media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=audit_logs.json"})
