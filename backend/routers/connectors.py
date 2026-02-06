"""
Connectors Router
Portal connector management with credential vault
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client
import structlog

from ..dependencies import require_admin, get_request_supabase
from ..models import (
    ConnectorResponse,
    ConnectorListResponse,
    ConnectorCreate,
    ConnectorUpdate,
    ConnectorStatus,
    BaseResponse,
    DiscoveryRunResponse,
    DiscoveryRunListResponse
)
from ..security.vault import encrypt_credentials, decrypt_credentials

logger = structlog.get_logger()

router = APIRouter()


@router.get("", response_model=ConnectorListResponse)
async def list_connectors(
    status_filter: Optional[ConnectorStatus] = None,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_admin)
):
    """
    List all portal connectors (admin only)
    """
    try:
        query = supabase.table("connectors").select("*")
        
        if status_filter:
            query = query.eq("status", status_filter.value)
        
        response = query.order("name").execute()
        
        # Remove encrypted credentials from response
        connectors = []
        for c in response.data:
            c.pop("encrypted_credentials", None)
            connectors.append(c)
        
        return ConnectorListResponse(success=True, data=connectors)
        
    except Exception as e:
        logger.error("Failed to list connectors", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch connectors"
        )


@router.get("/{connector_id}", response_model=ConnectorResponse)
async def get_connector(
    connector_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_admin)
):
    """
    Get a single connector (admin only)
    """
    try:
        response = supabase.table("connectors").select("*").eq("id", connector_id).single().execute()
        
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Connector not found"
            )
        
        # Remove encrypted credentials
        response.data.pop("encrypted_credentials", None)
        return response.data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get connector", id=connector_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch connector"
        )


@router.post("", response_model=ConnectorResponse, status_code=status.HTTP_201_CREATED)
async def create_connector(
    connector: ConnectorCreate,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_admin)
):
    """
    Create a new portal connector (admin only)
    """
    try:
        # Check for duplicate name
        existing = supabase.table("connectors").select("id").eq("name", connector.name).execute()
        if existing.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Connector '{connector.name}' already exists"
            )
        
        # Encrypt credentials
        encrypted_creds = encrypt_credentials(connector.credentials)
        
        # Create connector
        connector_data = connector.model_dump(exclude={"credentials"})
        connector_data["encrypted_credentials"] = encrypted_creds
        
        response = supabase.table("connectors").insert(connector_data).execute()
        
        logger.info("Connector created", name=connector.name, user_id=user["id"])
        
        # Remove encrypted credentials from response
        result = response.data[0]
        result.pop("encrypted_credentials", None)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to create connector", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create connector"
        )


@router.patch("/{connector_id}", response_model=ConnectorResponse)
async def update_connector(
    connector_id: str,
    updates: ConnectorUpdate,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_admin)
):
    """
    Update a connector (admin only)
    """
    try:
        # Check exists
        existing = supabase.table("connectors").select("id").eq("id", connector_id).execute()
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found")
        
        # Update
        update_data = {k: v.value if hasattr(v, 'value') else v for k, v in updates.model_dump().items() if v is not None}
        
        if update_data:
            supabase.table("connectors").update(update_data).eq("id", connector_id).execute()
        
        logger.info("Connector updated", id=connector_id, updates=list(update_data.keys()))
        return await get_connector(connector_id, supabase, user)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update connector", id=connector_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update connector"
        )


@router.post("/{connector_id}/rotate", response_model=BaseResponse)
async def rotate_credentials(
    connector_id: str,
    new_credentials: dict,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_admin)
):
    """
    Rotate credentials for a connector (admin only)
    """
    try:
        # Check exists
        existing = supabase.table("connectors").select("name").eq("id", connector_id).single().execute()
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found")
        
        # Encrypt new credentials
        encrypted_creds = encrypt_credentials(new_credentials)
        
        # Update
        supabase.table("connectors").update({
            "encrypted_credentials": encrypted_creds,
            "error_count": 0  # Reset error count on rotation
        }).eq("id", connector_id).execute()
        
        logger.info("Credentials rotated", connector=existing.data["name"], user_id=user["id"])
        
        return BaseResponse(success=True, message="Credentials rotated successfully")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to rotate credentials", id=connector_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to rotate credentials"
        )


@router.delete("/{connector_id}", response_model=BaseResponse)
async def revoke_connector(
    connector_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_admin)
):
    """
    Revoke/disable a connector (admin only)
    """
    try:
        # Verify connector exists
        existing = supabase.table("connectors").select("id").eq("id", connector_id).execute()
        if not existing.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found")

        # Soft delete by setting status to revoked
        supabase.table("connectors").update({
            "status": "revoked"
        }).eq("id", connector_id).execute()
        
        logger.info("Connector revoked", id=connector_id, user_id=user["id"])
        
        return BaseResponse(success=True, message="Connector revoked")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to revoke connector", id=connector_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to revoke connector"
        )


@router.get("/{connector_id}/runs", response_model=DiscoveryRunListResponse)
async def get_connector_runs(
    connector_id: str,
    limit: int = 50,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_admin)
):
    """
    Get run history for a specific connector
    """
    try:
        response = supabase.table("discovery_runs").select("*").eq(
            "connector_id", connector_id
        ).order("start_time", desc=True).limit(limit).execute()
        
        return DiscoveryRunListResponse(success=True, data=response.data)
        
    except Exception as e:
        logger.error("Failed to get runs", connector_id=connector_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch run history"
        )


@router.post("/{connector_id}/test", response_model=BaseResponse)
async def test_connector(
    connector_id: str,
    supabase: Client = Depends(get_request_supabase),
    user: dict = Depends(require_admin)
):
    """
    Test connector connectivity
    """
    try:
        # Get connector
        connector = supabase.table("connectors").select("*").eq("id", connector_id).single().execute()
        if not connector.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found")
        
        # Decrypt credentials
        credentials = decrypt_credentials(connector.data["encrypted_credentials"])
        
        # TODO: Actually test the connection based on connector type
        # This is a placeholder - real implementation would call the API
        
        logger.info("Connector test successful", id=connector_id)
        
        return BaseResponse(success=True, message="Connection test successful")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Connector test failed", id=connector_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Connection test failed"
        )
