"""
Procura Backend Test Configuration
Shared fixtures for all backend tests.

IMPORTANT: Environment variables are set BEFORE any application imports
so that backend.config.Settings can instantiate without real credentials.
"""
import os

# --- Set required env vars BEFORE any app code is imported ---
os.environ.setdefault("SUPABASE_URL", "http://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
os.environ.setdefault("VAULT_ENCRYPTION_KEY", "")
os.environ.setdefault("AUDIT_SIGNING_KEY", "test-audit-signing-key")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DEBUG", "true")

from typing import Any, Optional
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from backend.dependencies import get_current_user, require_officer, require_admin, get_request_supabase
from backend.main import app


# ============================================================
# Mock Supabase client with builder-pattern support
# ============================================================

class MockResponse:
    """Mimics the postgrest response object."""

    def __init__(self, data: list | dict | None = None, count: int | None = None):
        if data is None:
            data = []
        self.data = data
        self.count = count if count is not None else (len(data) if isinstance(data, list) else 1)


class MockQueryBuilder:
    """
    Supports the chained query pattern used throughout the codebase:
        supabase.table("x").select("*").eq("id", "1").execute()

    Every chaining method returns ``self`` so arbitrarily long chains work.
    Call ``set_response`` to configure what ``execute()`` returns.
    """

    def __init__(self, default_data: list | None = None):
        self._default_data = default_data if default_data is not None else []
        self._response: Optional[MockResponse] = None

    # -- configuration helpers (used in tests) --

    def set_response(self, data: list | dict | None = None, count: int | None = None):
        """Pre-configure what the next ``execute()`` will return."""
        self._response = MockResponse(data=data, count=count)
        return self

    # -- chaining methods (all return self) --

    def select(self, *args, **kwargs):
        return self

    def insert(self, *args, **kwargs):
        return self

    def update(self, *args, **kwargs):
        return self

    def upsert(self, *args, **kwargs):
        return self

    def delete(self, *args, **kwargs):
        return self

    def eq(self, *args, **kwargs):
        return self

    def neq(self, *args, **kwargs):
        return self

    def gt(self, *args, **kwargs):
        return self

    def gte(self, *args, **kwargs):
        return self

    def lt(self, *args, **kwargs):
        return self

    def lte(self, *args, **kwargs):
        return self

    def like(self, *args, **kwargs):
        return self

    def ilike(self, *args, **kwargs):
        return self

    def or_(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def range(self, *args, **kwargs):
        return self

    def single(self, *args, **kwargs):
        return self

    # -- terminal method --

    def execute(self) -> MockResponse:
        if self._response is not None:
            resp = self._response
            # Reset so next call on same builder uses default
            self._response = None
            return resp
        return MockResponse(data=self._default_data)


class MockSupabaseClient:
    """
    Drop-in mock for the Supabase ``Client``.

    Usage in tests::

        mock_supabase.query_builder.set_response(data=[{"id": "1", "title": "Test"}])
        # Then call the endpoint that internally does supabase.table(...).select(...).execute()
    """

    def __init__(self):
        self.query_builder = MockQueryBuilder()
        self.auth = MagicMock()

    def table(self, name: str) -> MockQueryBuilder:
        return self.query_builder


# ============================================================
# Mock user
# ============================================================

MOCK_ADMIN_USER = {
    "id": "test-user-id",
    "email": "admin@test.com",
    "role": "admin",
    "full_name": "Test Admin",
}


# ============================================================
# Fixtures
# ============================================================

@pytest.fixture()
def mock_supabase():
    """Return a fresh MockSupabaseClient that can be configured per test."""
    return MockSupabaseClient()


@pytest.fixture()
def test_app(mock_supabase):
    """
    Provide a ``TestClient`` with auth and database dependencies overridden.

    The mock supabase client is injected so tests can call
    ``mock_supabase.query_builder.set_response(...)`` to control DB results.
    """
    # Override dependencies
    app.dependency_overrides[get_current_user] = lambda: MOCK_ADMIN_USER
    app.dependency_overrides[require_officer] = lambda: MOCK_ADMIN_USER
    app.dependency_overrides[require_admin] = lambda: MOCK_ADMIN_USER
    app.dependency_overrides[get_request_supabase] = lambda: mock_supabase

    with TestClient(app, raise_server_exceptions=False) as client:
        yield client

    # Cleanup
    app.dependency_overrides.clear()
