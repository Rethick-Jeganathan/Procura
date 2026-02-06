"""
Tests for the health / root endpoints defined in backend.main.
"""


class TestRootEndpoint:
    """GET / -- basic API info."""

    def test_root_returns_200(self, test_app):
        response = test_app.get("/")
        assert response.status_code == 200

    def test_root_contains_name_and_version(self, test_app):
        data = test_app.get("/").json()
        assert data["name"] == "Procura Ops API"
        assert data["version"] == "1.0.0"
        assert data["status"] == "healthy"

    def test_root_includes_environment(self, test_app):
        data = test_app.get("/").json()
        assert "environment" in data


class TestHealthEndpoint:
    """GET /health -- detailed health check."""

    def test_health_returns_200(self, test_app, mock_supabase):
        # The health endpoint does `from .database import get_supabase_client`
        # inside the function body, so we patch at the database module level.
        from unittest.mock import patch

        with patch("backend.database.get_supabase_client", return_value=mock_supabase):
            response = test_app.get("/health")

        assert response.status_code == 200

    def test_health_contains_checks(self, test_app, mock_supabase):
        from unittest.mock import patch

        with patch("backend.database.get_supabase_client", return_value=mock_supabase):
            data = test_app.get("/health").json()

        assert "status" in data
        assert "checks" in data
        assert "database" in data["checks"]
