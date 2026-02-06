"""
Submission Engine
Orchestrates the automated submission process via browser-use powered OpenManusClient.
"""
from datetime import datetime, timezone
from typing import Dict, Any
import structlog

from .openmanus_client import OpenManusClient
from ..database import get_supabase_client
from ..security.vault import decrypt_credentials
from ..security.audit import sign_audit_log

logger = structlog.get_logger()


async def execute_submission(
    submission_id: str,
    run_id: str,
    dry_run: bool = False,
    headless: bool = True,
) -> Dict[str, Any]:
    """
    Execute automated submission via browser-use powered OpenManusClient.

    1. Load submission and related data from Supabase
    2. Get portal credentials from encrypted vault
    3. Execute browser automation (LLM-driven Playwright agent)
    4. Create audit log with cryptographic signature
    5. Update submission status
    """
    supabase = get_supabase_client()
    start_time = datetime.now(timezone.utc)

    try:
        # Update run status
        supabase.table("submission_runs").update({
            "status": "running",
            "current_step": "loading"
        }).eq("id", run_id).execute()

        # Get submission with files
        submission = supabase.table("submissions").select(
            "*, opportunity:opportunities(*), files:submission_files(*)"
        ).eq("id", submission_id).single().execute()

        if not submission.data:
            raise ValueError("Submission not found")

        sub_data = submission.data
        portal = sub_data["portal"]

        # Get portal connector and credentials
        connector = supabase.table("connectors").select("*").eq(
            "name", portal
        ).single().execute()
        if not connector.data:
            raise ValueError(f"No connector configured for portal: {portal}")

        # Update step
        supabase.table("submission_runs").update({
            "current_step": "decrypting_credentials"
        }).eq("id", run_id).execute()

        credentials = decrypt_credentials(connector.data["encrypted_credentials"])

        # Prepare form data from opportunity
        opp = sub_data.get("opportunity", {})
        form_data = {
            "title": opp.get("title"),
            "solicitation_number": opp.get("external_ref"),
            "agency": opp.get("agency"),
            "description": opp.get("description"),
            "naics_code": opp.get("naics_code"),
            "set_aside": opp.get("set_aside"),
        }
        # Remove None values to keep the prompt clean
        form_data = {k: v for k, v in form_data.items() if v is not None}

        # Prepare files
        files = [
            {"name": f["file_name"], "path": f["storage_path"]}
            for f in sub_data.get("files", [])
        ]

        # Update step
        supabase.table("submission_runs").update({
            "current_step": "launching_browser"
        }).eq("id", run_id).execute()

        portal_url = connector.data.get("portal_url", f"https://{portal}")

        logger.info(
            "Executing submission via browser-use",
            submission_id=submission_id,
            portal=portal,
            portal_url=portal_url,
            files_count=len(files),
            dry_run=dry_run,
        )

        # Execute via browser-use powered OpenManusClient
        supabase.table("submission_runs").update({
            "current_step": "submitting"
        }).eq("id", run_id).execute()

        async with OpenManusClient(headless=headless) as client:
            result = await client.submit_proposal(
                portal_url=portal_url,
                credentials=credentials,
                form_data=form_data,
                files=files,
                dry_run=dry_run,
            )

        end_time = datetime.now(timezone.utc)
        duration_ms = int((end_time - start_time).total_seconds() * 1000)

        # Update run with result
        run_update = {
            "status": "success" if result["success"] else "failed",
            "end_time": end_time.isoformat(),
            "duration_ms": duration_ms,
            "receipt_id": result.get("receipt_id"),
            "confirmation_number": result.get("confirmation_number"),
            "screenshot_paths": result.get("screenshots", []),
            "error_message": result.get("error"),
            "current_step": "completed" if result["success"] else "failed",
            "evidence_dir": result.get("evidence_dir"),
        }
        supabase.table("submission_runs").update(run_update).eq("id", run_id).execute()

        if result["success"]:
            # Update submission status
            supabase.table("submissions").update({
                "status": "submitted"
            }).eq("id", submission_id).execute()

            # Create audit log with cryptographic signature
            audit_data = {
                "submission_id": submission_id,
                "submission_ref": opp.get("external_ref", "UNKNOWN"),
                "portal": portal,
                "action": "SUBMIT" if not dry_run else "DRY_RUN",
                "status": "CONFIRMED",
                "receipt_id": result.get("receipt_id"),
                "evidence_urls": result.get("screenshots", []),
                "metadata": {
                    "run_id": run_id,
                    "confirmation_number": result.get("confirmation_number"),
                    "steps": result.get("steps_completed", []),
                    "duration_ms": duration_ms,
                    "evidence_dir": result.get("evidence_dir"),
                }
            }
            audit_data["confirmation_hash"] = sign_audit_log(audit_data)
            supabase.table("audit_logs").insert(audit_data).execute()

            logger.info(
                "Submission completed successfully",
                submission_id=submission_id,
                receipt=result.get("receipt_id"),
                duration_ms=duration_ms,
            )
        else:
            # Create failure audit log
            audit_data = {
                "submission_id": submission_id,
                "submission_ref": opp.get("external_ref", "UNKNOWN"),
                "portal": portal,
                "action": "SUBMIT_FAILED",
                "status": "FAILED",
                "metadata": {
                    "run_id": run_id,
                    "error": result.get("error"),
                    "steps": result.get("steps_completed", []),
                    "duration_ms": duration_ms,
                }
            }
            audit_data["confirmation_hash"] = sign_audit_log(audit_data)
            supabase.table("audit_logs").insert(audit_data).execute()

            logger.error(
                "Submission failed",
                submission_id=submission_id,
                error=result.get("error"),
            )

        return result

    except Exception as e:
        logger.error(
            "Submission execution error",
            submission_id=submission_id,
            error=str(e),
        )

        # Update run as failed
        supabase.table("submission_runs").update({
            "status": "failed",
            "end_time": datetime.now(timezone.utc).isoformat(),
            "error_message": str(e),
            "current_step": "error",
        }).eq("id", run_id).execute()

        raise
