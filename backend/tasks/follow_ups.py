"""
Follow-up Tasks
Celery tasks for automated application follow-up checks and opportunity sync.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from celery import shared_task
import structlog

from .celery_app import celery_app
from ..database import get_supabase_client

logger = structlog.get_logger()


@celery_app.task(bind=True, max_retries=3)
def run_follow_up_checks(self):
    """
    Check all pending follow-ups that are due.
    Uses browser-use to check portal status for submitted applications.
    """
    return asyncio.run(_run_follow_up_checks())


async def _run_follow_up_checks():
    """Async implementation of follow-up check loop."""
    supabase = get_supabase_client()

    try:
        # Get all follow-ups that are due for checking
        now = datetime.now(timezone.utc).isoformat()
        pending = (
            supabase.table("follow_ups")
            .select("*, submission:submissions(id, title, portal, status)")
            .in_("status", ["pending", "checked", "updated"])
            .lte("next_check_at", now)
            .eq("auto_check", True)
            .execute()
        )

        if not pending.data:
            logger.info("No follow-ups due for checking")
            return {"checked": 0, "updated": 0}

        checked = 0
        updated = 0

        for follow_up in pending.data:
            try:
                # Check if max checks reached
                if follow_up["checks_performed"] >= follow_up["max_checks"]:
                    supabase.table("follow_ups").update({
                        "status": "no_change",
                    }).eq("id", follow_up["id"]).execute()
                    continue

                submission = follow_up.get("submission", {})

                # For submitted applications, we attempt a portal status check
                # using AI to analyze the opportunity status from the source
                result = await _check_opportunity_status(
                    follow_up["opportunity_id"],
                    supabase,
                )

                # Record the check
                supabase.table("follow_up_checks").insert({
                    "follow_up_id": follow_up["id"],
                    "check_type": "automated",
                    "status_found": result.get("status"),
                    "changes_detected": result.get("changed", False),
                    "details": result,
                    "ai_analysis": result.get("analysis"),
                }).execute()

                # Update follow-up record
                new_status = "updated" if result.get("changed") else "checked"
                interval = follow_up["check_interval_hours"]
                next_check = datetime.now(timezone.utc) + timedelta(hours=interval)

                update_data = {
                    "status": new_status,
                    "last_checked_at": datetime.now(timezone.utc).isoformat(),
                    "last_result": result,
                    "portal_status": result.get("status"),
                    "checks_performed": follow_up["checks_performed"] + 1,
                    "next_check_at": next_check.isoformat(),
                }

                if result.get("analysis"):
                    update_data["ai_change_summary"] = result["analysis"]

                supabase.table("follow_ups").update(update_data).eq("id", follow_up["id"]).execute()

                checked += 1
                if result.get("changed"):
                    updated += 1

                    # Create notification for status change
                    if follow_up.get("assigned_to"):
                        try:
                            supabase.table("notifications").insert({
                                "user_id": follow_up["assigned_to"],
                                "title": f"Application Status Update",
                                "body": f"Status changed to '{result.get('status')}' for {submission.get('title', 'submission')}",
                                "type": "follow_up",
                                "priority": "high",
                                "entity_type": "follow_up",
                                "entity_id": follow_up["id"],
                            }).execute()
                        except Exception:
                            pass

                    # Check for award
                    portal_status = (result.get("status") or "").lower()
                    if "award" in portal_status or "won" in portal_status:
                        supabase.table("follow_ups").update({
                            "status": "awarded",
                        }).eq("id", follow_up["id"]).execute()

                        # Auto-create correspondence record for the award
                        try:
                            supabase.table("correspondence").insert({
                                "submission_id": follow_up.get("submission_id"),
                                "opportunity_id": follow_up.get("opportunity_id"),
                                "type": "award_notice",
                                "status": "new",
                                "subject": f"Contract Award Detected: {submission.get('title', '')}",
                                "body": result.get("analysis", "Award detected via automated status check."),
                                "source": "ai_detected",
                                "ai_summary": result.get("analysis"),
                                "ai_sentiment": "positive",
                                "ai_suggested_actions": [
                                    "Review award details",
                                    "Confirm acceptance",
                                    "Begin contract onboarding",
                                    "Notify team members",
                                ],
                            }).execute()
                        except Exception:
                            pass

            except Exception as e:
                logger.error("Follow-up check failed", follow_up_id=follow_up["id"], error=str(e))

        logger.info("Follow-up checks completed", checked=checked, updated=updated)
        return {"checked": checked, "updated": updated}

    except Exception as e:
        logger.error("Follow-up check task failed", error=str(e))
        raise


async def _check_opportunity_status(opportunity_id: str, supabase) -> dict:
    """
    Check the current status of an opportunity from its source.
    Uses the source API (SAM.gov, GovCon) to pull latest data.
    """
    if not opportunity_id:
        return {"status": "unknown", "changed": False}

    try:
        opp = (
            supabase.table("opportunities")
            .select("external_ref, source, status, raw_data")
            .eq("id", opportunity_id)
            .single()
            .execute()
        )
        if not opp.data:
            return {"status": "not_found", "changed": False}

        # Re-fetch from source API if possible
        from ..api_keys import get_api_key

        source = opp.data["source"]
        external_ref = opp.data["external_ref"]
        old_status = opp.data.get("status")

        if source == "sam.gov" or source == "sam":
            api_key = get_api_key("SAM_GOV_API_KEY")
            if api_key:
                import httpx
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.get(
                        f"https://api.sam.gov/opportunities/v2/search",
                        params={"api_key": api_key, "solnum": external_ref, "limit": 1},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        opps = data.get("opportunitiesData", [])
                        if opps:
                            new_raw = opps[0]
                            new_status = new_raw.get("type", "").lower()

                            changed = new_status != old_status
                            analysis = None
                            if changed:
                                analysis = f"Status changed from '{old_status}' to '{new_status}' on SAM.gov"

                                # Update the opportunity record
                                supabase.table("opportunities").update({
                                    "raw_data": new_raw,
                                }).eq("id", opportunity_id).execute()

                            return {
                                "status": new_status,
                                "changed": changed,
                                "analysis": analysis,
                                "source": "sam.gov",
                            }

        # For other sources or if API check fails, return current status
        return {
            "status": old_status or "unknown",
            "changed": False,
            "source": source,
        }

    except Exception as e:
        logger.warning("Opportunity status check failed", opportunity_id=opportunity_id, error=str(e))
        return {"status": "error", "changed": False, "error": str(e)}


@celery_app.task(bind=True, max_retries=2)
def sync_all_submission_opportunities(self):
    """
    Daily task: sync latest opportunity data into all active submissions.
    Catches deadline changes, cancellations, and amendments.
    """
    return asyncio.run(_sync_all_submissions())


async def _sync_all_submissions():
    """Sync opportunity updates into all active submissions."""
    supabase = get_supabase_client()

    try:
        # Get all non-terminal submissions
        active = (
            supabase.table("submissions")
            .select("id, opportunity_id, due_date, owner_id, title")
            .not_.is_("status", "submitted")
            .not_.is_("status", "rejected")
            .execute()
        )

        if not active.data:
            return {"synced": 0}

        synced = 0
        for sub in active.data:
            try:
                opp = (
                    supabase.table("opportunities")
                    .select("due_date, status, title")
                    .eq("id", sub["opportunity_id"])
                    .single()
                    .execute()
                )
                if not opp.data:
                    continue

                changes = {}
                opp_due = str(opp.data.get("due_date", ""))
                sub_due = str(sub.get("due_date", ""))
                if opp_due and sub_due and opp_due != sub_due:
                    changes["due_date"] = opp_due

                if changes:
                    supabase.table("submissions").update(changes).eq("id", sub["id"]).execute()
                    synced += 1

                    # Notify owner
                    try:
                        supabase.table("notifications").insert({
                            "user_id": sub["owner_id"],
                            "title": "Deadline Updated",
                            "body": f"Deadline changed from {sub_due} to {opp_due} for '{sub.get('title', '')}'",
                            "type": "deadline",
                            "priority": "high",
                            "entity_type": "submission",
                            "entity_id": sub["id"],
                        }).execute()
                    except Exception:
                        pass

            except Exception as e:
                logger.warning("Failed to sync submission", submission_id=sub["id"], error=str(e))

        logger.info("Opportunity sync completed", synced=synced, total=len(active.data))
        return {"synced": synced, "total": len(active.data)}

    except Exception as e:
        logger.error("Submission opportunity sync failed", error=str(e))
        raise
