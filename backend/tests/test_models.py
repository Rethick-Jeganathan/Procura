"""
Tests for Pydantic model validation in backend.models.
"""
import os

# Ensure env is set before any backend imports
os.environ.setdefault("SUPABASE_URL", "http://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

import pytest
from datetime import date
from pydantic import ValidationError

from backend.models import (
    OpportunityCreate,
    OpportunityUpdate,
    OpportunityStatus,
    SubmissionCreate,
    SubmissionStatus,
    ApprovalStatus,
    ConnectorCreate,
    ConnectorStatus,
    RunStatus,
    UserRole,
)


# ============================================================
# Enum tests
# ============================================================

class TestEnums:
    """Verify enum members match expected database values."""

    def test_opportunity_status_values(self):
        expected = {"new", "reviewing", "qualified", "disqualified", "submitted"}
        actual = {s.value for s in OpportunityStatus}
        assert actual == expected

    def test_submission_status_values(self):
        expected = {"draft", "pending_approval", "approved", "submitted", "rejected"}
        actual = {s.value for s in SubmissionStatus}
        assert actual == expected

    def test_approval_status_values(self):
        expected = {"pending", "legal_approved", "finance_approved", "complete", "rejected"}
        actual = {s.value for s in ApprovalStatus}
        assert actual == expected

    def test_connector_status_values(self):
        expected = {"active", "warning", "revoked"}
        actual = {s.value for s in ConnectorStatus}
        assert actual == expected

    def test_run_status_values(self):
        expected = {"pending", "running", "success", "failed"}
        actual = {s.value for s in RunStatus}
        assert actual == expected

    def test_user_role_values(self):
        expected = {"admin", "contract_officer", "viewer"}
        actual = {r.value for r in UserRole}
        assert actual == expected


# ============================================================
# OpportunityCreate
# ============================================================

class TestOpportunityCreate:
    """Validation for OpportunityCreate schema."""

    def _valid_payload(self, **overrides) -> dict:
        base = {
            "title": "Test Opportunity",
            "agency": "Test Agency",
            "external_ref": "REF-001",
            "source": "sam_gov",
            "posted_date": "2025-01-15",
            "due_date": "2025-03-01",
        }
        base.update(overrides)
        return base

    def test_valid_minimal(self):
        opp = OpportunityCreate(**self._valid_payload())
        assert opp.title == "Test Opportunity"
        assert opp.external_ref == "REF-001"
        assert opp.source == "sam_gov"

    def test_valid_with_all_fields(self):
        opp = OpportunityCreate(
            **self._valid_payload(
                description="Full description",
                naics_code="541512",
                set_aside="small_business",
                estimated_value=1_000_000.0,
                raw_data={"extra": "data"},
            )
        )
        assert opp.description == "Full description"
        assert opp.estimated_value == 1_000_000.0

    def test_missing_required_title(self):
        payload = self._valid_payload()
        del payload["title"]
        with pytest.raises(ValidationError) as exc_info:
            OpportunityCreate(**payload)
        errors = exc_info.value.errors()
        field_names = [e["loc"][0] for e in errors]
        assert "title" in field_names

    def test_missing_required_agency(self):
        payload = self._valid_payload()
        del payload["agency"]
        with pytest.raises(ValidationError):
            OpportunityCreate(**payload)

    def test_missing_required_external_ref(self):
        payload = self._valid_payload()
        del payload["external_ref"]
        with pytest.raises(ValidationError):
            OpportunityCreate(**payload)

    def test_missing_required_source(self):
        payload = self._valid_payload()
        del payload["source"]
        with pytest.raises(ValidationError):
            OpportunityCreate(**payload)

    def test_missing_required_dates(self):
        payload = self._valid_payload()
        del payload["posted_date"]
        del payload["due_date"]
        with pytest.raises(ValidationError):
            OpportunityCreate(**payload)

    def test_date_parsing(self):
        opp = OpportunityCreate(**self._valid_payload())
        assert opp.posted_date == date(2025, 1, 15)
        assert opp.due_date == date(2025, 3, 1)


# ============================================================
# OpportunityUpdate
# ============================================================

class TestOpportunityUpdate:
    """Validation for OpportunityUpdate schema."""

    def test_all_fields_optional(self):
        # Empty update is valid
        update = OpportunityUpdate()
        assert update.status is None
        assert update.fit_score is None

    def test_valid_status(self):
        update = OpportunityUpdate(status=OpportunityStatus.QUALIFIED)
        assert update.status == OpportunityStatus.QUALIFIED

    def test_fit_score_bounds(self):
        update = OpportunityUpdate(fit_score=0)
        assert update.fit_score == 0

        update = OpportunityUpdate(fit_score=100)
        assert update.fit_score == 100

    def test_fit_score_too_high(self):
        with pytest.raises(ValidationError):
            OpportunityUpdate(fit_score=101)

    def test_fit_score_too_low(self):
        with pytest.raises(ValidationError):
            OpportunityUpdate(fit_score=-1)

    def test_effort_score_bounds(self):
        with pytest.raises(ValidationError):
            OpportunityUpdate(effort_score=101)

    def test_urgency_score_bounds(self):
        with pytest.raises(ValidationError):
            OpportunityUpdate(urgency_score=-5)


# ============================================================
# SubmissionCreate
# ============================================================

class TestSubmissionCreate:
    """Validation for SubmissionCreate schema."""

    def _valid_payload(self, **overrides) -> dict:
        base = {
            "opportunity_id": "opp-001",
            "portal": "sam.gov",
            "due_date": "2025-03-01",
        }
        base.update(overrides)
        return base

    def test_valid_minimal(self):
        sub = SubmissionCreate(**self._valid_payload())
        assert sub.opportunity_id == "opp-001"
        assert sub.portal == "sam.gov"

    def test_valid_with_optional_fields(self):
        sub = SubmissionCreate(
            **self._valid_payload(
                title="My Submission",
                notes="Some notes",
            )
        )
        assert sub.title == "My Submission"
        assert sub.notes == "Some notes"

    def test_missing_opportunity_id(self):
        payload = self._valid_payload()
        del payload["opportunity_id"]
        with pytest.raises(ValidationError):
            SubmissionCreate(**payload)

    def test_missing_portal(self):
        payload = self._valid_payload()
        del payload["portal"]
        with pytest.raises(ValidationError):
            SubmissionCreate(**payload)

    def test_missing_due_date(self):
        payload = self._valid_payload()
        del payload["due_date"]
        with pytest.raises(ValidationError):
            SubmissionCreate(**payload)


# ============================================================
# ConnectorCreate
# ============================================================

class TestConnectorCreate:
    """Validation for ConnectorCreate schema."""

    def _valid_payload(self, **overrides) -> dict:
        base = {
            "name": "sam_gov",
            "auth_type": "api_key",
            "credentials": {"api_key": "test-key-123"},
        }
        base.update(overrides)
        return base

    def test_valid_minimal(self):
        conn = ConnectorCreate(**self._valid_payload())
        assert conn.name == "sam_gov"
        assert conn.auth_type == "api_key"
        assert conn.rate_limit_per_min == 60  # default

    def test_valid_with_optional_fields(self):
        conn = ConnectorCreate(
            **self._valid_payload(
                label="SAM.gov Connector",
                portal_url="https://sam.gov",
                schedule_cron="*/15 * * * *",
                rate_limit_per_min=30,
            )
        )
        assert conn.label == "SAM.gov Connector"
        assert conn.rate_limit_per_min == 30

    def test_missing_name(self):
        payload = self._valid_payload()
        del payload["name"]
        with pytest.raises(ValidationError):
            ConnectorCreate(**payload)

    def test_missing_auth_type(self):
        payload = self._valid_payload()
        del payload["auth_type"]
        with pytest.raises(ValidationError):
            ConnectorCreate(**payload)

    def test_missing_credentials(self):
        payload = self._valid_payload()
        del payload["credentials"]
        with pytest.raises(ValidationError):
            ConnectorCreate(**payload)

    def test_credentials_must_be_dict(self):
        with pytest.raises(ValidationError):
            ConnectorCreate(**self._valid_payload(credentials="not-a-dict"))
