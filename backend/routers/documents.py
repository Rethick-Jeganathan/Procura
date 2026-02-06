"""
Document Library Router
Reusable document storage for cross-submission use.
Supports versioning, tagging, and AI-extracted metadata.
"""
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from supabase import Client
import structlog

from ..dependencies import get_current_user, require_officer, get_request_supabase

logger = structlog.get_logger()

router = APIRouter()

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "library"

VALID_CATEGORIES = [
    "capability_statement", "past_performance", "pricing_template",
    "technical_proposal", "management_plan", "resume", "certification",
    "sf330", "sf1449", "cover_letter", "teaming_agreement", "other",
]


@router.get("")
async def list_documents(
    category: Optional[str] = None,
    search: Optional[str] = None,
    tags: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """List documents in the library with filters"""
    offset = (page - 1) * limit

    try:
        query = supabase.table("document_library").select("*", count="exact")
        query = query.eq("is_latest", True)

        if category:
            query = query.eq("category", category)
        if search:
            safe_search = search.replace(",", "").replace("(", "").replace(")", "").replace(".", "")
            query = query.ilike("name", f"%{safe_search}%")
        if tags:
            tag_list = [t.strip() for t in tags.split(",")]
            query = query.overlaps("tags", tag_list)

        query = query.order("updated_at", desc=True).range(offset, offset + limit - 1)
        response = query.execute()

        return {
            "success": True,
            "data": response.data,
            "total": response.count or len(response.data),
        }

    except Exception as e:
        logger.error("Failed to list documents", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to list documents")


@router.get("/{document_id}")
async def get_document(
    document_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(get_current_user)
):
    """Get a single document with version history"""
    try:
        doc = supabase.table("document_library").select("*").eq("id", document_id).single().execute()
        if not doc.data:
            raise HTTPException(status_code=404, detail="Document not found")

        # Get version history
        versions = (
            supabase.table("document_library")
            .select("id, version, file_name, file_size, created_at, uploaded_by")
            .eq("parent_id", doc.data.get("parent_id") or document_id)
            .order("version", desc=True)
            .execute()
        )

        # Get linked submissions
        links = (
            supabase.table("submission_document_links")
            .select("submission_id, notes, linked_at, submission:submissions(id, title, status)")
            .eq("document_id", document_id)
            .execute()
        )

        return {
            "success": True,
            "data": doc.data,
            "versions": versions.data,
            "linked_submissions": links.data,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get document", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to get document")


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(""),
    category: str = Form("other"),
    tags: str = Form(""),
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """Upload a new document to the library"""
    try:
        if category not in VALID_CATEGORIES:
            raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {VALID_CATEGORIES}")

        # Read in chunks to enforce size limit without buffering unbounded data
        max_size = 50 * 1024 * 1024
        chunks = []
        total_size = 0
        while True:
            chunk = await file.read(8192)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > max_size:
                raise HTTPException(status_code=400, detail="File too large. Maximum size is 50 MB.")
            chunks.append(chunk)
        file_content = b"".join(chunks)
        file_size = total_size

        if file_size == 0:
            raise HTTPException(status_code=400, detail="File is empty.")

        # Sanitize filename: strip path components to prevent path traversal
        raw_name = file.filename or "untitled"
        file_name = Path(raw_name).name.lstrip(".")
        if not file_name:
            file_name = "untitled"
        file_type = file.content_type or "application/octet-stream"

        unique_id = uuid.uuid4().hex
        storage_key = f"library/{unique_id}_{file_name}"

        # Try Supabase Storage, fallback to local
        try:
            supabase.storage.from_("document-library").upload(
                path=storage_key,
                file=file_content,
                file_options={"content-type": file_type},
            )
            storage_path = f"document-library/{storage_key}"
        except Exception:
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            local_path = UPLOAD_DIR / f"{unique_id}_{file_name}"
            local_path.write_bytes(file_content)
            storage_path = str(local_path)

        tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

        record = {
            "name": name,
            "description": description,
            "category": category,
            "tags": tag_list,
            "file_name": file_name,
            "file_size": file_size,
            "file_type": file_type,
            "storage_path": storage_path,
            "version": 1,
            "is_latest": True,
            "uploaded_by": user["id"],
        }

        result = supabase.table("document_library").insert(record).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create document record")

        logger.info("Document uploaded to library", doc_id=result.data[0]["id"], name=name)

        return result.data[0]

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to upload document", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to upload document")


@router.post("/{document_id}/new-version", status_code=status.HTTP_201_CREATED)
async def upload_new_version(
    document_id: str,
    file: UploadFile = File(...),
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """Upload a new version of an existing document"""
    try:
        existing = supabase.table("document_library").select("*").eq("id", document_id).single().execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Document not found")

        # Read in chunks to enforce size limit
        max_size = 50 * 1024 * 1024
        chunks = []
        total_size = 0
        while True:
            chunk = await file.read(8192)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > max_size:
                raise HTTPException(status_code=400, detail="File too large. Maximum size is 50 MB.")
            chunks.append(chunk)
        file_content = b"".join(chunks)

        if total_size == 0:
            raise HTTPException(status_code=400, detail="File is empty.")

        raw_name = file.filename or existing.data["file_name"]
        file_name = Path(raw_name).name.lstrip(".") or "untitled"
        file_type = file.content_type or existing.data["file_type"]

        unique_id = uuid.uuid4().hex
        storage_key = f"library/{unique_id}_{file_name}"

        try:
            supabase.storage.from_("document-library").upload(
                path=storage_key,
                file=file_content,
                file_options={"content-type": file_type},
            )
            storage_path = f"document-library/{storage_key}"
        except Exception:
            UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
            local_path = UPLOAD_DIR / f"{unique_id}_{file_name}"
            local_path.write_bytes(file_content)
            storage_path = str(local_path)

        # Mark old version as not latest
        supabase.table("document_library").update({"is_latest": False}).eq("id", document_id).execute()

        # Create new version
        new_version = existing.data["version"] + 1
        parent_id = existing.data.get("parent_id") or document_id

        record = {
            "name": existing.data["name"],
            "description": existing.data["description"],
            "category": existing.data["category"],
            "tags": existing.data["tags"],
            "file_name": file_name,
            "file_size": len(file_content),
            "file_type": file_type,
            "storage_path": storage_path,
            "version": new_version,
            "parent_id": parent_id,
            "is_latest": True,
            "uploaded_by": user["id"],
        }

        result = supabase.table("document_library").insert(record).execute()

        logger.info("New document version uploaded", doc_id=document_id, version=new_version)

        return result.data[0]

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to upload new version", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to upload new version")


@router.patch("/{document_id}")
async def update_document(
    document_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = None,
    tags: Optional[str] = None,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """Update document metadata"""
    try:
        updates = {}
        if name is not None:
            updates["name"] = name
        if description is not None:
            updates["description"] = description
        if category is not None:
            if category not in VALID_CATEGORIES:
                raise HTTPException(status_code=400, detail="Invalid category")
            updates["category"] = category
        if tags is not None:
            updates["tags"] = [t.strip() for t in tags.split(",") if t.strip()]

        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")

        # Ownership check: admin or uploader only
        existing = supabase.table("document_library").select("uploaded_by").eq("id", document_id).single().execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Document not found")
        if user.get("role") != "admin" and existing.data.get("uploaded_by") != user["id"]:
            raise HTTPException(status_code=403, detail="Not authorized to modify this document")

        supabase.table("document_library").update(updates).eq("id", document_id).execute()

        return {"success": True, "message": "Document updated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update document", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to update document")


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """Delete a document from the library"""
    try:
        existing = supabase.table("document_library").select("uploaded_by").eq("id", document_id).single().execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Document not found")
        if user.get("role") != "admin" and existing.data.get("uploaded_by") != user["id"]:
            raise HTTPException(status_code=403, detail="Not authorized to delete this document")

        supabase.table("document_library").delete().eq("id", document_id).execute()
        return {"success": True, "message": "Document deleted"}
    except Exception as e:
        logger.error("Failed to delete document", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to delete document")


# ===========================================
# Link documents to submissions
# ===========================================

@router.post("/{document_id}/link/{submission_id}", status_code=status.HTTP_201_CREATED)
async def link_document_to_submission(
    document_id: str,
    submission_id: str,
    notes: Optional[str] = None,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """Link a library document to a submission for reuse"""
    try:
        # Verify both exist
        doc = supabase.table("document_library").select("id, name, usage_count").eq("id", document_id).single().execute()
        if not doc.data:
            raise HTTPException(status_code=404, detail="Document not found")

        sub = supabase.table("submissions").select("id").eq("id", submission_id).single().execute()
        if not sub.data:
            raise HTTPException(status_code=404, detail="Submission not found")

        # Create link
        result = supabase.table("submission_document_links").insert({
            "submission_id": submission_id,
            "document_id": document_id,
            "linked_by": user["id"],
            "notes": notes,
        }).execute()

        # Increment usage count
        supabase.table("document_library").update({
            "usage_count": (doc.data.get("usage_count") or 0) + 1,
            "last_used_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", document_id).execute()

        logger.info("Document linked to submission", doc_id=document_id, submission_id=submission_id)

        return result.data[0] if result.data else {"success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to link document", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to link document")


@router.delete("/{document_id}/link/{submission_id}")
async def unlink_document_from_submission(
    document_id: str,
    submission_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_officer)
):
    """Remove a document link from a submission"""
    try:
        supabase.table("submission_document_links").delete().eq(
            "document_id", document_id
        ).eq("submission_id", submission_id).execute()

        return {"success": True, "message": "Link removed"}
    except Exception as e:
        logger.error("Failed to unlink document", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to unlink document")
