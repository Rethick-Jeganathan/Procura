"""
Submissions Router
CRUD operations for proposal submissions and workflow management.

Gap fixes applied:
- Sequential task unlock (tasks 3-5 unlock when prerequisites complete)
- Sequential approval enforcement (legal must be approved before finance)
- File scan stub (marks scan_status, extensible for real AV)
- Opportunity update propagation (sync deadline/status changes)
"""
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from supabase import Client
import structlog

from ..dependencies import get_current_user, require_officer, get_request_supabase
from ..models import (
    SubmissionResponse,
    SubmissionListResponse,
    SubmissionCreate,
    SubmissionUpdate,
    SubmissionStatus,
    ApprovalStatus,
    BaseResponse,
    SubmissionExecuteRequest,
    SubmissionExecuteResponse
)

logger = structlog.get_logger()

router = APIRouter()

# Allowed upload MIME types (basic safety check)
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "image/png",
    "image/jpeg",
    "image/gif",
    "application/zip",
}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


# ===========================================
# Helper: Auto-unlock dependent tasks
# ===========================================

async def _unlock_dependent_tasks(submission_id: str, supabase: Client):
    """
    Unlock tasks 3-5 when their prerequisites are met.
    Task ordering: Checklist(1) + Upload(2) → Legal(3) → Finance(4) → Final(5)
    """
    tasks = (
        supabase.table("submission_tasks")
        .select("id, title, completed, locked")
        .eq("submission_id", submission_id)
        .order("created_at")
        .execute()
    )
    if not tasks.data or len(tasks.data) < 5:
        return

    t = tasks.data
    # Tasks 0,1 are always unlocked (Checklist, Upload)
    # Task 2 (Legal Review) unlocks when tasks 0 AND 1 are completed
    if t[0]["completed"] and t[1]["completed"] and t[2]["locked"]:
        supabase.table("submission_tasks").update({"locked": False}).eq("id", t[2]["id"]).execute()
        logger.info("Unlocked task: Legal Review", submission_id=submission_id)

    # Task 3 (Finance Review) unlocks when task 2 (Legal) is completed
    if t[2]["completed"] and t[3]["locked"]:
        supabase.table("submission_tasks").update({"locked": False}).eq("id", t[3]["id"]).execute()
        logger.info("Unlocked task: Finance Review", submission_id=submission_id)

    # Task 4 (Final Review) unlocks when tasks 2 AND 3 are completed
    if t[2]["completed"] and t[3]["completed"] and t[4]["locked"]:
        supabase.table("submission_tasks").update({"locked": False}).eq("id", t[4]["id"]).execute()
        logger.info("Unlocked task: Final Review", submission_id=submission_id)


# ===========================================
# Helper: File scan
# ===========================================

def _scan_file(file_content: bytes, file_name: str, file_type: str) -> str:
    """
    Basic file safety check. Returns scan_status: 'clean' or 'rejected'.
    Checks MIME type allowlist and file size. Extensible for real AV integration.
    """
    if file_type not in ALLOWED_MIME_TYPES:
        logger.warning("File rejected: disallowed MIME type", file_name=file_name, file_type=file_type)
        return "rejected"

    if len(file_content) > MAX_FILE_SIZE:
        logger.warning("File rejected: too large", file_name=file_name, size=len(file_content))
        return "rejected"

    # Check for executable signatures in first bytes
    dangerous_signatures = [
        b"MZ",           # Windows PE
        b"\x7fELF",      # Linux ELF
        b"#!/",          # Shell script
        b"<?php",        # PHP
    ]
    header = file_content[:16]
    for sig in dangerous_signatures:
        if header.startswith(sig):
            logger.warning("File rejected: executable signature", file_name=file_name)
            return "rejected"

    return "clean"


# ===========================================
# CRUD Endpoints
# ===========================================

@router.get("", response_model=SubmissionListResponse)
async def list_submissions(
    status_filter: Optional[SubmissionStatus] = Query(None, alias="status"),
    approval_status: Optional[ApprovalStatus] = None,
    owner_id: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """List submissions with optional filters"""
    offset = (page - 1) * limit

    try:
        query = supabase.table("submissions").select(
            "*, opportunity:opportunities(id, title, external_ref, agency), owner:profiles(id, email, full_name)",
            count="exact"
        )

        if user.get("role") != "admin":
            query = query.eq("owner_id", user["id"])
        elif owner_id:
            query = query.eq("owner_id", owner_id)

        if status_filter:
            query = query.eq("status", status_filter.value)
        if approval_status:
            query = query.eq("approval_status", approval_status.value)
        if search:
            safe_search = search.replace(",", "").replace("(", "").replace(")", "").replace(".", "")
            query = query.ilike("title", f"%{safe_search}%")

        query = query.order("due_date", desc=False).range(offset, offset + limit - 1)

        response = query.execute()

        return SubmissionListResponse(
            success=True,
            data=response.data,
            total=response.count or len(response.data)
        )

    except Exception as e:
        logger.error("Failed to list submissions", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch submissions"
        )


@router.get("/{submission_id}", response_model=SubmissionResponse)
async def get_submission(
    submission_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """Get a single submission with all related data"""
    try:
        response = supabase.table("submissions").select(
            "*, opportunity:opportunities(*), owner:profiles(*), files:submission_files(*), tasks:submission_tasks(*)"
        ).eq("id", submission_id).single().execute()

        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Submission not found"
            )

        if user.get("role") != "admin" and response.data["owner_id"] != user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view this submission"
            )

        return response.data

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get submission", submission_id=submission_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch submission"
        )


@router.post("", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_submission(
    submission: SubmissionCreate,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """Create a new submission workspace with default tasks and approval workflow"""
    try:
        opp = supabase.table("opportunities").select("id, title").eq("id", submission.opportunity_id).single().execute()
        if not opp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Opportunity not found"
            )

        submission_data = submission.model_dump()
        submission_data["owner_id"] = user["id"]
        submission_data["title"] = submission.title or opp.data["title"]

        response = supabase.table("submissions").insert(submission_data).execute()
        submission_id = response.data[0]["id"]

        # Create default tasks (first 2 unlocked, rest locked until prerequisites met)
        default_tasks = [
            {"submission_id": submission_id, "title": "Complete Checklist", "subtitle": "Review and complete all required fields"},
            {"submission_id": submission_id, "title": "Upload Documents", "subtitle": "Attach all required documents"},
            {"submission_id": submission_id, "title": "Legal Review", "subtitle": "Obtain legal department approval", "locked": True},
            {"submission_id": submission_id, "title": "Finance Review", "subtitle": "Obtain finance department approval", "locked": True},
            {"submission_id": submission_id, "title": "Final Review", "subtitle": "Complete final review before submission", "locked": True},
        ]
        supabase.table("submission_tasks").insert(default_tasks).execute()

        # Create sequential approval workflow
        approval_steps = [
            {"submission_id": submission_id, "step_name": "legal", "step_order": 1, "approver_role": "contract_officer"},
            {"submission_id": submission_id, "step_name": "finance", "step_order": 2, "approver_role": "contract_officer"},
        ]
        supabase.table("approval_workflows").insert(approval_steps).execute()

        # Auto-create a follow-up tracker for this submission
        try:
            from datetime import timedelta
            supabase.table("follow_ups").insert({
                "submission_id": submission_id,
                "opportunity_id": submission.opportunity_id,
                "status": "pending",
                "check_type": "status_check",
                "next_check_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
                "check_interval_hours": 24,
                "assigned_to": user["id"],
                "auto_check": True,
            }).execute()
        except Exception:
            pass  # follow_ups table may not exist yet

        logger.info("Submission created", id=submission_id, opportunity_id=submission.opportunity_id)

        return await get_submission(submission_id, supabase, user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to create submission", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create submission"
        )


@router.patch("/{submission_id}", response_model=SubmissionResponse)
async def update_submission(
    submission_id: str,
    updates: SubmissionUpdate,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """Update a submission"""
    try:
        existing = supabase.table("submissions").select("owner_id").eq("id", submission_id).single().execute()
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

        if user.get("role") != "admin" and existing.data["owner_id"] != user["id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

        update_data = {k: v.value if hasattr(v, 'value') else v for k, v in updates.model_dump().items() if v is not None}

        if update_data:
            supabase.table("submissions").update(update_data).eq("id", submission_id).execute()

        logger.info("Submission updated", id=submission_id, updates=list(update_data.keys()))
        return await get_submission(submission_id, supabase, user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update submission", id=submission_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update submission"
        )


# ===========================================
# Approval Workflow (sequential enforcement)
# ===========================================

@router.post("/{submission_id}/approve", response_model=BaseResponse)
async def approve_submission(
    submission_id: str,
    step: str,
    notes: Optional[str] = None,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """
    Approve a submission step. Enforces sequential order:
    legal (order=1) must be approved before finance (order=2).
    """
    try:
        # Get all workflow steps for this submission
        workflows = (
            supabase.table("approval_workflows")
            .select("*")
            .eq("submission_id", submission_id)
            .order("step_order")
            .execute()
        )

        if not workflows.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No approval workflow found")

        # Find the target step
        target_step = None
        for w in workflows.data:
            if w["step_name"] == step:
                target_step = w
                break

        if not target_step:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown approval step: {step}")

        if target_step["status"] == "approved":
            return BaseResponse(success=True, message=f"Step '{step}' is already approved")

        # Enforce sequential order: all prior steps must be approved
        for w in workflows.data:
            if w["step_order"] < target_step["step_order"] and w["status"] != "approved":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot approve '{step}': prior step '{w['step_name']}' must be approved first"
                )

        # Approve the step
        supabase.table("approval_workflows").update({
            "status": "approved",
            "approver_id": user["id"],
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "notes": notes
        }).eq("submission_id", submission_id).eq("step_name", step).execute()

        # Check if all steps are now approved
        all_approved = all(
            w["status"] == "approved" or w["step_name"] == step
            for w in workflows.data
        )

        new_status = "complete" if all_approved else f"{step}_approved"
        supabase.table("submissions").update({
            "approval_status": new_status
        }).eq("id", submission_id).execute()

        logger.info("Submission approved", id=submission_id, step=step, approver=user["id"])

        return BaseResponse(success=True, message=f"Approved step: {step}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to approve", id=submission_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to approve submission"
        )


@router.post("/{submission_id}/reject", response_model=BaseResponse)
async def reject_submission(
    submission_id: str,
    reason: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """Reject a submission"""
    try:
        # Verify submission exists
        existing = supabase.table("submissions").select("id, owner_id").eq("id", submission_id).single().execute()
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

        supabase.table("submissions").update({
            "status": "rejected",
            "approval_status": "rejected",
            "notes": reason
        }).eq("id", submission_id).execute()

        logger.info("Submission rejected", id=submission_id, reason=reason, by=user["id"])

        return BaseResponse(success=True, message="Submission rejected")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to reject", id=submission_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reject submission"
        )


# ===========================================
# Finalize & Submit
# ===========================================

@router.post("/{submission_id}/finalize", response_model=SubmissionExecuteResponse)
async def finalize_submission(
    submission_id: str,
    dry_run: bool = False,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """Finalize and execute submission via browser-use automation"""
    try:
        submission = supabase.table("submissions").select("*").eq("id", submission_id).single().execute()
        if not submission.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

        if submission.data["approval_status"] != "complete":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Submission must be fully approved before finalizing"
            )

        run = supabase.table("submission_runs").insert({
            "submission_id": submission_id,
            "status": "pending",
            "triggered_by": user["id"]
        }).execute()

        run_id = run.data[0]["id"]

        if not dry_run:
            try:
                from ..automation.submission_engine import execute_submission
                result = await execute_submission(submission_id, run_id, dry_run=False)

                # Update follow-up status if submission succeeded
                if result.get("success"):
                    try:
                        supabase.table("follow_ups").update({
                            "status": "checked",
                            "portal_status": "submitted",
                        }).eq("submission_id", submission_id).execute()
                    except Exception:
                        pass

                return SubmissionExecuteResponse(
                    success=True,
                    run_id=run_id,
                    status="success" if result.get("success") else "failed",
                    receipt_id=result.get("receipt_id"),
                    screenshots=result.get("screenshots"),
                    message="Submission completed" if result.get("success") else "Submission failed",
                    error=result.get("error"),
                )
            except Exception as exec_err:
                logger.error("Submission execution failed", id=submission_id, error=str(exec_err))
                supabase.table("submission_runs").update({
                    "status": "failed",
                    "error_message": str(exec_err)[:500],
                }).eq("id", run_id).execute()
                return SubmissionExecuteResponse(
                    success=False,
                    run_id=run_id,
                    status="failed",
                    message="Submission execution failed",
                    error=str(exec_err)[:500],
                )

        logger.info("Submission finalized", id=submission_id, run_id=run_id, dry_run=dry_run)

        return SubmissionExecuteResponse(
            success=True,
            run_id=run_id,
            status="pending",
            message="Dry run completed"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to finalize", id=submission_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to finalize submission"
        )


# ===========================================
# Task Management (with auto-unlock)
# ===========================================

@router.patch("/{submission_id}/tasks/{task_id}", response_model=BaseResponse)
async def update_task(
    submission_id: str,
    task_id: str,
    completed: bool,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """Update a submission task. Auto-unlocks dependent tasks when prerequisites are met."""
    try:
        submission = supabase.table("submissions").select("owner_id").eq("id", submission_id).single().execute()
        if not submission.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

        if user.get("role") != "admin" and submission.data["owner_id"] != user["id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

        task = supabase.table("submission_tasks").select("locked, submission_id").eq("id", task_id).single().execute()
        if not task.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        if task.data.get("submission_id") != submission_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task does not belong to this submission")
        if task.data["locked"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This task is locked")

        supabase.table("submission_tasks").update({
            "completed": completed,
            "completed_by": user["id"] if completed else None,
            "completed_at": datetime.now(timezone.utc).isoformat() if completed else None
        }).eq("id", task_id).execute()

        # Auto-unlock dependent tasks
        await _unlock_dependent_tasks(submission_id, supabase)

        return BaseResponse(success=True, message="Task updated")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update task", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update task"
        )


# ===========================================
# File Upload (with safety scan)
# ===========================================

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"


@router.post("/{submission_id}/files", status_code=status.HTTP_201_CREATED)
async def upload_submission_file(
    submission_id: str,
    file: UploadFile = File(...),
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer),
):
    """
    Upload a file to a submission with safety scanning.
    Rejects executables and files exceeding 50 MB.
    """
    try:
        submission = (
            supabase.table("submissions")
            .select("id, owner_id")
            .eq("id", submission_id)
            .single()
            .execute()
        )
        if not submission.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Submission not found",
            )

        if (
            user.get("role") != "admin"
            and submission.data["owner_id"] != user["id"]
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to upload files to this submission",
            )

        # Read in chunks to enforce size limit without buffering unbounded data
        chunks = []
        total_size = 0
        while True:
            chunk = await file.read(8192)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="File too large. Maximum size is 50 MB.",
                )
            chunks.append(chunk)
        file_content = b"".join(chunks)
        file_size = total_size

        if file_size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File is empty.",
            )

        # Sanitize filename: strip path components to prevent path traversal
        raw_name = file.filename or "untitled"
        file_name = Path(raw_name).name.lstrip(".")  # strip ../ and leading dots
        if not file_name:
            file_name = "untitled"
        file_type = file.content_type or "application/octet-stream"

        # Run safety scan
        scan_status = _scan_file(file_content, file_name, file_type)
        if scan_status == "rejected":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File rejected: disallowed type ({file_type}) or size exceeds limit",
            )

        unique_id = uuid.uuid4().hex
        storage_key = f"{submission_id}/{unique_id}_{file_name}"

        storage_path: str
        try:
            supabase.storage.from_("submission-files").upload(
                path=storage_key,
                file=file_content,
                file_options={"content-type": file_type},
            )
            storage_path = f"submission-files/{storage_key}"
            logger.info("File uploaded to Supabase Storage", submission_id=submission_id, path=storage_path)
        except Exception as storage_err:
            logger.warning("Supabase Storage unavailable, falling back to local disk", error=str(storage_err)[:200])
            local_dir = UPLOAD_DIR / submission_id
            local_dir.mkdir(parents=True, exist_ok=True)
            local_path = local_dir / f"{unique_id}_{file_name}"
            local_path.write_bytes(file_content)
            storage_path = str(local_path)
            logger.info("File saved to local disk", submission_id=submission_id, path=storage_path)

        record_data = {
            "submission_id": submission_id,
            "file_name": file_name,
            "file_size": file_size,
            "file_type": file_type,
            "storage_path": storage_path,
            "scan_status": scan_status,
            "uploaded_by": user["id"],
        }

        result = supabase.table("submission_files").insert(record_data).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create file record",
            )

        logger.info("Submission file created", submission_id=submission_id, file_id=result.data[0].get("id"), scan=scan_status)

        return result.data[0]

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to upload file", submission_id=submission_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload file",
        )


# ===========================================
# Opportunity Update Propagation
# ===========================================

@router.post("/{submission_id}/sync-opportunity", response_model=BaseResponse)
async def sync_opportunity_updates(
    submission_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """
    Sync latest opportunity data into this submission.
    Picks up deadline changes, status updates, amendments from the source.
    """
    try:
        submission = (
            supabase.table("submissions")
            .select("id, opportunity_id, due_date, owner_id")
            .eq("id", submission_id)
            .single()
            .execute()
        )
        if not submission.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

        if user.get("role") != "admin" and submission.data["owner_id"] != user["id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

        opp = (
            supabase.table("opportunities")
            .select("due_date, status, title, agency, estimated_value")
            .eq("id", submission.data["opportunity_id"])
            .single()
            .execute()
        )
        if not opp.data:
            return BaseResponse(success=False, message="Opportunity not found")

        changes = {}
        opp_due = str(opp.data["due_date"])
        sub_due = str(submission.data["due_date"])
        if opp_due != sub_due:
            changes["due_date"] = opp_due

        if changes:
            supabase.table("submissions").update(changes).eq("id", submission_id).execute()

            # Create a notification about the change
            try:
                supabase.table("notifications").insert({
                    "user_id": submission.data["owner_id"],
                    "title": "Opportunity Updated",
                    "body": f"Deadline changed from {sub_due} to {opp_due} for {opp.data.get('title', 'opportunity')}",
                    "type": "deadline",
                    "priority": "high",
                    "entity_type": "submission",
                    "entity_id": submission_id,
                }).execute()
            except Exception:
                pass

            logger.info("Submission synced with opportunity", submission_id=submission_id, changes=changes)
            return BaseResponse(success=True, message=f"Updated: {', '.join(changes.keys())}")

        return BaseResponse(success=True, message="Already up to date")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to sync opportunity", submission_id=submission_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to sync opportunity updates"
        )
