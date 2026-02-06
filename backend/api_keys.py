"""
Dynamic API Key Resolution
Checks database (system_settings) first, falls back to environment variables.
API keys stored in DB are encrypted via the Fernet vault.
"""
from typing import Optional
import structlog

from .config import settings

logger = structlog.get_logger()

# Keys that can be managed via the Settings UI
MANAGED_KEYS = {
    "GOVCON_API_KEY": {
        "label": "GovCon API",
        "category": "discovery",
        "description": "Aggregated federal contract opportunities",
        "test_url": None,
    },
    "SAM_GOV_API_KEY": {
        "label": "SAM.gov",
        "category": "discovery",
        "description": "Federal government procurement portal",
        "test_url": None,
    },
    "NEWS_API_KEY": {
        "label": "NewsAPI",
        "category": "discovery",
        "description": "Market intelligence news feed",
        "test_url": None,
    },
    "ANTHROPIC_API_KEY": {
        "label": "Anthropic (Claude)",
        "category": "ai",
        "description": "Primary LLM provider for AI qualification",
        "test_url": None,
    },
    "OPENAI_API_KEY": {
        "label": "OpenAI (GPT-4)",
        "category": "ai",
        "description": "Fallback LLM provider",
        "test_url": None,
    },
    "GOOGLE_API_KEY": {
        "label": "Google (Gemini)",
        "category": "ai",
        "description": "Alternative LLM provider",
        "test_url": None,
    },
    "OPENMANUS_API_KEY": {
        "label": "OpenManus",
        "category": "automation",
        "description": "Browser automation for form submission",
        "test_url": None,
    },
}

# In-memory cache of DB-stored keys (refreshed on write or explicit reload)
_db_key_cache: dict[str, str] = {}
_cache_loaded = False


def _load_db_keys() -> None:
    """Load all API keys from system_settings into memory cache."""
    global _db_key_cache, _cache_loaded
    try:
        from .database import get_supabase_client
        from .security.vault import decrypt_credentials

        client = get_supabase_client()
        rows = (
            client.table("system_settings")
            .select("key, value")
            .like("key", "api_key.%")
            .execute()
        )
        _db_key_cache.clear()
        for row in rows.data or []:
            key_name = row["key"].replace("api_key.", "")
            encrypted_value = row["value"]
            if encrypted_value and encrypted_value.strip():
                try:
                    decrypted = decrypt_credentials(encrypted_value)
                    _db_key_cache[key_name] = decrypted.get("value", "")
                except Exception:
                    logger.warning("Failed to decrypt stored API key", key=key_name)
        _cache_loaded = True
    except Exception as e:
        logger.warning("Could not load API keys from DB", error=str(e)[:200])
        _cache_loaded = True  # Don't retry on every call


def invalidate_cache() -> None:
    """Force reload of API keys from DB on next access."""
    global _cache_loaded
    _cache_loaded = False
    _db_key_cache.clear()


def _is_placeholder(value: Optional[str]) -> bool:
    if not value:
        return True
    v = value.strip()
    if not v:
        return True
    upper = v.upper()
    return upper == "PLACEHOLDER" or "PLACEHOLDER" in upper or v.startswith("your-")


def get_api_key(key_name: str) -> Optional[str]:
    """
    Resolve an API key.
    Priority: DB (encrypted in system_settings) > environment variable.
    Returns None if key is not configured or is a placeholder.
    """
    global _cache_loaded

    # 1. Check DB cache
    if not _cache_loaded:
        _load_db_keys()

    db_value = _db_key_cache.get(key_name)
    if db_value and not _is_placeholder(db_value):
        return db_value

    # 2. Fall back to environment variable
    env_value = getattr(settings, key_name, None)
    if env_value and not _is_placeholder(env_value):
        return env_value

    return None


def get_api_key_status(key_name: str) -> dict:
    """Return status info for an API key (for the Settings UI)."""
    if not _cache_loaded:
        _load_db_keys()

    db_value = _db_key_cache.get(key_name)
    env_value = getattr(settings, key_name, None)

    if db_value and not _is_placeholder(db_value):
        return {
            "configured": True,
            "source": "database",
            "preview": f"****{db_value[-4:]}" if len(db_value) >= 4 else "****",
        }
    elif env_value and not _is_placeholder(env_value):
        return {
            "configured": True,
            "source": "environment",
            "preview": f"****{env_value[-4:]}" if len(env_value) >= 4 else "****",
        }
    else:
        return {
            "configured": False,
            "source": None,
            "preview": None,
        }


def store_api_key(key_name: str, value: str, user_id: Optional[str] = None) -> bool:
    """Encrypt and store an API key in system_settings."""
    from .database import get_supabase_client
    from .security.vault import encrypt_credentials
    from datetime import datetime, timezone

    try:
        encrypted = encrypt_credentials({"value": value})
        client = get_supabase_client()
        client.table("system_settings").upsert({
            "key": f"api_key.{key_name}",
            "value": encrypted,
            "updated_by": user_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).execute()

        # Update cache
        _db_key_cache[key_name] = value
        return True
    except Exception as e:
        logger.error("Failed to store API key", key=key_name, error=str(e)[:200])
        return False


def delete_api_key(key_name: str) -> bool:
    """Remove a stored API key from system_settings."""
    from .database import get_supabase_client

    try:
        client = get_supabase_client()
        client.table("system_settings").delete().eq("key", f"api_key.{key_name}").execute()
        _db_key_cache.pop(key_name, None)
        return True
    except Exception as e:
        logger.error("Failed to delete API key", key=key_name, error=str(e)[:200])
        return False
