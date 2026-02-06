"""
Submissions Router
CRUD operations for proposal submissions and workflow management
"""
import os
import uuid
from pathlib import Path
from typing import Optional
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
    """
    List submissions with optional filters
    """
    offset = (page - 1) * limit
    
    try:
        query = supabase.table("submissions").select(
            "*, opportunity:opportunities(id, title, external_ref, agency), owner:profiles(id, email, full_name)",
            count="exact"
        )
        
        # Non-admins can only see their own submissions
        if user.get("role") != "admin":
            query = query.eq("owner_id", user["id"])
        elif owner_id:
            query = query.eq("owner_id", owner_id)
        
        if status_filter:
            query = query.eq("status", status_filter.value)
        if approval_status:
            query = query.eq("approval_status", approval_status.value)
        if search:
            query = query.ilike("title", f"%{search}%")
        
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
    """
    Get a single submission with all related data
    """
    try:
        response = supabase.table("submissions").select(
            "*, opportunity:opportunities(*), owner:profiles(*), files:submission_files(*), tasks:submission_tasks(*)"
        ).eq("id", submission_id).single().execute()
        
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Submission not found"
            )
        
        # Check access
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
    """
    Create a new submission workspace
    """
    try:
        # Verify opportunity exists
        opp = supabase.table("opportunities").select("id, title").eq("id", submission.opportunity_id).single().execute()
        if not opp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Opportunity not found"
            )
        
        # Create submission
        submission_data = submission.model_dump()
        submission_data["owner_id"] = user["id"]
        submission_data["title"] = submission.title or opp.data["title"]
        
        response = supabase.table("submissions").insert(submission_data).execute()
        submission_id = response.data[0]["id"]
        
        # Create default tasks
        default_tasks = [
            {"submission_id": submission_id, "title": "Complete Checklist", "subtitle": "Review and complete all required fields"},
            {"submission_id": submission_id, "title": "Upload Documents", "subtitle": "Attach all required documents"},
            {"submission_id": submission_id, "title": "Legal Review", "subtitle": "Obtain legal department approval", "locked": True},
            {"submission_id": submission_id, "title": "Finance Review", "subtitle": "Obtain finance department approval", "locked": True},
            {"submission_id": submission_id, "title": "Final Review", "subtitle": "Complete final review before submission", "locked": True},
        ]
        supabase.table("submission_tasks").insert(default_tasks).execute()
        
        # Create approval workflow
        approval_steps = [
            {"submission_id": submission_id, "step_name": "legal", "step_order": 1, "approver_role": "contract_officer"},
            {"submission_id": submission_id, "step_name": "finance", "step_order": 2, "approver_role": "contract_officer"},
        ]
        supabase.table("approval_workflows").insert(approval_steps).execute()
        
        logger.info("Submission created", id=submission_id, opportunity_id=submission.opportunity_id)
        
        # Return full submission with related data
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
    """
    Update a submission
    """
    try:
        # Check ownership
        existing = supabase.table("submissions").select("owner_id").eq("id", submission_id).single().execute()
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
        
        if user.get("role") != "admin" and existing.data["owner_id"] != user["id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
        # Update
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


@router.post("/{submission_id}/approve", response_model=BaseResponse)
async def approve_submission(
    submission_id: str,
    step: str,
    notes: Optional[str] = None,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """
    Approve a submission step
    """
    try:
        # Update approval workflow
        supabase.table("approval_workflows").update({
            "status": "approved",
            "approver_id": user["id"],
            "approved_at": "now()",
            "notes": notes
        }).eq("submission_id", submission_id).eq("step_name", step).execute()
        
        # Check if all steps approved
        workflows = supabase.table("approval_workflows").select("status").eq("submission_id", submission_id).execute()
        all_approved = all(w["status"] == "approved" for w in workflows.data)
        
        # Update submission approval status
        new_status = "complete" if all_approved else f"{step}_approved"
        supabase.table("submissions").update({
            "approval_status": new_status
        }).eq("id", submission_id).execute()
        
        logger.info("Submission approved", id=submission_id, step=step, approver=user["id"])
        
        return BaseResponse(success=True, message=f"Approved step: {step}")
        
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
    """
    Reject a submission
    """
    try:
        supabase.table("submissions").update({
            "status": "rejected",
            "approval_status": "rejected",
            "notes": reason
        }).eq("id", submission_id).execute()
        
        logger.info("Submission rejected", id=submission_id, reason=reason)
        
        return BaseResponse(success=True, message="Submission rejected")
        
    except Exception as e:
        logger.error("Failed to reject", id=submission_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reject submission"
        )


@router.post("/{submission_id}/finalize", response_model=SubmissionExecuteResponse)
async def finalize_submission(
    submission_id: str,
    dry_run: bool = False,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """
    Finalize and execute submission via OpenManus
    """
    try:
        # Get submission
        submission = supabase.table("submissions").select("*").eq("id", submission_id).single().execute()
        if not submission.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
        
        # Verify approved
        if submission.data["approval_status"] != "complete":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Submission must be fully approved before finalizing"
            )
        
        # Create submission run
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
                # Update run as failed but don't crash the endpoint
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


@router.patch("/{submission_id}/tasks/{task_id}", response_model=BaseResponse)
async def update_task(
    submission_id: str,
    task_id: str,
    completed: bool,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """
    Update a submission task
    """
    try:
        # Verify ownership
        submission = supabase.table("submissions").select("owner_id").eq("id", submission_id).single().execute()
        if not submission.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
        
        if user.get("role") != "admin" and submission.data["owner_id"] != user["id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
        # Check if task is locked
        task = supabase.table("submission_tasks").select("locked").eq("id", task_id).single().execute()
        if task.data and task.data["locked"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This task is locked")
        
        # Update
        supabase.table("submission_tasks").update({
            "completed": completed,
            "completed_by": user["id"] if completed else None,
            "completed_at": "now()" if completed else None
        }).eq("id", task_id).execute()
        
        return BaseResponse(success=True, message="Task updated")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update task", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update task"
        )


UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"


@router.post("/{submission_id}/files", status_code=status.HTTP_201_CREATED)
async def upload_submission_file(
    submission_id: str,
    file: UploadFile = File(...),
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer),
):
    """
    Upload a file to a submission.

    Accepts multipart/form-data with a ``file`` field.  The file is stored in
    Supabase Storage (bucket ``submission-files``) when available, and falls
    back to a local ``uploads/`` directory otherwise.  A record is always
    created in the ``submission_files`` table.
    """
    try:
        # Verify the submission exists and the user has access
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

        # Read file content
        file_content = await file.read()
        file_size = len(file_content)
        file_name = file.filename or "untitled"
        file_type = file.content_type or "application/octet-stream"

        # Unique key so filenames never collide
        unique_id = uuid.uuid4().hex
        storage_key = f"{submission_id}/{unique_id}_{file_name}"

        # Try Supabase Storage first, fall back to local disk
        storage_path: str
        try:
            supabase.storage.from_("submission-files").upload(
                path=storage_key,
                file=file_content,
                file_options={"content-type": file_type},
            )
            storage_path = f"submission-files/{storage_key}"
            logger.info(
                "File uploaded to Supabase Storage",
                submission_id=submission_id,
                path=storage_path,
            )
        except Exception as storage_err:
            logger.warning(
                "Supabase Storage unavailable, falling back to local disk",
                error=str(storage_err)[:200],
            )
            # Ensure the local uploads directory exists
            local_dir = UPLOAD_DIR / submission_id
            local_dir.mkdir(parents=True, exist_ok=True)

            local_path = local_dir / f"{unique_id}_{file_name}"
            local_path.write_bytes(file_content)
            storage_path = str(local_path)
            logger.info(
                "File saved to local disk",
                submission_id=submission_id,
                path=storage_path,
            )

        # Create the record in submission_files
        record_data = {
            "submission_id": submission_id,
            "file_name": file_name,
            "file_size": file_size,
            "file_type": file_type,
            "storage_path": storage_path,
            "scan_status": "pending",
            "uploaded_by": user["id"],
        }

        result = (
            supabase.table("submission_files").insert(record_data).execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create file record",
            )

        logger.info(
            "Submission file record created",
            submission_id=submission_id,
            file_id=result.data[0].get("id"),
            file_name=file_name,
        )

        return result.data[0]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Failed to upload file",
            submission_id=submission_id,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload file",
        )
