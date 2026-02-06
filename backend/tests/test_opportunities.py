"""
Tests for the /api/opportunities router.
"""
from datetime import date, datetime


# Reusable sample opportunity data
SAMPLE_OPPORTUNITY = {
    "id": "opp-001",
    "external_ref": "SAM-2025-001",
    "source": "sam_gov",
    "title": "Cloud Infrastructure Modernization",
    "agency": "Department of Defense",
    "description": "Modernize cloud infrastructure across DoD facilities.",
    "naics_code": "541512",
    "set_aside": "small_business",
    "posted_date": "2025-01-15",
    "due_date": "2025-03-01",
    "estimated_value": 5_000_000.0,
    "status": "new",
    "fit_score": 85,
    "effort_score": 60,
    "urgency_score": 70,
    "ai_summary": None,
    "created_at": "2025-01-15T00:00:00Z",
    "updated_at": "2025-01-15T00:00:00Z",
}

SAMPLE_OPPORTUNITY_2 = {
    **SAMPLE_OPPORTUNITY,
    "id": "opp-002",
    "external_ref": "GOVCON-2025-042",
    "source": "govcon",
    "title": "Cybersecurity Assessment Services",
    "agency": "Department of Homeland Security",
}


class TestListOpportunities:
    """GET /api/opportunities"""

    def test_returns_list(self, test_app, mock_supabase):
        mock_supabase.query_builder.set_response(
            data=[SAMPLE_OPPORTUNITY, SAMPLE_OPPORTUNITY_2],
            count=2,
        )
        response = test_app.get("/api/opportunities")
        assert response.status_code == 200

        body = response.json()
        assert body["success"] is True
        assert isinstance(body["data"], list)
        assert len(body["data"]) == 2
        assert body["total"] == 2

    def test_returns_empty_list(self, test_app, mock_supabase):
        mock_supabase.query_builder.set_response(data=[], count=0)
        response = test_app.get("/api/opportunities")
        assert response.status_code == 200

        body = response.json()
        assert body["data"] == []
        assert body["total"] == 0

    def test_handles_status_filter(self, test_app, mock_supabase):
        mock_supabase.query_builder.set_response(data=[SAMPLE_OPPORTUNITY], count=1)
        response = test_app.get("/api/opportunities?status=new")
        assert response.status_code == 200
        assert len(response.json()["data"]) == 1

    def test_handles_source_filter(self, test_app, mock_supabase):
        mock_supabase.query_builder.set_response(data=[SAMPLE_OPPORTUNITY], count=1)
        response = test_app.get("/api/opportunities?source=sam_gov")
        assert response.status_code == 200

    def test_handles_pagination(self, test_app, mock_supabase):
        mock_supabase.query_builder.set_response(data=[], count=0)
        response = test_app.get("/api/opportunities?page=2&limit=10")
        assert response.status_code == 200

        body = response.json()
        assert body["page"] == 2
        assert body["limit"] == 10

    def test_rejects_invalid_min_fit_score(self, test_app):
        response = test_app.get("/api/opportunities?min_fit_score=200")
        assert response.status_code == 422


class TestGetOpportunity:
    """GET /api/opportunities/{id}"""

    def test_returns_single(self, test_app, mock_supabase):
        mock_supabase.query_builder.set_response(data=SAMPLE_OPPORTUNITY)
        response = test_app.get("/api/opportunities/opp-001")
        assert response.status_code == 200

        body = response.json()
        assert body["id"] == "opp-001"
        assert body["title"] == "Cloud Infrastructure Modernization"

    def test_returns_404_when_not_found(self, test_app, mock_supabase):
        mock_supabase.query_builder.set_response(data=None)
        response = test_app.get("/api/opportunities/nonexistent")
        assert response.status_code == 404


class TestCreateOpportunity:
    """POST /api/opportunities"""

    def test_creates_opportunity(self, test_app, mock_supabase):
        # First call: duplicate check (select) returns empty
        # Second call: insert returns the created record
        created = {
            **SAMPLE_OPPORTUNITY,
            "id": "opp-new",
            "created_at": "2025-01-20T00:00:00Z",
            "updated_at": "2025-01-20T00:00:00Z",
        }

        call_count = {"n": 0}
        from backend.tests.conftest import MockResponse

        def side_effect_execute():
            call_count["n"] += 1
            if call_count["n"] == 1:
                # Duplicate check -- no existing record
                return MockResponse(data=[], count=0)
            # Insert result
            return MockResponse(data=[created], count=1)

        mock_supabase.query_builder.execute = side_effect_execute

        payload = {
            "title": "Cloud Infrastructure Modernization",
            "agency": "Department of Defense",
            "external_ref": "SAM-2025-001",
            "source": "sam_gov",
            "posted_date": "2025-01-15",
            "due_date": "2025-03-01",
        }
        response = test_app.post("/api/opportunities", json=payload)
        assert response.status_code == 201

    def test_rejects_duplicate(self, test_app, mock_supabase):
        # Duplicate check returns an existing record
        mock_supabase.query_builder.set_response(data=[{"id": "opp-001"}])
        payload = {
            "title": "Duplicate Opp",
            "agency": "DoD",
            "external_ref": "SAM-2025-001",
            "source": "sam_gov",
            "posted_date": "2025-01-15",
            "due_date": "2025-03-01",
        }
        response = test_app.post("/api/opportunities", json=payload)
        assert response.status_code == 409


class TestUpdateOpportunity:
    """PATCH /api/opportunities/{id}"""

    def test_updates_opportunity(self, test_app, mock_supabase):
        updated = {**SAMPLE_OPPORTUNITY, "fit_score": 95}

        call_count = {"n": 0}

        def side_effect_execute():
            call_count["n"] += 1
            if call_count["n"] == 1:
                # Existence check
                return type("MockResponse", (), {"data": [{"id": "opp-001"}], "count": 1})()
            # Update result
            return type("MockResponse", (), {"data": [updated], "count": 1})()

        mock_supabase.query_builder.execute = side_effect_execute

        response = test_app.patch(
            "/api/opportunities/opp-001",
            json={"fit_score": 95},
        )
        assert response.status_code == 200

    def test_returns_404_for_missing(self, test_app, mock_supabase):
        mock_supabase.query_builder.set_response(data=[])
        response = test_app.patch(
            "/api/opportunities/nonexistent",
            json={"fit_score": 50},
        )
        assert response.status_code == 404


class TestDisqualifyOpportunity:
    """PATCH /api/opportunities/{id}/disqualify"""

    def test_disqualifies(self, test_app, mock_supabase):
        disqualified = {
            **SAMPLE_OPPORTUNITY,
            "status": "disqualified",
            "disqualified_reason": "Out of scope",
        }
        mock_supabase.query_builder.set_response(data=[disqualified])

        response = test_app.patch(
            "/api/opportunities/opp-001/disqualify?reason=Out%20of%20scope",
        )
        assert response.status_code == 200

        body = response.json()
        assert body["status"] == "disqualified"

    def test_disqualify_returns_404(self, test_app, mock_supabase):
        mock_supabase.query_builder.set_response(data=[])
        response = test_app.patch("/api/opportunities/nonexistent/disqualify")
        assert response.status_code == 404
