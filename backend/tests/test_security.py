"""
Tests for security utilities: RateLimiter and Fernet vault encryption.
"""
import os
import time
from unittest.mock import patch
from datetime import datetime, timezone

import pytest

from backend.dependencies import RateLimiter


# ============================================================
# RateLimiter
# ============================================================

class TestRateLimiter:
    """Unit tests for the sliding-window in-memory RateLimiter."""

    @pytest.mark.asyncio
    async def test_allows_under_limit(self):
        limiter = RateLimiter(requests_per_minute=5)
        for _ in range(5):
            assert await limiter.check("user-1") is True

    @pytest.mark.asyncio
    async def test_blocks_after_limit_exceeded(self):
        limiter = RateLimiter(requests_per_minute=3)
        for _ in range(3):
            await limiter.check("user-1")

        # 4th request within the same minute should be blocked
        assert await limiter.check("user-1") is False

    @pytest.mark.asyncio
    async def test_different_identifiers_independent(self):
        limiter = RateLimiter(requests_per_minute=2)
        assert await limiter.check("user-a") is True
        assert await limiter.check("user-a") is True
        assert await limiter.check("user-a") is False  # blocked

        # A different identifier should still be allowed
        assert await limiter.check("user-b") is True

    @pytest.mark.asyncio
    async def test_window_slides_old_entries_expire(self):
        """Entries older than 60 seconds should be pruned."""
        limiter = RateLimiter(requests_per_minute=2)

        # Manually inject timestamps that are >60 seconds old
        old_ts = datetime.now(timezone.utc).timestamp() - 120.0
        limiter._requests["user-1"] = [old_ts, old_ts]

        # Even though there are 2 entries, they are expired so the check passes
        assert await limiter.check("user-1") is True

    @pytest.mark.asyncio
    async def test_allows_again_after_window_expires(self):
        """After the window slides past all entries, requests are allowed again."""
        limiter = RateLimiter(requests_per_minute=1)
        assert await limiter.check("user-1") is True
        assert await limiter.check("user-1") is False  # blocked

        # Simulate time passing by shifting all timestamps back
        limiter._requests["user-1"] = [
            t - 61.0 for t in limiter._requests["user-1"]
        ]

        assert await limiter.check("user-1") is True


# ============================================================
# Fernet Vault (encrypt / decrypt round-trip)
# ============================================================

class TestVaultEncryption:
    """Test encrypt_credentials / decrypt_credentials from backend.security.vault."""

    @pytest.fixture(autouse=True)
    def _set_vault_key(self):
        """Generate and set a valid Fernet key for the duration of each test.

        vault.py imports ``settings`` at module level, so we patch the
        VAULT_ENCRYPTION_KEY attribute directly on the settings object that
        vault.py already holds a reference to.
        """
        from cryptography.fernet import Fernet
        from backend.config import settings as cfg

        key = Fernet.generate_key().decode("utf-8")
        original = cfg.VAULT_ENCRYPTION_KEY

        cfg.VAULT_ENCRYPTION_KEY = key
        yield
        cfg.VAULT_ENCRYPTION_KEY = original

    def test_round_trip_simple(self):
        from backend.security.vault import encrypt_credentials, decrypt_credentials

        original = {"api_key": "sk-test-123", "secret": "s3cret!"}
        encrypted = encrypt_credentials(original)

        assert isinstance(encrypted, str)
        assert encrypted != str(original)

        decrypted = decrypt_credentials(encrypted)
        assert decrypted == original

    def test_round_trip_nested_data(self):
        from backend.security.vault import encrypt_credentials, decrypt_credentials

        original = {
            "oauth": {
                "client_id": "id-123",
                "client_secret": "secret-456",
                "scopes": ["read", "write"],
            }
        }
        encrypted = encrypt_credentials(original)
        decrypted = decrypt_credentials(encrypted)
        assert decrypted == original

    def test_round_trip_empty_dict(self):
        from backend.security.vault import encrypt_credentials, decrypt_credentials

        original = {}
        encrypted = encrypt_credentials(original)
        decrypted = decrypt_credentials(encrypted)
        assert decrypted == original

    def test_different_data_different_ciphertext(self):
        from backend.security.vault import encrypt_credentials

        enc1 = encrypt_credentials({"key": "value1"})
        enc2 = encrypt_credentials({"key": "value2"})
        assert enc1 != enc2

    def test_missing_vault_key_raises(self):
        """When VAULT_ENCRYPTION_KEY is empty, get_fernet should raise."""
        from backend.security.vault import get_fernet
        from backend.config import settings as cfg

        original = cfg.VAULT_ENCRYPTION_KEY
        cfg.VAULT_ENCRYPTION_KEY = ""
        try:
            with pytest.raises(ValueError, match="VAULT_ENCRYPTION_KEY not configured"):
                get_fernet()
        finally:
            cfg.VAULT_ENCRYPTION_KEY = original
