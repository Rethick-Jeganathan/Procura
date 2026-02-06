"""
Correspondence Router
Contract award notifications, emails, and AI-powered follow-up management.
"""
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from supabase import Client
import structlog

from ..dependencies import get_current_user, require_officer, get_request_supabase

logger = structlog.get_logger()

router = APIRouter()

VALID_TYPES = [
    "award_notice", "rejection_notice", "amendment", "question",
    "clarification", "extension", "cancellation", "general",
]

VALID_STATUSES = ["new", "read", "action_required", "responded", "archived"]


class CorrespondenceCreate(BaseModel):
    submission_id: Optional[str] = None
    opportunity_id: Optional[str] = None
    type: str = "general"
    subject: str
    body: Optional[str] = None
    source: str = "manual"
    sender: Optional[str] = None
    award_amount: Optional[float] = None
    contract_number: Optional[str] = None
    period_of_performance_start: Optional[str] = None
    period_of_performance_end: Optional[str] = None


class CorrespondenceResponse(BaseModel):
    submission_id: Optional[str] = None
    response_notes: str


@router.get("")
async def list_correspondence(
    type_filter: Optional[str] = Query(None, alias="type"),
    status_filter: Optional[str] = Query(None, alias="status"),
    submission_id: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """List correspondence with filters"""
    offset = (page - 1) * limit

    try:
        query = supabase.table("correspondence").select(
            "*, submission:submissions(id, title, portal), opportunity:opportunities(id, title, agency)",
            count="exact"
        )

        if user.get("role") != "admin":
            query = query.or_(f"created_by.eq.{user['id']},assigned_to.eq.{user['id']}")

        if type_filter:
            query = query.eq("type", type_filter)
        if status_filter:
            query = query.eq("status", status_filter)
        if submission_id:
            query = query.eq("submission_id", submission_id)
        if search:
            safe_search = search.replace(",", "").replace("(", "").replace(")", "").replace(".", "")
            query = query.ilike("subject", f"%{safe_search}%")

        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
        response = query.execute()

        return {
            "success": True,
            "data": response.data,
            "total": response.count or len(response.data),
        }

    except Exception as e:
        logger.error("Failed to list correspondence", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to list correspondence")


@router.get("/stats")
async def correspondence_stats(
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """Get correspondence statistics (admin sees all, others see own)"""
    try:
        query = supabase.table("correspondence").select("type, status")
        if user.get("role") != "admin":
            query = query.or_(f"recipient_id.eq.{user['id']},sender_id.eq.{user['id']}")
        all_corr = query.execute()

        stats = {
            "total": len(all_corr.data),
            "by_type": {},
            "by_status": {},
            "awards": 0,
            "action_required": 0,
            "unread": 0,
        }

        for c in all_corr.data:
            t = c.get("type", "general")
            s = c.get("status", "new")
            stats["by_type"][t] = stats["by_type"].get(t, 0) + 1
            stats["by_status"][s] = stats["by_status"].get(s, 0) + 1

            if t == "award_notice":
                stats["awards"] += 1
            if s == "action_required":
                stats["action_required"] += 1
            if s == "new":
                stats["unread"] += 1

        return {"success": True, "data": stats}

    except Exception as e:
        logger.error("Failed to get stats", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to get statistics")


@router.get("/{correspondence_id}")
async def get_correspondence(
    correspondence_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """Get a single correspondence item with full details"""
    try:
        c = (
            supabase.table("correspondence")
            .select("*, submission:submissions(id, title, portal, status), opportunity:opportunities(id, title, agency)")
            .eq("id", correspondence_id)
            .single()
            .execute()
        )
        if not c.data:
            raise HTTPException(status_code=404, detail="Correspondence not found")

        # Ownership check: non-admins can only see their own correspondence
        if user.get("role") != "admin":
            if c.data.get("recipient_id") != user["id"] and c.data.get("sender_id") != user["id"]:
                raise HTTPException(status_code=403, detail="Not authorized to view this correspondence")

        # Auto-mark as read
        if c.data.get("status") == "new":
            supabase.table("correspondence").update({
                "status": "read",
            }).eq("id", correspondence_id).execute()
            c.data["status"] = "read"

        return {"success": True, "data": c.data}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get correspondence", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to get correspondence")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_correspondence(
    data: CorrespondenceCreate,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """Create a new correspondence record (manual entry or from email)"""
    try:
        if data.type not in VALID_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {VALID_TYPES}")

        record = {
            "submission_id": data.submission_id,
            "opportunity_id": data.opportunity_id,
            "type": data.type,
            "status": "new",
            "subject": data.subject,
            "body": data.body,
            "source": data.source,
            "sender": data.sender,
            "received_at": datetime.now(timezone.utc).isoformat(),
            "created_by": user["id"],
            "assigned_to": user["id"],
        }

        # Award-specific fields
        if data.type == "award_notice":
            record["award_amount"] = data.award_amount
            record["contract_number"] = data.contract_number
            record["period_of_performance_start"] = data.period_of_performance_start
            record["period_of_performance_end"] = data.period_of_performance_end
            record["status"] = "action_required"

        # AI processing: generate summary and suggested actions
        ai_result = await _ai_process_correspondence(data.subject, data.body, data.type)
        if ai_result:
            record["ai_summary"] = ai_result.get("summary")
            record["ai_suggested_actions"] = ai_result.get("actions")
            record["ai_sentiment"] = ai_result.get("sentiment")

        result = supabase.table("correspondence").insert(record).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create correspondence")

        corr_id = result.data[0]["id"]

        # If this is an award notice, update related records
        if data.type == "award_notice" and data.submission_id:
            try:
                supabase.table("submissions").update({
                    "status": "awarded",
                }).eq("id", data.submission_id).execute()

                supabase.table("follow_ups").update({
                    "status": "awarded",
                }).eq("submission_id", data.submission_id).execute()
            except Exception:
                pass

            # Notify team
            try:
                # Get all officers
                officers = supabase.table("profiles").select("id").in_(
                    "role", ["admin", "contract_officer"]
                ).execute()

                for officer in (officers.data or []):
                    supabase.table("notifications").insert({
                        "user_id": officer["id"],
                        "title": "Contract Award!",
                        "body": f"Award received: {data.subject}",
                        "type": "award",
                        "priority": "urgent",
                        "entity_type": "correspondence",
                        "entity_id": corr_id,
                    }).execute()
            except Exception:
                pass

        logger.info("Correspondence created", id=corr_id, type=data.type)

        return result.data[0]

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to create correspondence", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to create correspondence")


@router.patch("/{correspondence_id}/status")
async def update_correspondence_status(
    correspondence_id: str,
    new_status: str = Query(..., min_length=1),
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """Update correspondence status"""
    try:
        if new_status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {VALID_STATUSES}")

        existing = supabase.table("correspondence").select("id").eq("id", correspondence_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Correspondence not found")

        supabase.table("correspondence").update({
            "status": new_status,
        }).eq("id", correspondence_id).execute()

        return {"success": True, "message": f"Status updated to {new_status}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update status", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to update status")


@router.post("/{correspondence_id}/respond")
async def respond_to_correspondence(
    correspondence_id: str,
    data: CorrespondenceResponse,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """Record a response to correspondence"""
    try:
        existing = supabase.table("correspondence").select("id").eq("id", correspondence_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Correspondence not found")

        supabase.table("correspondence").update({
            "status": "responded",
            "responded_at": datetime.now(timezone.utc).isoformat(),
            "responded_by": user["id"],
            "response_notes": data.response_notes,
        }).eq("id", correspondence_id).execute()

        return {"success": True, "message": "Response recorded"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to record response", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to record response")


@router.post("/{correspondence_id}/ai-analyze")
async def ai_analyze_correspondence(
    correspondence_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """Run AI analysis on a correspondence item"""
    try:
        c = supabase.table("correspondence").select("*").eq("id", correspondence_id).single().execute()
        if not c.data:
            raise HTTPException(status_code=404, detail="Correspondence not found")

        result = await _ai_process_correspondence(
            c.data.get("subject", ""),
            c.data.get("body", ""),
            c.data.get("type", "general"),
        )

        if result:
            supabase.table("correspondence").update({
                "ai_summary": result.get("summary"),
                "ai_suggested_actions": result.get("actions"),
                "ai_sentiment": result.get("sentiment"),
            }).eq("id", correspondence_id).execute()

        return {"success": True, "analysis": result}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to analyze", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to run AI analysis")


# ===========================================
# Notifications (in-app)
# ===========================================

@router.get("/notifications/list")
async def list_notifications(
    unread_only: bool = False,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """List notifications for the current user"""
    offset = (page - 1) * limit

    try:
        query = supabase.table("notifications").select("*", count="exact")
        query = query.eq("user_id", user["id"])

        if unread_only:
            query = query.eq("read", False)

        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
        response = query.execute()

        return {
            "success": True,
            "data": response.data,
            "total": response.count or len(response.data),
        }

    except Exception as e:
        logger.error("Failed to list notifications", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to list notifications")


@router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """Mark a notification as read"""
    try:
        supabase.table("notifications").update({
            "read": True,
            "read_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", notification_id).eq("user_id", user["id"]).execute()

        return {"success": True}

    except Exception as e:
        logger.error("Failed to mark read", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to mark notification as read")


@router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """Mark all notifications as read"""
    try:
        supabase.table("notifications").update({
            "read": True,
            "read_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user["id"]).eq("read", False).execute()

        return {"success": True, "message": "All notifications marked as read"}

    except Exception as e:
        logger.error("Failed to mark all read", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to mark all as read")


# ===========================================
# AI Processing Helper
# ===========================================

async def _ai_process_correspondence(subject: str, body: str, corr_type: str) -> dict:
    """Use LLM to analyze correspondence and suggest actions"""
    try:
        from ..ai.llm_client import get_llm_client

        llm = get_llm_client()

        prompt = f"""Analyze this government contract correspondence and provide:
1. A brief summary (2-3 sentences)
2. Sentiment (positive, neutral, or negative)
3. 3-5 suggested follow-up actions

Type: {corr_type}
Subject: {subject}
Body: {body or 'N/A'}

Respond in JSON format:
{{
    "summary": "...",
    "sentiment": "positive|neutral|negative",
    "actions": ["action1", "action2", ...]
}}"""

        result = await llm.analyze_json(prompt)

        if isinstance(result, dict):
            return result

        return None

    except Exception as e:
        logger.warning("AI correspondence analysis failed", error=str(e))
        return None
