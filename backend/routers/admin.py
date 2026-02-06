"""
Admin Dashboard API Router (Extended)
Comprehensive admin endpoints for full platform management
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from supabase import Client
from pydantic import BaseModel, Field
import structlog

from ..dependencies import get_current_user, require_role, get_request_supabase
from ..database import db
from ..config import settings
from ..api_keys import get_api_key
from ..models import BaseResponse, UserRole
from ..scrapers.govcon_api import GovConAPIConnector
from ..scrapers.sam_gov import SAMGovConnector

logger = structlog.get_logger()

router = APIRouter(tags=["Admin"])


# ============================================
# Request/Response Models
# ============================================

class SystemSettingUpdate(BaseModel):
    value: Any


class FeatureFlagUpdate(BaseModel):
    enabled: bool
    description: Optional[str] = None


class DiscoveryConfigUpdate(BaseModel):
    source_name: str
    enabled: bool = True
    schedule_cron: Optional[str] = None
    rate_limit: int = 60
    filters: Optional[Dict] = None


class AIConfigUpdate(BaseModel):
    provider: str  # google, anthropic, openai
    model: Optional[str] = None
    max_tokens: int = 2048
    temperature: float = 0.3


class WorkflowConfigUpdate(BaseModel):
    autonomy_enabled: bool = False
    autonomy_threshold: float = 50000.0
    approval_steps: List[Dict] = []


class AlertRuleCreate(BaseModel):
    name: str
    condition: Dict
    action: str  # email, webhook, in_app
    recipients: List[str]
    enabled: bool = True


class RoleUpdate(BaseModel):
    role: UserRole


# ============================================
# Dashboard Metrics
# ============================================

@router.get("/metrics")
async def get_dashboard_metrics(
    user: dict = Depends(require_role(["admin"]))
):
    """Get comprehensive dashboard metrics"""
    try:
        # Opportunities metrics
        opps = await db.get_opportunities(limit=1000)
        opp_by_status = {}
        for opp in opps:
            status = opp.get("status", "unknown")
            opp_by_status[status] = opp_by_status.get(status, 0) + 1
        
        # Submissions metrics
        subs = await db.get_submissions(limit=1000)
        sub_by_status = {}
        for sub in subs:
            status = sub.get("status", "unknown")
            sub_by_status[status] = sub_by_status.get(status, 0) + 1
        
        # Recent discovery runs
        runs = await db.get_discovery_runs(limit=10)
        success_runs = len([r for r in runs if r.get("status") == "success"])
        failed_runs = len([r for r in runs if r.get("status") == "failed"])
        
        # Connectors status
        connectors = await db.get_connectors()
        active_connectors = len([c for c in connectors if c.get("status") == "active"])
        total_connectors = len(connectors)
        
        return {
            "opportunities": {
                "total": len(opps),
                "by_status": opp_by_status,
                "new_today": len([o for o in opps if o.get("created_at", "").startswith(datetime.now(timezone.utc).strftime("%Y-%m-%d"))])
            },
            "submissions": {
                "total": len(subs),
                "by_status": sub_by_status,
                "pending_approval": sub_by_status.get("pending_approval", 0)
            },
            "discovery": {
                "success_rate": (success_runs / max(len(runs), 1)) * 100,
                "recent_runs": len(runs),
                "failed_runs": failed_runs
            },
            "connectors": {
                "total": total_connectors,
                "active": active_connectors,
                "inactive": total_connectors - active_connectors
            },
            "system": {
                "environment": settings.ENVIRONMENT,
                "llm_provider": settings.PROCURA_LLM_PROVIDER,
                "llm_model": settings.LLM_MODEL,
                "cache_enabled": True,
                "redis_connected": True  # Would check actual connection
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        logger.error("Failed to get metrics", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to retrieve dashboard metrics")


# ============================================
# System Settings Management
# ============================================

@router.get("/settings")
async def list_system_settings(
    user: dict = Depends(require_role(["admin"]))
):
    """List all system settings"""
    result = await db.client.table("system_settings").select("*").execute()
    return {"settings": result.data}


@router.get("/settings/{key}")
async def get_system_setting(
    key: str,
    user: dict = Depends(require_role(["admin"]))
):
    """Get a specific system setting"""
    result = await db.client.table("system_settings").select("*").eq("key", key).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Setting not found")
    return result.data[0]


@router.put("/settings/{key}")
async def update_system_setting(
    key: str,
    update: SystemSettingUpdate,
    user: dict = Depends(require_role(["admin"]))
):
    """Update a system setting"""
    result = await db.client.table("system_settings").upsert({
        "key": key,
        "value": update.value,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": user.get("id")
    }).execute()
    
    logger.info("System setting updated", key=key, by=user.get("email"))
    return result.data[0] if result.data else {"key": key, "value": update.value}


@router.delete("/settings/{key}")
async def delete_system_setting(
    key: str,
    user: dict = Depends(require_role(["admin"]))
):
    """Delete a system setting"""
    await db.client.table("system_settings").delete().eq("key", key).execute()
    return {"deleted": True}


# ============================================
# Feature Flags
# ============================================

@router.get("/feature-flags")
async def list_feature_flags(
    user: dict = Depends(require_role(["admin"]))
):
    """List all feature flags"""
    # Check if table exists, if not return defaults
    try:
        result = await db.client.table("feature_flags").select("*").execute()
        return {"flags": result.data}
    except Exception:
        # Return default flags if table doesn't exist yet
        return {
            "flags": [
                {"key": "discovery_enabled", "enabled": True, "description": "Enable automated discovery"},
                {"key": "ai_qualification", "enabled": True, "description": "Enable AI-powered qualification"},
                {"key": "browser_automation", "enabled": False, "description": "Enable OpenManus automation"},
                {"key": "autonomy_mode", "enabled": False, "description": "Enable autonomous approvals"},
                {"key": "email_notifications", "enabled": True, "description": "Send email notifications"},
            ]
        }


@router.put("/feature-flags/{key}")
async def update_feature_flag(
    key: str,
    update: FeatureFlagUpdate,
    user: dict = Depends(require_role(["admin"]))
):
    """Update a feature flag"""
    try:
        result = await db.client.table("feature_flags").upsert({
            "key": key,
            "enabled": update.enabled,
            "description": update.description,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).execute()
        return result.data[0] if result.data else {"key": key, "enabled": update.enabled}
    except Exception:
        return {"key": key, "enabled": update.enabled, "description": update.description}


# ============================================
# Discovery Configuration
# ============================================

@router.get("/discovery/config")
async def get_discovery_config(
    user: dict = Depends(require_role(["admin"]))
):
    """Get discovery configuration"""
    connectors = await db.get_connectors()
    
    # Get settings
    settings_result = await db.client.table("system_settings").select("*").in_("key", [
        "discovery_interval_minutes",
        "discovery_auto_enabled",
        "discovery_naics_filter",
        "discovery_min_value",
        "discovery_agency_blacklist"
    ]).execute()
    
    settings_dict = {s["key"]: s["value"] for s in (settings_result.data or [])}
    
    return {
        "connectors": [
            {
                "name": c.get("name"),
                "label": c.get("label"),
                "enabled": c.get("status") == "active",
                "schedule": c.get("schedule_cron"),
                "rate_limit": c.get("rate_limit_per_min", 60),
                "last_run": c.get("last_run_at"),
                "last_success": c.get("last_success_at"),
                "error_count": c.get("error_count", 0)
            }
            for c in connectors
        ],
        "settings": {
            "interval_minutes": settings_dict.get("discovery_interval_minutes", 15),
            "auto_enabled": settings_dict.get("discovery_auto_enabled", True),
            "naics_filter": settings_dict.get("discovery_naics_filter", []),
            "min_value": settings_dict.get("discovery_min_value", 0),
            "agency_blacklist": settings_dict.get("discovery_agency_blacklist", [])
        }
    }


@router.put("/discovery/config")
async def update_discovery_config(
    config: Dict[str, Any],
    user: dict = Depends(require_role(["admin"]))
):
    """Update discovery configuration"""
    settings_to_update = config.get("settings", {})
    
    for key, value in settings_to_update.items():
        full_key = f"discovery_{key}"
        await db.client.table("system_settings").upsert({
            "key": full_key,
            "value": value,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user.get("id")
        }).execute()
    
    return {"updated": True, "settings": settings_to_update}


@router.post("/discovery/trigger")
async def trigger_discovery(
    payload: Optional[Dict[str, Any]] = Body(default=None),
    source: Optional[str] = None,  # query-param fallback
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_role(["admin"]))
):
    """Manually trigger discovery"""
    try:
        payload = payload or {}
        requested_source = (payload.get("source") or source or "all").strip().lower()

        connectors: dict[str, tuple[type, str]] = {
            "govcon": (GovConAPIConnector, "GOVCON_API_KEY"),
            "sam": (SAMGovConnector, "SAM_GOV_API_KEY"),
        }

        if requested_source != "all" and requested_source not in connectors:
            raise HTTPException(status_code=400, detail=f"Unknown connector: {requested_source}")

        connector_names = (
            [requested_source]
            if requested_source != "all"
            else [name for name, (_, key_name) in connectors.items() if get_api_key(key_name)]
        )

        if not connector_names:
            raise HTTPException(status_code=400, detail="No discovery connectors are configured. Add API keys in Settings.")

        since_days = min(int(payload.get("since_days") or 7), 365)
        since = datetime.now(timezone.utc) - timedelta(days=max(1, since_days))

        run_ids: list[str] = []
        results: dict[str, Any] = {}

        for name in connector_names:
            connector_class, key_name = connectors[name]
            api_key = get_api_key(key_name)
            if not api_key:
                results[name] = {"success": False, "error": "missing api key"}
                continue

            start_time = datetime.now(timezone.utc)
            run_id = None
            try:
                run = supabase.table("discovery_runs").insert(
                    {
                        "connector_name": name,
                        "run_type": "manual",
                        "status": "running",
                        "start_time": start_time.isoformat(),
                        "triggered_by": user.get("id"),
                    }
                ).execute()
                if run.data:
                    run_id = run.data[0].get("id")
                    run_ids.append(run_id)
            except Exception as e:
                # Best-effort run logging (RLS / schema mismatch shouldn't block discovery in dev).
                logger.warning("Failed to create discovery run record", connector=name, error=str(e)[:200])

            async with connector_class(api_key=api_key) as connector:
                discovery_result = await connector.run_discovery(since)

            opps = discovery_result.get("opportunities") or []
            if opps:
                supabase.table("opportunities").upsert(opps, on_conflict="external_ref").execute()

            end_time = datetime.now(timezone.utc)
            if run_id:
                try:
                    supabase.table("discovery_runs").update(
                        {
                            "status": "success" if discovery_result.get("success") else "failed",
                            "end_time": end_time.isoformat(),
                            "duration_ms": int((end_time - start_time).total_seconds() * 1000),
                            "records_fetched": discovery_result.get("records_fetched", 0),
                            "opportunities_created": len(opps),
                            "opportunities_updated": 0,
                            "errors": len(discovery_result.get("errors") or []),
                            "error_message": "; ".join((discovery_result.get("errors") or [])[:3]) or None,
                        }
                    ).eq("id", run_id).execute()
                except Exception as e:
                    logger.warning("Failed to update discovery run record", connector=name, error=str(e)[:200])

            results[name] = {
                "success": bool(discovery_result.get("success")),
                "records_fetched": discovery_result.get("records_fetched", 0),
                "upserted": len(opps),
                "run_id": run_id,
            }

        logger.info("Discovery triggered", source=requested_source, by=user.get("email"))
        return {"triggered": True, "source": requested_source, "run_ids": run_ids, "results": results}
    except Exception as e:
        logger.error("Discovery trigger failed", error=str(e))
        raise HTTPException(status_code=500, detail="Discovery trigger failed")


# ============================================
# AI Configuration
# ============================================

@router.get("/ai/config")
async def get_ai_config(
    user: dict = Depends(require_role(["admin"]))
):
    """Get AI configuration"""
    return {
        "provider": settings.PROCURA_LLM_PROVIDER,
        "model": settings.LLM_MODEL,
        "max_tokens": settings.LLM_MAX_TOKENS,
        "temperature": settings.LLM_TEMPERATURE,
        "providers_available": {
            "google": bool(settings.GOOGLE_API_KEY and settings.GOOGLE_API_KEY != "PLACEHOLDER_API_KEY"),
            "anthropic": bool(settings.ANTHROPIC_API_KEY and "PLACEHOLDER" not in (settings.ANTHROPIC_API_KEY or "")),
            "openai": bool(settings.OPENAI_API_KEY and "PLACEHOLDER" not in (settings.OPENAI_API_KEY or ""))
        },
        "qualification_thresholds": {
            "auto_qualify_min_score": 70,
            "auto_disqualify_max_score": 30,
            "require_review_range": [30, 70]
        }
    }


@router.post("/ai/test")
async def test_ai_connection(
    user: dict = Depends(require_role(["admin"]))
):
    """Test AI connection"""
    try:
        from ..ai.llm_client import get_llm_client

        client = get_llm_client()
        test_prompt = "Respond with only the word 'connected' to confirm the connection is working."

        response = await client.complete(test_prompt)

        return {
            "success": True,
            "provider": client.provider,
            "model": client.model,
            "response_preview": response[:100] if response else None
        }
    except Exception as e:
        return {
            "success": False,
            "provider": settings.PROCURA_LLM_PROVIDER,
            "error": str(e)
        }


# ============================================
# Workflow Configuration
# ============================================

@router.get("/workflows/config")
async def get_workflow_config(
    user: dict = Depends(require_role(["admin"]))
):
    """Get workflow configuration"""
    # Get autonomy settings
    autonomy_result = await db.client.table("system_settings").select("*").in_("key", [
        "autonomy_enabled",
        "autonomy_threshold_usd"
    ]).execute()
    
    autonomy_settings = {s["key"]: s["value"] for s in (autonomy_result.data or [])}
    
    return {
        "autonomy": {
            "enabled": autonomy_settings.get("autonomy_enabled", False),
            "threshold_usd": autonomy_settings.get("autonomy_threshold_usd", 50000)
        },
        "approval_steps": [
            {"order": 1, "name": "legal_review", "role": "contract_officer", "required": True},
            {"order": 2, "name": "finance_approval", "role": "admin", "required": True},
            {"order": 3, "name": "final_signoff", "role": "admin", "required": False}
        ],
        "notification_rules": {
            "on_new_opportunity": True,
            "on_deadline_approaching": True,
            "on_approval_needed": True,
            "deadline_warning_days": 7
        }
    }


@router.put("/workflows/config")
async def update_workflow_config(
    config: WorkflowConfigUpdate,
    user: dict = Depends(require_role(["admin"]))
):
    """Update workflow configuration"""
    # Update autonomy settings
    await db.client.table("system_settings").upsert({
        "key": "autonomy_enabled",
        "value": config.autonomy_enabled,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }).execute()
    
    await db.client.table("system_settings").upsert({
        "key": "autonomy_threshold_usd",
        "value": config.autonomy_threshold,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }).execute()
    
    return {"updated": True}


# ============================================
# Background Jobs Management
# ============================================

@router.get("/jobs")
async def list_jobs(
    status: Optional[str] = None,
    limit: int = 50,
    user: dict = Depends(require_role(["admin"]))
):
    """List background jobs"""
    # This would integrate with Celery in production
    # For now, return discovery runs as proxy for jobs
    runs = await db.get_discovery_runs(limit=limit)
    
    if status:
        runs = [r for r in runs if r.get("status") == status]
    
    return {
        "jobs": [
            {
                "id": r.get("id"),
                "type": "discovery",
                "name": f"Discovery: {r.get('connector_name')}",
                "status": r.get("status"),
                "started_at": r.get("start_time"),
                "finished_at": r.get("end_time"),
                "duration_ms": r.get("duration_ms"),
                "result": {
                    "fetched": r.get("records_fetched"),
                    "created": r.get("opportunities_created"),
                    "errors": r.get("errors")
                }
            }
            for r in runs
        ],
        "total": len(runs)
    }


@router.post("/jobs/{job_id}/retry")
async def retry_job(
    job_id: str,
    user: dict = Depends(require_role(["admin"]))
):
    """Retry a failed job"""
    # Would trigger Celery task in production
    return {"retried": True, "job_id": job_id}


# ============================================
# Cache Management
# ============================================

@router.post("/cache/clear")
async def clear_cache(
    cache_type: Optional[str] = None,  # llm, all
    user: dict = Depends(require_role(["admin"]))
):
    """Clear system cache"""
    if cache_type == "llm" or cache_type == "all":
        # Clear LLM cache
        await db.client.table("llm_cache").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    
    logger.info("Cache cleared", type=cache_type, by=user.get("email"))
    return {"cleared": True, "type": cache_type or "all"}


# ============================================
# Export Functions
# ============================================

@router.get("/export/opportunities")
async def export_opportunities(
    format: str = "json",  # json, csv
    user: dict = Depends(require_role(["admin"]))
):
    """Export all opportunities"""
    opps = await db.get_opportunities(limit=10000)
    return {"data": opps, "count": len(opps), "format": format}


@router.get("/export/submissions")
async def export_submissions(
    format: str = "json",
    user: dict = Depends(require_role(["admin"]))
):
    """Export all submissions"""
    subs = await db.get_submissions(limit=10000)
    return {"data": subs, "count": len(subs), "format": format}


@router.get("/export/audit-logs")
async def export_audit_logs(
    format: str = "json",
    user: dict = Depends(require_role(["admin"]))
):
    """Export all audit logs"""
    logs = await db.get_audit_logs(limit=10000)
    return {"data": logs, "count": len(logs), "format": format}


# ============================================
# User Management
# ============================================

@router.get("/users")
async def list_users(
    role: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_role(["admin"]))
):
    """List all users from the profiles table"""
    try:
        offset = (page - 1) * limit

        query = supabase.table("profiles").select("*", count="exact")

        if role:
            query = query.eq("role", role)
        if search:
            safe_search = search.replace(",", "").replace("(", "").replace(")", "").replace(".", "")
            query = query.or_(f"email.ilike.%{safe_search}%,full_name.ilike.%{safe_search}%")

        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)

        response = query.execute()

        return {
            "success": True,
            "data": response.data,
            "total": response.count or len(response.data),
            "page": page,
            "limit": limit,
        }
    except Exception as e:
        logger.error("Failed to list users", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch users")


@router.get("/users/{user_id}")
async def get_user(
    user_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_role(["admin"]))
):
    """Get a single user profile by ID"""
    try:
        response = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="User not found")
        return {"success": True, "data": response.data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get user", user_id=user_id, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch user")


@router.patch("/users/{user_id}", response_model=BaseResponse)
async def update_user(
    user_id: str,
    updates: dict = Body(...),
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_role(["admin"]))
):
    """Update a user profile (admin only). Accepts full_name, department, role."""
    try:
        if user_id == user.get("id") and "role" in updates:
            raise HTTPException(status_code=400, detail="Cannot change your own role")

        existing = supabase.table("profiles").select("id").eq("id", user_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="User not found")

        allowed_fields = {"full_name", "department", "role"}
        safe_updates = {k: v for k, v in updates.items() if k in allowed_fields and v is not None}
        if not safe_updates:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        supabase.table("profiles").update(safe_updates).eq("id", user_id).execute()

        logger.info("User updated", target_user_id=user_id, fields=list(safe_updates.keys()), by=user.get("email"))
        return BaseResponse(success=True, message="User updated")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update user", user_id=user_id, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to update user")


@router.post("/users/invite", response_model=BaseResponse)
async def invite_user(
    invite: dict = Body(...),
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_role(["admin"]))
):
    """Invite a new user by email with a specified role."""
    try:
        email = invite.get("email")
        role = invite.get("role", "viewer")

        if not email:
            raise HTTPException(status_code=400, detail="Email is required")
        if role not in ["admin", "contract_officer", "viewer"]:
            raise HTTPException(status_code=400, detail="Invalid role")

        # Check if user already exists
        existing = supabase.table("profiles").select("id").eq("email", email).execute()
        if existing.data:
            raise HTTPException(status_code=409, detail="User already exists")

        from ..database import get_supabase_client
        admin_client = get_supabase_client()
        result = admin_client.auth.admin.invite_user_by_email(email)

        if result.user:
            # Set the role on the profile that will be created by the trigger
            try:
                admin_client.table("profiles").update({"role": role}).eq("id", result.user.id).execute()
            except Exception:
                pass  # Profile may not exist yet if trigger hasn't fired

        logger.info("User invited", email=email, role=role, by=user.get("email"))
        return BaseResponse(success=True, message=f"Invitation sent to {email}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to invite user", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to invite user")


@router.patch("/users/{user_id}/role", response_model=BaseResponse)
async def update_user_role(
    user_id: str,
    update: RoleUpdate,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_role(["admin"]))
):
    """Update a user's role"""
    try:
        # Prevent admin from changing their own role
        if user_id == user.get("id"):
            raise HTTPException(
                status_code=400,
                detail="Cannot change your own role"
            )

        # Verify user exists
        existing = supabase.table("profiles").select("id, email").eq("id", user_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="User not found")

        # Update role
        supabase.table("profiles").update({
            "role": update.role.value,
        }).eq("id", user_id).execute()

        logger.info(
            "User role updated",
            target_user_id=user_id,
            new_role=update.role.value,
            by=user.get("email"),
        )

        return BaseResponse(success=True, message=f"Role updated to {update.role.value}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update user role", user_id=user_id, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to update user role")


@router.delete("/users/{user_id}", response_model=BaseResponse)
async def delete_user(
    user_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_role(["admin"]))
):
    """Delete a user profile"""
    try:
        # Prevent admin from deleting themselves
        if user_id == user.get("id"):
            raise HTTPException(
                status_code=400,
                detail="Cannot delete your own account"
            )

        # Verify user exists
        existing = supabase.table("profiles").select("id, email").eq("id", user_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="User not found")

        target_email = existing.data[0].get("email")

        # Delete from profiles table
        supabase.table("profiles").delete().eq("id", user_id).execute()

        # Also delete from Supabase Auth to prevent re-login
        try:
            from ..database import get_supabase_client
            admin_client = get_supabase_client()
            admin_client.auth.admin.delete_user(user_id)
        except Exception as auth_err:
            logger.warning("Failed to delete auth record (profile was deleted)", user_id=user_id, error=str(auth_err))

        logger.info(
            "User deleted",
            target_user_id=user_id,
            target_email=target_email,
            by=user.get("email"),
        )

        return BaseResponse(success=True, message=f"User {target_email} deleted")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete user", user_id=user_id, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to delete user")
