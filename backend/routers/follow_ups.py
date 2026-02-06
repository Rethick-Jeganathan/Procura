"""
Follow-ups Router
Application tracking and automated follow-up management.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client
import structlog

from ..dependencies import get_current_user, require_officer, get_request_supabase

logger = structlog.get_logger()

router = APIRouter()


@router.get("")
async def list_follow_ups(
    status_filter: Optional[str] = Query(None, alias="status"),
    submission_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """List follow-ups with filters"""
    offset = (page - 1) * limit

    try:
        query = supabase.table("follow_ups").select(
            "*, submission:submissions(id, title, portal, status), opportunity:opportunities(id, title, agency, due_date)",
            count="exact"
        )

        if user.get("role") != "admin":
            query = query.eq("assigned_to", user["id"])

        if status_filter:
            query = query.eq("status", status_filter)
        if submission_id:
            query = query.eq("submission_id", submission_id)

        query = query.order("next_check_at", desc=False).range(offset, offset + limit - 1)
        response = query.execute()

        return {
            "success": True,
            "data": response.data,
            "total": response.count or len(response.data),
        }

    except Exception as e:
        logger.error("Failed to list follow-ups", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to list follow-ups")


@router.get("/{follow_up_id}")
async def get_follow_up(
    follow_up_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """Get a follow-up with check history"""
    try:
        fu = (
            supabase.table("follow_ups")
            .select("*, submission:submissions(id, title, portal, status), opportunity:opportunities(id, title, agency)")
            .eq("id", follow_up_id)
            .single()
            .execute()
        )
        if not fu.data:
            raise HTTPException(status_code=404, detail="Follow-up not found")

        # Ownership check: non-admins can only see their own follow-ups
        if user.get("role") != "admin" and fu.data.get("assigned_to") != user["id"]:
            raise HTTPException(status_code=403, detail="Not authorized to view this follow-up")

        # Get check history
        checks = (
            supabase.table("follow_up_checks")
            .select("*")
            .eq("follow_up_id", follow_up_id)
            .order("checked_at", desc=True)
            .limit(20)
            .execute()
        )

        return {
            "success": True,
            "data": fu.data,
            "checks": checks.data,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get follow-up", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to get follow-up")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_follow_up(
    submission_id: str,
    check_type: str = "status_check",
    check_interval_hours: int = 24,
    max_checks: int = 30,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """Create a new follow-up tracker for a submission"""
    try:
        sub = supabase.table("submissions").select("id, opportunity_id").eq("id", submission_id).single().execute()
        if not sub.data:
            raise HTTPException(status_code=404, detail="Submission not found")

        result = supabase.table("follow_ups").insert({
            "submission_id": submission_id,
            "opportunity_id": sub.data.get("opportunity_id"),
            "status": "pending",
            "check_type": check_type,
            "next_check_at": (datetime.now(timezone.utc) + timedelta(hours=check_interval_hours)).isoformat(),
            "check_interval_hours": check_interval_hours,
            "max_checks": max_checks,
            "assigned_to": user["id"],
            "auto_check": True,
        }).execute()

        return result.data[0] if result.data else {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to create follow-up", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to create follow-up")


@router.patch("/{follow_up_id}")
async def update_follow_up(
    follow_up_id: str,
    status_update: Optional[str] = None,
    auto_check: Optional[bool] = None,
    check_interval_hours: Optional[int] = None,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """Update follow-up settings"""
    try:
        VALID_STATUSES = {"pending", "checked", "updated", "no_change", "awarded", "lost", "cancelled"}
        updates = {}
        if status_update is not None:
            if status_update not in VALID_STATUSES:
                raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {sorted(VALID_STATUSES)}")
            updates["status"] = status_update
        if auto_check is not None:
            updates["auto_check"] = auto_check
        if check_interval_hours is not None:
            updates["check_interval_hours"] = check_interval_hours

        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")

        # Ownership check
        existing = supabase.table("follow_ups").select("assigned_to").eq("id", follow_up_id).single().execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Follow-up not found")
        if user.get("role") != "admin" and existing.data.get("assigned_to") != user["id"]:
            raise HTTPException(status_code=403, detail="Not authorized")

        supabase.table("follow_ups").update(updates).eq("id", follow_up_id).execute()

        return {"success": True, "message": "Follow-up updated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update follow-up", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to update follow-up")


@router.post("/{follow_up_id}/check-now")
async def trigger_manual_check(
    follow_up_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """Manually trigger a follow-up check"""
    try:
        fu = supabase.table("follow_ups").select("*").eq("id", follow_up_id).single().execute()
        if not fu.data:
            raise HTTPException(status_code=404, detail="Follow-up not found")
        if user.get("role") != "admin" and fu.data.get("assigned_to") != user["id"]:
            raise HTTPException(status_code=403, detail="Not authorized")

        # Import and run check inline
        from ..tasks.follow_ups import _check_opportunity_status

        result = await _check_opportunity_status(fu.data.get("opportunity_id"), supabase)

        # Record the check
        supabase.table("follow_up_checks").insert({
            "follow_up_id": follow_up_id,
            "check_type": "manual",
            "status_found": result.get("status"),
            "changes_detected": result.get("changed", False),
            "details": result,
            "ai_analysis": result.get("analysis"),
        }).execute()

        # Update follow-up
        supabase.table("follow_ups").update({
            "last_checked_at": datetime.now(timezone.utc).isoformat(),
            "last_result": result,
            "portal_status": result.get("status"),
            "checks_performed": (fu.data.get("checks_performed") or 0) + 1,
        }).eq("id", follow_up_id).execute()

        return {
            "success": True,
            "result": result,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Manual check failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to run manual check")


@router.delete("/{follow_up_id}")
async def delete_follow_up(
    follow_up_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """Delete a follow-up tracker"""
    try:
        existing = supabase.table("follow_ups").select("assigned_to").eq("id", follow_up_id).single().execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Follow-up not found")
        if user.get("role") != "admin" and existing.data.get("assigned_to") != user["id"]:
            raise HTTPException(status_code=403, detail="Not authorized")

        supabase.table("follow_ups").delete().eq("id", follow_up_id).execute()
        return {"success": True, "message": "Follow-up deleted"}
    except Exception as e:
        logger.error("Failed to delete follow-up", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to delete follow-up")
