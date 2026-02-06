"""
Settings Router
API key management and system configuration
"""
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import structlog

from ..dependencies import require_role
from ..api_keys import (
    MANAGED_KEYS,
    get_api_key,
    get_api_key_status,
    store_api_key,
    delete_api_key,
    invalidate_cache,
)
from ..config import settings

logger = structlog.get_logger()

router = APIRouter(tags=["Settings"])


# ============================================
# Request / Response Models
# ============================================

class APIKeyUpdate(BaseModel):
    value: str


class APIKeyBulkUpdate(BaseModel):
    keys: Dict[str, str]  # {"ANTHROPIC_API_KEY": "sk-...", ...}


class GeneralSettingsUpdate(BaseModel):
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    llm_temperature: Optional[float] = None
    llm_max_tokens: Optional[int] = None
    openmanus_url: Optional[str] = None


# ============================================
# API Key Management
# ============================================

@router.get("/api-keys")
async def list_api_keys(
    user: dict = Depends(require_role(["admin"]))
):
    """List all managed API keys with their configuration status."""
    result = {}
    for key_name, meta in MANAGED_KEYS.items():
        status = get_api_key_status(key_name)
        result[key_name] = {
            **meta,
            **status,
        }
    return {"keys": result}


@router.put("/api-keys/{key_name}")
async def update_api_key(
    key_name: str,
    body: APIKeyUpdate,
    user: dict = Depends(require_role(["admin"]))
):
    """Store or update a single API key (encrypted in vault)."""
    if key_name not in MANAGED_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown API key: {key_name}")

    value = body.value.strip()
    if not value:
        raise HTTPException(status_code=400, detail="API key value cannot be empty")

    success = store_api_key(key_name, value, user_id=user.get("id"))
    if not success:
        raise HTTPException(status_code=500, detail="Failed to store API key")

    logger.info("API key updated", key=key_name, by=user.get("email"))
    return {
        "success": True,
        "key": key_name,
        "preview": f"****{value[-4:]}" if len(value) >= 4 else "****",
    }


@router.put("/api-keys")
async def bulk_update_api_keys(
    body: APIKeyBulkUpdate,
    user: dict = Depends(require_role(["admin"]))
):
    """Store or update multiple API keys at once."""
    results = {}
    for key_name, value in body.keys.items():
        if key_name not in MANAGED_KEYS:
            results[key_name] = {"success": False, "error": "Unknown key"}
            continue
        value = value.strip()
        if not value:
            results[key_name] = {"success": False, "error": "Empty value"}
            continue
        success = store_api_key(key_name, value, user_id=user.get("id"))
        results[key_name] = {"success": success}

    logger.info("API keys bulk updated", keys=list(body.keys.keys()), by=user.get("email"))
    return {"results": results}


@router.delete("/api-keys/{key_name}")
async def remove_api_key(
    key_name: str,
    user: dict = Depends(require_role(["admin"]))
):
    """Remove a stored API key (falls back to env var if available)."""
    if key_name not in MANAGED_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown API key: {key_name}")

    success = delete_api_key(key_name)
    logger.info("API key removed", key=key_name, by=user.get("email"))
    return {"success": success, "key": key_name}


@router.post("/api-keys/{key_name}/test")
async def test_api_key(
    key_name: str,
    user: dict = Depends(require_role(["admin"]))
):
    """Test connectivity for a specific API key."""
    if key_name not in MANAGED_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown API key: {key_name}")

    resolved = get_api_key(key_name)
    if not resolved:
        return {"success": False, "error": "API key not configured"}

    try:
        if key_name == "ANTHROPIC_API_KEY":
            import anthropic
            client = anthropic.Anthropic(api_key=resolved)
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=10,
                messages=[{"role": "user", "content": "Say OK"}],
            )
            return {"success": True, "provider": "anthropic", "message": "Connected"}

        elif key_name == "OPENAI_API_KEY":
            import openai
            client = openai.OpenAI(api_key=resolved)
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                max_tokens=10,
                messages=[{"role": "user", "content": "Say OK"}],
            )
            return {"success": True, "provider": "openai", "message": "Connected"}

        elif key_name == "GOOGLE_API_KEY":
            try:
                from google import genai
                client = genai.Client(api_key=resolved)
                response = client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents="Say OK",
                )
                return {"success": True, "provider": "google", "message": "Connected"}
            except ImportError:
                import google.generativeai as genai_legacy
                genai_legacy.configure(api_key=resolved)
                model = genai_legacy.GenerativeModel("gemini-pro")
                model.generate_content("Say OK")
                return {"success": True, "provider": "google", "message": "Connected"}

        elif key_name == "GOVCON_API_KEY":
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://api.govcon.com/v1/opportunities",
                    headers={"Authorization": f"Bearer {resolved}"},
                    params={"limit": 1},
                )
                return {
                    "success": resp.status_code in (200, 401, 403),
                    "status_code": resp.status_code,
                    "message": "Reachable" if resp.status_code == 200 else f"HTTP {resp.status_code}",
                }

        elif key_name == "SAM_GOV_API_KEY":
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://api.sam.gov/opportunities/v2/search",
                    params={"api_key": resolved, "limit": 1, "postedFrom": "01/01/2025", "postedTo": "01/02/2025"},
                )
                return {
                    "success": resp.status_code == 200,
                    "status_code": resp.status_code,
                    "message": "Connected" if resp.status_code == 200 else f"HTTP {resp.status_code}",
                }

        elif key_name == "NEWS_API_KEY":
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://newsapi.org/v2/everything",
                    params={"apiKey": resolved, "q": "test", "pageSize": 1},
                )
                return {
                    "success": resp.status_code == 200,
                    "status_code": resp.status_code,
                    "message": "Connected" if resp.status_code == 200 else f"HTTP {resp.status_code}",
                }

        elif key_name == "OPENMANUS_API_KEY":
            # OpenManus key is no longer needed (browser-use uses LLM keys directly)
            # but we test that browser automation prerequisites are available
            from ..automation.openmanus_client import OpenManusClient
            client = OpenManusClient(headless=True)
            healthy = await client.health_check()
            return {
                "success": healthy,
                "message": "Browser automation ready" if healthy else "Missing LLM key or Playwright browser",
            }

        return {"success": False, "error": "No test available for this key"}

    except Exception as e:
        return {"success": False, "error": str(e)[:300]}


# ============================================
# General Settings
# ============================================

@router.get("/general")
async def get_general_settings(
    user: dict = Depends(require_role(["admin"]))
):
    """Get general platform settings."""
    from ..database import get_supabase_client

    client = get_supabase_client()

    # Load relevant settings from DB
    db_settings = {}
    try:
        rows = client.table("system_settings").select("key, value").in_("key", [
            "llm_provider", "llm_model", "llm_temperature", "llm_max_tokens",
            "openmanus_url",
        ]).execute()
        db_settings = {r["key"]: r["value"] for r in (rows.data or [])}
    except Exception:
        pass

    return {
        "llm_provider": db_settings.get("llm_provider", settings.PROCURA_LLM_PROVIDER),
        "llm_model": db_settings.get("llm_model", settings.LLM_MODEL),
        "llm_temperature": float(db_settings.get("llm_temperature", settings.LLM_TEMPERATURE)),
        "llm_max_tokens": int(db_settings.get("llm_max_tokens", settings.LLM_MAX_TOKENS)),
        "openmanus_url": db_settings.get("openmanus_url", settings.OPENMANUS_API_URL),
        "environment": settings.ENVIRONMENT,
        "debug": settings.DEBUG,
    }


@router.put("/general")
async def update_general_settings(
    body: GeneralSettingsUpdate,
    user: dict = Depends(require_role(["admin"]))
):
    """Update general platform settings."""
    from ..database import get_supabase_client

    client = get_supabase_client()
    updated = {}

    fields = {
        "llm_provider": body.llm_provider,
        "llm_model": body.llm_model,
        "llm_temperature": str(body.llm_temperature) if body.llm_temperature is not None else None,
        "llm_max_tokens": str(body.llm_max_tokens) if body.llm_max_tokens is not None else None,
        "openmanus_url": body.openmanus_url,
    }

    for key, value in fields.items():
        if value is not None:
            try:
                client.table("system_settings").upsert({
                    "key": key,
                    "value": value,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "updated_by": user.get("id"),
                }).execute()
                updated[key] = value
            except Exception as e:
                logger.warning("Failed to update setting", key=key, error=str(e)[:200])

    logger.info("General settings updated", keys=list(updated.keys()), by=user.get("email"))
    return {"success": True, "updated": updated}


@router.post("/reload")
async def reload_settings(
    user: dict = Depends(require_role(["admin"]))
):
    """Force reload API keys from the database."""
    invalidate_cache()
    return {"success": True, "message": "Settings cache invalidated"}


# ============================================
# Automation Health
# ============================================

@router.get("/automation/status")
async def automation_status(
    user: dict = Depends(require_role(["admin"]))
):
    """Check browser automation (OpenManus/browser-use) readiness."""
    from ..automation.openmanus_client import OpenManusClient

    status = {
        "browser_use_installed": False,
        "playwright_installed": False,
        "chromium_available": False,
        "llm_configured": False,
        "ready": False,
    }

    try:
        import browser_use
        status["browser_use_installed"] = True
    except ImportError:
        pass

    try:
        import playwright
        status["playwright_installed"] = True
    except ImportError:
        pass

    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            await browser.close()
            status["chromium_available"] = True
    except Exception:
        pass

    try:
        from ..automation.openmanus_client import _build_llm
        _build_llm()
        status["llm_configured"] = True
    except Exception:
        pass

    status["ready"] = all([
        status["browser_use_installed"],
        status["playwright_installed"],
        status["chromium_available"],
        status["llm_configured"],
    ])

    return status
