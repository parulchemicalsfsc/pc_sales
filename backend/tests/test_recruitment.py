"""
Unit Tests for Recruitment Module Backend
==========================================
Tests candidate CRUD, validation, Google Drive URL checking, category resolution,
duplicate detection, permission enforcement, and PATCH field safety.
All database operations are mocked. No production database access is performed.
"""
import os
import time
from typing import Any, Dict, List, Optional
import unittest
from unittest.mock import MagicMock, patch

import jwt
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from rbac_utils import clear_token_cache, clear_user_permission_cache, verify_permission
from routers.recruitment import (
    ALLOWED_STATUSES,
    find_duplicate_candidates,
    resolve_category,
    router,
    validate_candidate_email,
    validate_candidate_phone,
    validate_candidate_status,
    validate_google_drive_url,
)
from supabase_db import get_db


class TestRecruitmentValidation(unittest.TestCase):
    """Test validation helper functions in isolation."""

    def test_phone_validation_valid(self):
        self.assertEqual(validate_candidate_phone("9876543210"), "9876543210")
        self.assertEqual(validate_candidate_phone("+91 98765 43210"), "9876543210")
        self.assertEqual(validate_candidate_phone("919876543210"), "9876543210")
        self.assertEqual(validate_candidate_phone("98765-43210"), "9876543210")

    def test_phone_validation_invalid(self):
        from fastapi import HTTPException
        for invalid in ["", None, "12345", "abcdefghij", "9876543210123", "+1234567890"]:
            with self.subTest(phone=invalid):
                with self.assertRaises(HTTPException) as ctx:
                    validate_candidate_phone(invalid)
                self.assertEqual(ctx.exception.status_code, 422)

    def test_email_validation(self):
        from fastapi import HTTPException
        self.assertIsNone(validate_candidate_email(None))
        self.assertIsNone(validate_candidate_email(""))
        self.assertEqual(validate_candidate_email("candidate@example.com"), "candidate@example.com")
        self.assertEqual(validate_candidate_email("USER.NAME@Domain.CO.IN"), "user.name@domain.co.in")

        with self.assertRaises(HTTPException) as ctx:
            validate_candidate_email("not-an-email")
        self.assertEqual(ctx.exception.status_code, 422)

    def test_google_drive_url_validation_valid(self):
        self.assertIsNone(validate_google_drive_url(None))
        self.assertIsNone(validate_google_drive_url(""))
        
        valid_urls = [
            "https://drive.google.com/file/d/1a2b3c4d5e/view?usp=sharing",
            "http://drive.google.com/open?id=12345678",
            "https://docs.google.com/document/d/1XyZ-987/edit",
            "https://sub.drive.google.com/file/d/abc",
        ]
        for url in valid_urls:
            with self.subTest(url=url):
                self.assertEqual(validate_google_drive_url(url), url)

    def test_google_drive_url_validation_invalid(self):
        from fastapi import HTTPException
        invalid_urls = [
            "ftp://drive.google.com/file",
            "https://dropbox.com/s/12345/resume.pdf",
            "https://malicious.com/drive.google.com/file",
            "https://drive.google.com.attacker.com/file",
            "just_a_string",
            "http://google.com/something_else",
        ]
        for url in invalid_urls:
            with self.subTest(url=url):
                with self.assertRaises(HTTPException) as ctx:
                    validate_google_drive_url(url)
                self.assertEqual(ctx.exception.status_code, 422)

    def test_status_validation(self):
        from fastapi import HTTPException
        self.assertEqual(validate_candidate_status(None), "Lead Generated")
        for s in ALLOWED_STATUSES:
            self.assertEqual(validate_candidate_status(s), s)

        with self.assertRaises(HTTPException) as ctx:
            validate_candidate_status("UnknownStatus")
        self.assertEqual(ctx.exception.status_code, 422)


class MockQueryBuilder:
    """Mock builder for chaining SupabaseTable queries."""
    def __init__(self, select_data=None, count=None, insert_return=None, update_return=None):
        self.select_data = select_data if select_data is not None else []
        self.count = count if count is not None else len(self.select_data)
        self.insert_return = insert_return
        self.update_return = update_return
        self.inserted_data = None
        self.updated_data = None
        self._is_insert = False
        self._is_update = False

    def select(self, *args, **kwargs):
        return self

    def eq(self, *args, **kwargs):
        return self

    def neq(self, *args, **kwargs):
        return self

    def not_null(self, *args, **kwargs):
        return self

    def lt(self, *args, **kwargs):
        return self

    def gt(self, *args, **kwargs):
        return self

    def lte(self, *args, **kwargs):
        return self

    def gte(self, *args, **kwargs):
        return self

    def is_(self, *args, **kwargs):
        return self

    def in_(self, *args, **kwargs):
        return self

    def or_(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def range(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def insert(self, data, *args, **kwargs):
        self._is_insert = True
        self.inserted_data = data
        return self

    def update(self, data, *args, **kwargs):
        self._is_update = True
        self.updated_data = data
        return self

    def execute(self):
        res = MagicMock()
        if self._is_insert:
            if self.insert_return is not None:
                res.data = self.insert_return if isinstance(self.insert_return, list) else [self.insert_return]
            elif isinstance(self.inserted_data, list):
                res.data = self.inserted_data
            else:
                res.data = [self.inserted_data]
            res.count = len(res.data)
        elif self._is_update:
            if self.update_return is not None:
                res.data = self.update_return if isinstance(self.update_return, list) else [self.update_return]
            else:
                res.data = self.select_data
            res.count = len(res.data)
        else:
            res.data = self.select_data
            res.count = self.count
        return res



class SmartTableMock:
    """Smart router for mock_db.table that defaults app_users to active user unless overridden."""
    def __init__(self, test_case):
        self.test_case = test_case
        self.return_value = MockQueryBuilder()
        self.side_effect = None

    def __call__(self, table_name, *args, **kwargs):
        if table_name == "app_users":
            if hasattr(self.test_case, "app_user_override") and self.test_case.app_user_override is not None:
                return MockQueryBuilder(select_data=self.test_case.app_user_override)
            return MockQueryBuilder(select_data=[{"email": "admin@parulchem.com", "role": "admin", "is_active": True}])
        if self.side_effect:
            return self.side_effect(table_name, *args, **kwargs)
        return self.return_value


class TestRecruitmentApiEndpoints(unittest.TestCase):
    """Test FastAPI recruitment endpoints with mocked Supabase client and RBAC dependencies."""

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(router, prefix="/api/recruitment")

        self.mock_db = MagicMock()
        self.mock_db.table = SmartTableMock(self)
        self.app_user_override = None
        self.app.dependency_overrides[get_db] = lambda: self.mock_db
        self.client = TestClient(self.app)

        self.test_jwt_secret = "test-jwt-secret-key-at-least-32-chars-long-recruitment-test-123456"
        os.environ["SUPABASE_JWT_SECRET"] = self.test_jwt_secret
        clear_token_cache()
        clear_user_permission_cache()

        now = int(time.time())
        admin_payload = {
            "sub": "user-uuid-admin-1",
            "email": "admin@parulchem.com",
            "aud": "authenticated",
            "exp": now + 3600,
            "iat": now,
        }
        self.admin_token = jwt.encode(admin_payload, self.test_jwt_secret, algorithm="HS256")
        self.admin_headers = {
            "Authorization": f"Bearer {self.admin_token}",
            "x-user-email": "admin@parulchem.com",
        }
        self.unauth_headers = {}

    def tearDown(self):
        self.app.dependency_overrides.clear()
        clear_token_cache()
        clear_user_permission_cache()

    def create_test_token(self, email: str, secret: Optional[str] = None, exp_offset: int = 3600) -> str:
        sec = secret or self.test_jwt_secret
        now = int(time.time())
        payload = {
            "sub": f"uuid-{email}",
            "email": email,
            "aud": "authenticated",
            "exp": now + exp_offset,
            "iat": now,
        }
        return jwt.encode(payload, sec, algorithm="HS256")

    @patch("rbac_utils.get_user_permissions")
    def test_unauthorized_missing_email_header(self, mock_perms):
        """Requests without Authorization Bearer token receive 401."""
        res = self.client.get("/api/recruitment/categories")
        self.assertEqual(res.status_code, 401)
        self.assertIn("Missing Bearer token", res.json()["detail"])

        res_post = self.client.post("/api/recruitment/leads", json={"candidate_name": "Test", "phone": "9876543210"})
        self.assertEqual(res_post.status_code, 401)

    @patch("rbac_utils.get_user_permissions")
    def test_forbidden_missing_permission(self, mock_perms):
        """User without view_recruitment or manage_recruitment receives 403."""
        mock_perms.return_value = {"create_sale"}  # missing recruitment permissions
        user_headers = {"Authorization": f"Bearer {self.create_test_token('user@parulchem.com')}"}

        res = self.client.get("/api/recruitment/categories", headers=user_headers)
        self.assertEqual(res.status_code, 403)
        self.assertIn("Missing permission", res.json()["detail"])

        res_post = self.client.post(
            "/api/recruitment/leads",
            json={"candidate_name": "Test", "phone": "9876543210"},
            headers=user_headers,
        )
        self.assertEqual(res_post.status_code, 403)

    @patch("rbac_utils.get_user_permissions")
    def test_get_categories_success(self, mock_perms):
        """Test listing active categories."""
        mock_perms.return_value = {"view_recruitment"}
        categories_data = [
            {"category_id": 1, "name": "Sales Executive", "is_active": True},
            {"category_id": 2, "name": "Telecaller", "is_active": True},
        ]
        self.mock_db.table.return_value = MockQueryBuilder(select_data=categories_data)

        res = self.client.get("/api/recruitment/categories", headers=self.admin_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["name"], "Sales Executive")

    @patch("rbac_utils.get_user_permissions")
    def test_get_leads_pagination_and_search(self, mock_perms):
        """Test listing candidates with pagination and search."""
        mock_perms.return_value = {"view_recruitment"}
        leads_data = [
            {
                "lead_id": 1,
                "lead_code": "REC-0001",
                "candidate_name": "Ramesh Patel",
                "phone": "9876543210",
                "status": "Lead Generated",
            }
        ]
        self.mock_db.table.return_value = MockQueryBuilder(select_data=leads_data, count=1)

        res = self.client.get(
            "/api/recruitment/leads?limit=10&offset=0&search=Ramesh",
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["limit"], 10)
        self.assertEqual(len(body["leads"]), 1)
        self.assertEqual(body["leads"][0]["lead_code"], "REC-0001")

    @patch("rbac_utils.get_user_permissions")
    def test_get_single_lead_not_found(self, mock_perms):
        """Test 404 response for nonexistent lead."""
        mock_perms.return_value = {"view_recruitment"}
        self.mock_db.table.return_value = MockQueryBuilder(select_data=[])

        res = self.client.get("/api/recruitment/leads/9999", headers=self.admin_headers)
        self.assertEqual(res.status_code, 404)
        self.assertIn("not found", res.json()["detail"])

    @patch("rbac_utils.get_user_permissions")
    def test_check_duplicate_endpoint(self, mock_perms):
        """Test /api/recruitment/leads/check-duplicate returns correct duplicate matches."""
        mock_perms.return_value = {"view_recruitment"}
        existing_lead = {
            "lead_id": 5,
            "lead_code": "REC-0005",
            "candidate_name": "Suresh Shah",
            "phone": "9876543210",
            "email": "suresh@example.com",
        }
        self.mock_db.table.return_value = MockQueryBuilder(select_data=[existing_lead])

        res = self.client.get(
            "/api/recruitment/leads/check-duplicate?phone=9876543210",
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["duplicate_found"])
        self.assertEqual(len(body["matches"]), 1)
        self.assertEqual(body["matches"][0]["lead_code"], "REC-0005")

    @patch("rbac_utils.get_user_permissions")
    def test_create_lead_success_and_code_omitted(self, mock_perms):
        """
        Verify that candidate creation succeeds, lead_code is omitted from the insert
        so the database trigger populates it, and created_by uses the verified identity.
        """
        mock_perms.return_value = {"manage_recruitment"}

        cat_builder = MockQueryBuilder(select_data=[{"category_id": 1, "name": "Sales Executive", "is_active": True}])
        leads_builder = MockQueryBuilder(
            select_data=[],  # duplicate queries find 0 records
            insert_return=[{
                "lead_id": 42,
                "lead_code": "REC-0042",  # Populated by PostgreSQL trigger
                "candidate_name": "Pooja Shah",
                "phone": "9876543210",
                "category_id": 1,
                "category_name": "Sales Executive",
                "status": "Lead Generated",
                "created_by": "admin@parulchem.com",
            }]
        )
        activity_builder = MockQueryBuilder(insert_return=[{"activity_id": 101}])

        def table_router(table_name):
            if table_name == "recruitment_categories":
                return cat_builder
            elif table_name == "recruitment_activities":
                return activity_builder
            elif table_name == "recruitment_leads":
                return leads_builder
            return MockQueryBuilder()

        self.mock_db.table.side_effect = table_router

        payload = {
            "candidate_name": "Pooja Shah",
            "phone": "+91 98765 43210",
            "email": "pooja@example.com",
            "category_id": 1,
            "resume_url": "https://drive.google.com/file/d/1abcdef12345/view",
            "total_experience_years": 3.5,
            "current_ctc": 450000,
            "expected_ctc": 600000,
        }

        res = self.client.post("/api/recruitment/leads", json=payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["lead_id"], 42)
        self.assertEqual(data["lead_code"], "REC-0042")
        self.assertEqual(data["category_name"], "Sales Executive")

        # Verify that lead_code was NOT passed in the DB insert payload
        inserted = leads_builder.inserted_data
        if isinstance(inserted, list):
            inserted = inserted[0]
        self.assertNotIn("lead_code", inserted)
        self.assertEqual(inserted["phone"], "9876543210")
        self.assertEqual(inserted["created_by"], "admin@parulchem.com")

    @patch("rbac_utils.get_user_permissions")
    def test_create_lead_duplicate_conflict_409(self, mock_perms):
        """Verify 409 Conflict when a duplicate phone exists and allow_duplicate is False."""
        mock_perms.return_value = {"manage_recruitment"}

        cat_builder = MockQueryBuilder(select_data=[{"category_id": 1, "name": "Sales Executive", "is_active": True}])
        existing_dup = [{
            "lead_id": 5,
            "lead_code": "REC-0005",
            "candidate_name": "Existing Candidate",
            "phone": "9876543210",
            "email": "existing@example.com",
        }]
        leads_builder = MockQueryBuilder(select_data=existing_dup)

        def table_router(table_name):
            if table_name == "recruitment_categories":
                return cat_builder
            elif table_name == "recruitment_leads":
                return leads_builder
            return MockQueryBuilder()

        self.mock_db.table.side_effect = table_router

        payload = {
            "candidate_name": "New Candidate",
            "phone": "9876543210",
            "allow_duplicate": False,
        }

        res = self.client.post("/api/recruitment/leads", json=payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 409)
        body = res.json()["detail"]
        self.assertEqual(body["code"], "DUPLICATE_CANDIDATE")
        self.assertEqual(body["existing_candidate"]["lead_id"], 5)

    @patch("rbac_utils.get_user_permissions")
    def test_create_lead_duplicate_allow_duplicate_success(self, mock_perms):
        """Verify candidate creation proceeds when allow_duplicate is True despite duplicate."""
        mock_perms.return_value = {"manage_recruitment"}

        cat_builder = MockQueryBuilder(select_data=[{"category_id": 1, "name": "Sales Executive", "is_active": True}])
        existing_dup = [{
            "lead_id": 5,
            "lead_code": "REC-0005",
            "candidate_name": "Existing Candidate",
            "phone": "9876543210",
        }]
        leads_builder = MockQueryBuilder(
            select_data=existing_dup,
            insert_return=[{
                "lead_id": 6,
                "lead_code": "REC-0006",
                "candidate_name": "Second Candidate Same Phone",
                "phone": "9876543210",
                "created_by": "admin@parulchem.com",
            }]
        )

        def table_router(table_name):
            if table_name == "recruitment_categories":
                return cat_builder
            elif table_name == "recruitment_leads":
                return leads_builder
            return MockQueryBuilder()

        self.mock_db.table.side_effect = table_router

        payload = {
            "candidate_name": "Second Candidate Same Phone",
            "phone": "9876543210",
            "allow_duplicate": True,  # User explicitly confirms creating duplicate
        }

        res = self.client.post("/api/recruitment/leads", json=payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["lead_id"], 6)

    @patch("rbac_utils.get_user_permissions")
    def test_create_lead_invalid_category_400(self, mock_perms):
        """Verify 400 Bad Request when category_id does not exist."""
        mock_perms.return_value = {"manage_recruitment"}
        self.mock_db.table.return_value = MockQueryBuilder(select_data=[])

        payload = {
            "candidate_name": "Anil Verma",
            "phone": "9876543210",
            "category_id": 9999,
        }
        res = self.client.post("/api/recruitment/leads", json=payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 400)
        self.assertIn("does not exist", res.json()["detail"])

    @patch("rbac_utils.get_user_permissions")
    def test_patch_lead_omitted_fields_and_forbidden_fields(self, mock_perms):
        """
        Verify that PATCH only updates provided fields, does NOT overwrite omitted fields,
        and refuses to let the client modify lead_id, lead_code, or created_by.
        """
        mock_perms.return_value = {"manage_recruitment"}

        existing_lead = {
            "lead_id": 10,
            "lead_code": "REC-0010",
            "candidate_name": "Deepak Joshi",
            "phone": "9876543210",
            "status": "Lead Generated",
            "created_by": "original_creator@parulchem.com",
            "city": "Ahmedabad",
        }

        leads_builder = MockQueryBuilder(
            select_data=[existing_lead],
            update_return=[{**existing_lead, "status": "Shortlisted"}]
        )
        activity_builder = MockQueryBuilder(insert_return=[{"activity_id": 202}])

        def dynamic_router(table_name):
            if table_name == "recruitment_leads":
                return leads_builder
            elif table_name == "recruitment_activities":
                return activity_builder
            return MockQueryBuilder()

        self.mock_db.table.side_effect = dynamic_router

        # Attempt to modify status and also maliciously alter lead_code and created_by
        patch_payload = {
            "status": "Shortlisted",
            "lead_code": "HACKED-CODE",
            "created_by": "hacker@evil.com",
            "lead_id": 9999,
        }

        res = self.client.patch("/api/recruitment/leads/10", json=patch_payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 200)

        # Inspect updated_data sent to DB
        updated = leads_builder.updated_data
        self.assertEqual(updated["status"], "Shortlisted")
        self.assertNotIn("lead_code", updated)
        self.assertNotIn("created_by", updated)
        self.assertNotIn("lead_id", updated)
        self.assertNotIn("city", updated)  # city was omitted in PATCH, so untouched!
        self.assertIn("updated_at", updated)

    @patch("rbac_utils.get_user_permissions")
    def test_create_lead_inactive_category_400(self, mock_perms):
        """Verify 400 Bad Request when category is inactive."""
        mock_perms.return_value = {"manage_recruitment"}
        self.mock_db.table.return_value = MockQueryBuilder(
            select_data=[{"category_id": 3, "name": "Field Officer", "is_active": False}]
        )

        payload = {
            "candidate_name": "Test Inactive",
            "phone": "9876543210",
            "category_id": 3,
        }
        res = self.client.post("/api/recruitment/leads", json=payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 400)
        self.assertIn("inactive", res.json()["detail"])

    @patch("rbac_utils.get_user_permissions")
    def test_patch_lead_invalid_resume_url_422(self, mock_perms):
        """Verify 422 when updating lead with non-Google Drive resume URL."""
        mock_perms.return_value = {"manage_recruitment"}
        existing_lead = {"lead_id": 1, "candidate_name": "Test", "phone": "9876543210"}
        self.mock_db.table.return_value = MockQueryBuilder(select_data=[existing_lead])

        res = self.client.patch(
            "/api/recruitment/leads/1",
            json={"resume_url": "https://dropbox.com/my-resume.pdf"},
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 422)
        self.assertIn("Google Drive", res.json()["detail"])

    @patch("rbac_utils.get_user_permissions")
    def test_patch_lead_not_found_404(self, mock_perms):
        """Verify 404 when updating nonexistent candidate."""
        mock_perms.return_value = {"manage_recruitment"}
        self.mock_db.table.return_value = MockQueryBuilder(select_data=[])

        res = self.client.patch(
            "/api/recruitment/leads/9999",
            json={"status": "Shortlisted"},
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 404)

    @patch("rbac_utils.get_user_permissions")
    def test_patch_lead_update_category_consistency(self, mock_perms):
        """Verify updating category_id in PATCH keeps category_name consistent."""
        mock_perms.return_value = {"manage_recruitment"}
        existing_lead = {
            "lead_id": 2,
            "candidate_name": "Kiran Shah",
            "phone": "9876543210",
            "category_id": 1,
            "category_name": "Sales Executive",
        }
        cat_builder = MockQueryBuilder(select_data=[{"category_id": 2, "name": "Telecaller", "is_active": True}])
        leads_builder = MockQueryBuilder(
            select_data=[existing_lead],
            update_return=[{**existing_lead, "category_id": 2, "category_name": "Telecaller"}]
        )

        def table_router(table_name):
            if table_name == "recruitment_categories":
                return cat_builder
            elif table_name == "recruitment_leads":
                return leads_builder
            return MockQueryBuilder()

        self.mock_db.table.side_effect = table_router

        res = self.client.patch(
            "/api/recruitment/leads/2",
            json={"category_id": 2},
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 200)
        updated = leads_builder.updated_data
        self.assertEqual(updated["category_id"], 2)
        self.assertEqual(updated["category_name"], "Telecaller")

    # ─── Phase 3.2: Status Transitions, Activities, Follow-ups & Security ─────

    @patch("rbac_utils.get_user_permissions")
    def test_status_change_success(self, mock_perms):
        """Verify dedicated status change endpoint updates lead and logs activity."""
        mock_perms.return_value = {"manage_recruitment"}
        existing_lead = {
            "lead_id": 10,
            "candidate_name": "Ramesh Patel",
            "status": "Lead Generated",
            "phone": "9876543210",
        }
        updated_lead = {**existing_lead, "status": "Shortlisted", "status_notes": "Passed technical test"}
        lead_builder = MockQueryBuilder(select_data=[existing_lead], update_return=[updated_lead])
        act_builder = MockQueryBuilder(insert_return=[{"activity_id": 101, "activity_type": "Status Change"}])

        def table_router(table_name):
            if table_name == "recruitment_leads":
                return lead_builder
            elif table_name == "recruitment_activities":
                return act_builder
            return MockQueryBuilder()

        self.mock_db.table.side_effect = table_router

        res = self.client.post(
            "/api/recruitment/leads/10/status",
            json={
                "status": "Shortlisted",
                "status_notes": "Passed technical test",
                "follow_up_date": "2026-11-01",
            },
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["success"])
        self.assertTrue(body["activity_logged"])
        self.assertEqual(body["lead"]["status"], "Shortlisted")

        # Verify activity was recorded with old/new status and trusted logged_by
        act_data = act_builder.inserted_data
        self.assertEqual(act_data["activity_type"], "Status Change")
        self.assertEqual(act_data["old_status"], "Lead Generated")
        self.assertEqual(act_data["new_status"], "Shortlisted")
        self.assertEqual(act_data["logged_by"], "admin@parulchem.com")
        self.assertEqual(act_data["follow_up_date"], "2026-11-01")

    @patch("rbac_utils.get_user_permissions")
    def test_status_change_invalid_status_422(self, mock_perms):
        """Verify 422 when attempting status change to an unpermitted status."""
        mock_perms.return_value = {"manage_recruitment"}
        existing_lead = {"lead_id": 10, "candidate_name": "Ramesh", "status": "Lead Generated"}
        self.mock_db.table.return_value = MockQueryBuilder(select_data=[existing_lead])

        res = self.client.post(
            "/api/recruitment/leads/10/status",
            json={"status": "HiredDirectly"},
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 422)
        self.assertIn("Invalid status", res.json()["detail"])

    @patch("rbac_utils.get_user_permissions")
    def test_status_change_missing_candidate_404(self, mock_perms):
        """Verify 404 when attempting status change on nonexistent candidate."""
        mock_perms.return_value = {"manage_recruitment"}
        self.mock_db.table.return_value = MockQueryBuilder(select_data=[])

        res = self.client.post(
            "/api/recruitment/leads/9999/status",
            json={"status": "Shortlisted"},
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 404)

    @patch("rbac_utils.get_user_permissions")
    def test_status_change_activity_failure_explicit_handling(self, mock_perms):
        """Verify explicit fallback when lead updates but activity logging fails across REST calls."""
        mock_perms.return_value = {"manage_recruitment"}
        existing_lead = {"lead_id": 10, "status": "Lead Generated"}
        updated_lead = {**existing_lead, "status": "Rejected"}
        lead_builder = MockQueryBuilder(select_data=[existing_lead], update_return=[updated_lead])

        # Faulty activity builder that raises an exception on execute()
        failing_act_builder = MockQueryBuilder()
        failing_act_builder.execute = MagicMock(side_effect=Exception("Database connection timeout"))

        def table_router(table_name):
            if table_name == "recruitment_leads":
                return lead_builder
            elif table_name == "recruitment_activities":
                return failing_act_builder
            return MockQueryBuilder()

        self.mock_db.table.side_effect = table_router

        res = self.client.post(
            "/api/recruitment/leads/10/status",
            json={"status": "Rejected"},
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["success"])
        self.assertFalse(body["activity_logged"])
        self.assertIn("Database connection timeout", body["activity_error"])

    @patch("rbac_utils.get_user_permissions")
    def test_status_change_db_failure_500(self, mock_perms):
        """Verify 500 when lead update itself fails in the database."""
        mock_perms.return_value = {"manage_recruitment"}
        existing_lead = {"lead_id": 10, "status": "Lead Generated"}
        failing_lead_builder = MockQueryBuilder(select_data=[existing_lead])
        failing_lead_builder.update = MagicMock(return_value=failing_lead_builder)
        failing_lead_builder.execute = MagicMock(side_effect=Exception("PostgreSQL deadlock error"))
        self.mock_db.table.return_value = failing_lead_builder

        res = self.client.post(
            "/api/recruitment/leads/10/status",
            json={"status": "Shortlisted"},
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 500)

    @patch("rbac_utils.get_user_permissions")
    def test_status_change_insufficient_permission_403(self, mock_perms):
        """Verify 403 when user with only view_recruitment attempts status change."""
        mock_perms.return_value = {"view_recruitment"}
        res = self.client.post(
            "/api/recruitment/leads/10/status",
            json={"status": "Shortlisted"},
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 403)

    @patch("rbac_utils.get_user_permissions")
    def test_record_activity_success(self, mock_perms):
        """Verify recording an activity (Call/Note) and synchronizing follow_up_date."""
        mock_perms.return_value = {"manage_recruitment"}
        existing_lead = {"lead_id": 5, "candidate_name": "Pooja Shah", "status": "Shortlisted"}
        lead_builder = MockQueryBuilder(select_data=[existing_lead], update_return=[existing_lead])
        act_return = {
            "activity_id": 50,
            "lead_id": 5,
            "activity_type": "Call",
            "summary": "Technical interview scheduled",
            "logged_by": "admin@parulchem.com",
            "follow_up_date": "2026-11-10",
        }
        act_builder = MockQueryBuilder(insert_return=[act_return])

        def table_router(table_name):
            if table_name == "recruitment_leads":
                return lead_builder
            elif table_name == "recruitment_activities":
                return act_builder
            return MockQueryBuilder()

        self.mock_db.table.side_effect = table_router

        payload = {
            "activity_type": "Call",
            "summary": "Technical interview scheduled",
            "details": "Candidate available on Monday at 3 PM",
            "outcome": "Interview confirmed",
            "next_action": "Send Google Meet invite",
            "follow_up_date": "2026-11-10",
        }
        res = self.client.post("/api/recruitment/leads/5/activities", json=payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 201)
        created = res.json()
        self.assertEqual(created["activity_type"], "Call")
        self.assertEqual(created["logged_by"], "admin@parulchem.com")

        # Verify lead follow_up_date synchronization
        self.assertEqual(lead_builder.updated_data["follow_up_date"], "2026-11-10")

    @patch("rbac_utils.get_user_permissions")
    def test_record_activity_invalid_type_422(self, mock_perms):
        """Verify 422 when providing an unknown activity type."""
        mock_perms.return_value = {"manage_recruitment"}
        existing_lead = {"lead_id": 5, "candidate_name": "Pooja"}
        self.mock_db.table.return_value = MockQueryBuilder(select_data=[existing_lead])

        payload = {"activity_type": "InvalidActivityType", "summary": "Valid summary"}
        res = self.client.post("/api/recruitment/leads/5/activities", json=payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 422)
        self.assertIn("Invalid activity type", res.json()["detail"])

    @patch("rbac_utils.get_user_permissions")
    def test_record_activity_missing_candidate_404(self, mock_perms):
        """Verify 404 when recording activity for missing candidate."""
        mock_perms.return_value = {"manage_recruitment"}
        self.mock_db.table.return_value = MockQueryBuilder(select_data=[])

        payload = {"activity_type": "Note", "summary": "Note content"}
        res = self.client.post("/api/recruitment/leads/9999/activities", json=payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 404)

    @patch("rbac_utils.get_user_permissions")
    def test_record_activity_empty_summary_422(self, mock_perms):
        """Verify 422 when activity summary is empty."""
        mock_perms.return_value = {"manage_recruitment"}
        existing_lead = {"lead_id": 5}
        self.mock_db.table.return_value = MockQueryBuilder(select_data=[existing_lead])

        payload = {"activity_type": "Note", "summary": "   "}
        res = self.client.post("/api/recruitment/leads/5/activities", json=payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 422)

    @patch("rbac_utils.get_user_permissions")
    def test_record_activity_insufficient_permission_403(self, mock_perms):
        """Verify 403 when user lacks manage_recruitment to record activity."""
        mock_perms.return_value = {"view_recruitment"}
        res = self.client.post(
            "/api/recruitment/leads/5/activities",
            json={"activity_type": "Note", "summary": "Attempted note"},
            headers=self.admin_headers,
        )
        self.assertEqual(res.status_code, 403)

    @patch("rbac_utils.get_user_permissions")
    def test_get_activities_chronological_ordering(self, mock_perms):
        """Verify retrieving candidate activities with asc/desc chronological ordering."""
        mock_perms.return_value = {"view_recruitment"}
        existing_lead = {"lead_id": 3, "candidate_name": "Amit Sharma", "lead_code": "REC-000003"}
        activities = [
            {"activity_id": 1, "lead_id": 3, "activity_type": "Creation", "logged_at": "2026-10-01T10:00:00Z"},
            {"activity_id": 2, "lead_id": 3, "activity_type": "Call", "logged_at": "2026-10-05T12:00:00Z"},
            {"activity_id": 3, "lead_id": 3, "activity_type": "Status Change", "logged_at": "2026-10-10T15:00:00Z"},
        ]

        lead_builder = MockQueryBuilder(select_data=[existing_lead])
        act_builder = MockQueryBuilder(select_data=activities, count=3)

        def table_router(table_name):
            if table_name == "recruitment_leads":
                return lead_builder
            elif table_name == "recruitment_activities":
                return act_builder
            return MockQueryBuilder()

        self.mock_db.table.side_effect = table_router

        # Test asc
        res_asc = self.client.get("/api/recruitment/leads/3/activities?order=asc", headers=self.admin_headers)
        self.assertEqual(res_asc.status_code, 200)
        body_asc = res_asc.json()
        self.assertEqual(body_asc["order"], "asc")
        self.assertEqual(len(body_asc["activities"]), 3)

        # Test desc
        res_desc = self.client.get("/api/recruitment/leads/3/activities?order=desc", headers=self.admin_headers)
        self.assertEqual(res_desc.status_code, 200)
        body_desc = res_desc.json()
        self.assertEqual(body_desc["order"], "desc")

    @patch("rbac_utils.get_user_permissions")
    def test_get_activities_invalid_order_422(self, mock_perms):
        """Verify 422 when invalid order query parameter is supplied."""
        mock_perms.return_value = {"view_recruitment"}
        res = self.client.get("/api/recruitment/leads/3/activities?order=random", headers=self.admin_headers)
        self.assertEqual(res.status_code, 422)

    @patch("rbac_utils.get_user_permissions")
    def test_get_activities_missing_candidate_404(self, mock_perms):
        """Verify 404 when retrieving activities for nonexistent candidate."""
        mock_perms.return_value = {"view_recruitment"}
        self.mock_db.table.return_value = MockQueryBuilder(select_data=[])
        res = self.client.get("/api/recruitment/leads/9999/activities", headers=self.admin_headers)
        self.assertEqual(res.status_code, 404)

    def test_get_activities_unauthorized_401(self):
        """Verify 401 when fetching activities without authentication."""
        res = self.client.get("/api/recruitment/leads/1/activities")
        self.assertEqual(res.status_code, 401)

    def test_activity_immutability_put_patch_delete_405(self):
        """Verify that attempting to update or delete activity history is rejected (405 / 404)."""
        # Test PUT and DELETE on candidate activities collection -> 405 Method Not Allowed
        res_put_col = self.client.put("/api/recruitment/leads/1/activities", json={}, headers=self.admin_headers)
        self.assertEqual(res_put_col.status_code, 405)

        res_del_col = self.client.delete("/api/recruitment/leads/1/activities", headers=self.admin_headers)
        self.assertEqual(res_del_col.status_code, 405)

        # Test PUT, PATCH, and DELETE on individual activity item -> 404 / 405 (no mutation endpoints exposed)
        res_put_item = self.client.put("/api/recruitment/leads/1/activities/10", json={}, headers=self.admin_headers)
        self.assertIn(res_put_item.status_code, (404, 405))

        res_patch = self.client.patch("/api/recruitment/leads/1/activities/10", json={}, headers=self.admin_headers)
        self.assertIn(res_patch.status_code, (404, 405))

        res_del_item = self.client.delete("/api/recruitment/leads/1/activities/10", headers=self.admin_headers)
        self.assertIn(res_del_item.status_code, (404, 405))

    @patch("rbac_utils.get_user_permissions")
    def test_identity_spoofing_prevented_in_activity_recording(self, mock_perms):
        """Verify clients cannot forge logged_by or created_by in activity payload."""
        mock_perms.return_value = {"manage_recruitment"}
        existing_lead = {"lead_id": 7, "status": "Shortlisted"}
        lead_builder = MockQueryBuilder(select_data=[existing_lead])
        act_builder = MockQueryBuilder(insert_return=[{"activity_id": 99}])

        def table_router(table_name):
            if table_name == "recruitment_leads":
                return lead_builder
            elif table_name == "recruitment_activities":
                return act_builder
            return MockQueryBuilder()

        self.mock_db.table.side_effect = table_router

        # Attempt to spoof identity in request body
        spoofed_payload = {
            "activity_type": "Note",
            "summary": "Candidate call details",
            "logged_by": "spoofed_executive@parulchem.com",
            "created_by": "spoofed_executive@parulchem.com",
        }
        res = self.client.post("/api/recruitment/leads/7/activities", json=spoofed_payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 201)

        # Verify backend ignored spoofed values and strictly recorded current_user
        inserted = act_builder.inserted_data
        self.assertEqual(inserted["logged_by"], "admin@parulchem.com")
        self.assertNotEqual(inserted["logged_by"], "spoofed_executive@parulchem.com")

    @patch("rbac_utils.get_user_permissions")
    def test_identity_spoofing_prevented_in_status_change(self, mock_perms):
        """Verify clients cannot forge logged_by identity in status change payload."""
        mock_perms.return_value = {"manage_recruitment"}
        existing_lead = {"lead_id": 7, "status": "Lead Generated"}
        lead_builder = MockQueryBuilder(select_data=[existing_lead], update_return=[{**existing_lead, "status": "Rejected"}])
        act_builder = MockQueryBuilder(insert_return=[{"activity_id": 100}])

        def table_router(table_name):
            if table_name == "recruitment_leads":
                return lead_builder
            elif table_name == "recruitment_activities":
                return act_builder
            return MockQueryBuilder()

        self.mock_db.table.side_effect = table_router

        spoofed_payload = {
            "status": "Rejected",
            "status_notes": "Not qualified",
            "logged_by": "unauthorized_forger@parulchem.com",
        }
        res = self.client.post("/api/recruitment/leads/7/status", json=spoofed_payload, headers=self.admin_headers)
        self.assertEqual(res.status_code, 200)

        inserted = act_builder.inserted_data
        self.assertEqual(inserted["logged_by"], "admin@parulchem.com")
        self.assertNotEqual(inserted["logged_by"], "unauthorized_forger@parulchem.com")

    @patch("rbac_utils.get_user_permissions")
    def test_get_follow_ups_filter_types(self, mock_perms):
        """Verify /leads/follow-ups supports overdue, today, upcoming, and all filters."""
        mock_perms.return_value = {"view_recruitment"}
        sample_follow_ups = [
            {"lead_id": 1, "candidate_name": "Overdue Lead", "follow_up_date": "2026-10-15"},
            {"lead_id": 2, "candidate_name": "Today Lead", "follow_up_date": "2026-10-22"},
            {"lead_id": 3, "candidate_name": "Upcoming Lead", "follow_up_date": "2026-10-29"},
        ]
        self.mock_db.table.return_value = MockQueryBuilder(select_data=sample_follow_ups, count=3)

        for filter_type in ("all", "overdue", "today", "upcoming"):
            res = self.client.get(
                f"/api/recruitment/leads/follow-ups?filter_type={filter_type}&reference_date=2026-10-22",
                headers=self.admin_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["filter_type"], filter_type)
            self.assertEqual(data["reference_date"], "2026-10-22")

        # Invalid filter type returns 422
        res_invalid = self.client.get(
            "/api/recruitment/leads/follow-ups?filter_type=invalid_type",
            headers=self.admin_headers,
        )
        self.assertEqual(res_invalid.status_code, 422)

    @patch("rbac_utils.get_user_permissions")
    def test_get_leads_follow_up_filter(self, mock_perms):
        """Verify /leads accepts follow_up query parameter (overdue, today, upcoming)."""
        mock_perms.return_value = {"view_recruitment"}
        self.mock_db.table.return_value = MockQueryBuilder(select_data=[], count=0)

        for follow_up in ("overdue", "today", "upcoming", "has_follow_up"):
            res = self.client.get(f"/api/recruitment/leads?follow_up={follow_up}", headers=self.admin_headers)
            self.assertEqual(res.status_code, 200)

        res_bad = self.client.get("/api/recruitment/leads?follow_up=bad_param", headers=self.admin_headers)
        self.assertEqual(res_bad.status_code, 422)

    # =========================================================================
    # Phase 3.3 Security & Authentication Tests
    # =========================================================================

    @patch("rbac_utils.get_user_permissions")
    def test_auth_valid_token_authenticated_request(self, mock_perms):
        """Phase 3.3: Verify request with valid Supabase token and active user succeeds."""
        mock_perms.return_value = {"view_recruitment"}
        self.mock_db.table.return_value = MockQueryBuilder(select_data=[], count=0)

        token = self.create_test_token("admin@parulchem.com")
        headers = {"Authorization": f"Bearer {token}"}
        res = self.client.get("/api/recruitment/leads", headers=headers)
        self.assertEqual(res.status_code, 200)

    def test_auth_missing_token_even_with_x_user_email_returns_401(self):
        """Phase 3.3: Verify request without Bearer token is rejected with 401, even with spoofed x-user-email."""
        spoofed_headers = {"x-user-email": "admin@parulchem.com"}
        res = self.client.get("/api/recruitment/leads", headers=spoofed_headers)
        self.assertEqual(res.status_code, 401)
        self.assertIn("Missing Bearer token", res.json()["detail"])

    def test_auth_invalid_malformed_token_returns_401(self):
        """Phase 3.3: Verify malformed/gibberish JWT token returns 401."""
        headers = {"Authorization": "Bearer not.a.valid.jwt.token"}
        res = self.client.get("/api/recruitment/leads", headers=headers)
        self.assertEqual(res.status_code, 401)
        self.assertIn("invalid authentication token", res.json()["detail"].lower())

    def test_auth_expired_token_returns_401(self):
        """Phase 3.3: Verify expired JWT token (exp in the past) returns 401."""
        expired_token = self.create_test_token("admin@parulchem.com", exp_offset=-300)
        headers = {"Authorization": f"Bearer {expired_token}"}
        res = self.client.get("/api/recruitment/leads", headers=headers)
        self.assertEqual(res.status_code, 401)
        self.assertIn("expired", res.json()["detail"].lower())

    def test_auth_forged_signature_token_returns_401(self):
        """Phase 3.3: Verify token signed with an invalid/forged secret returns 401."""
        forged_token = self.create_test_token("admin@parulchem.com", secret="forged-secret-key-attacker-guess-999")
        headers = {"Authorization": f"Bearer {forged_token}"}
        res = self.client.get("/api/recruitment/leads", headers=headers)
        self.assertEqual(res.status_code, 401)
        self.assertIn("invalid authentication token signature", res.json()["detail"].lower())

    def test_auth_empty_bearer_token_string_returns_401(self):
        """Verify request with empty Bearer token ('Authorization: Bearer ') returns 401 Missing Bearer token."""
        headers = {"Authorization": "Bearer "}
        res = self.client.get("/api/recruitment/leads", headers=headers)
        self.assertEqual(res.status_code, 401)
        self.assertIn("Missing Bearer token", res.json()["detail"])

    def test_auth_whitespace_only_bearer_token_returns_401(self):
        """Verify request with whitespace-only Bearer token returns 401."""
        headers = {"Authorization": "Bearer    "}
        res = self.client.get("/api/recruitment/leads", headers=headers)
        self.assertEqual(res.status_code, 401)
        self.assertIn("Missing Bearer token", res.json()["detail"])

    def test_auth_completely_empty_authorization_header_returns_401(self):
        """Verify request with empty Authorization header returns 401."""
        headers = {"Authorization": ""}
        res = self.client.get("/api/recruitment/leads", headers=headers)
        self.assertEqual(res.status_code, 401)
        self.assertIn("Missing Bearer token", res.json()["detail"])

    def test_auth_inactive_user_account_returns_403(self):
        """Phase 3.3: Verify inactive user (is_active=False in app_users) is rejected with 403."""
        inactive_email = "deactivated_user@parulchem.com"
        token = self.create_test_token(inactive_email)
        headers = {"Authorization": f"Bearer {token}"}

        # Mock app_users returning is_active=False
        self.app_user_override = [{"email": inactive_email, "role": "admin", "is_active": False}]

        res = self.client.get("/api/recruitment/leads", headers=headers)
        self.assertEqual(res.status_code, 403)
        self.assertIn("ACCOUNT_DEACTIVATED", res.json()["detail"])

    def test_auth_unregistered_user_not_in_app_users_returns_403(self):
        """Phase 3.3: Verify valid Supabase token for user not present in app_users returns 403."""
        unknown_email = "external_stranger@otherdomain.com"
        token = self.create_test_token(unknown_email)
        headers = {"Authorization": f"Bearer {token}"}

        # Mock app_users returning empty list (user does not exist in app_users)
        self.app_user_override = []

        res = self.client.get("/api/recruitment/leads", headers=headers)
        self.assertEqual(res.status_code, 403)
        self.assertIn("not found in registered app users", res.json()["detail"])

    @patch("rbac_utils.get_user_permissions")
    def test_auth_insufficient_permissions_hr_user_returns_403(self, mock_perms):
        """Phase 3.3: Verify hr_&_administration user without recruitment permissions returns 403."""
        hr_email = "hr_manager@parulchem.com"
        token = self.create_test_token(hr_email)
        headers = {"Authorization": f"Bearer {token}"}

        # Mock HR user with role hr_&_administration and other non-recruitment permissions
        self.app_user_override = [{"email": hr_email, "role": "hr_&_administration", "is_active": True}]
        mock_perms.return_value = {"view_all_sales", "view_reports"}

        res = self.client.get("/api/recruitment/leads", headers=headers)
        self.assertEqual(res.status_code, 403)
        self.assertIn("Missing permission: 'view_recruitment'", res.json()["detail"])

    @patch("rbac_utils.get_user_permissions")
    def test_auth_identity_derived_from_token_spoofed_header_ignored(self, mock_perms):
        """Phase 3.3: Verify caller sending valid staff token cannot spoof admin by sending x-user-email."""
        staff_email = "staff_member@parulchem.com"
        token = self.create_test_token(staff_email)

        # The caller sends their real staff token, but spoofs x-user-email as admin
        malicious_headers = {
            "Authorization": f"Bearer {token}",
            "x-user-email": "admin@parulchem.com",
        }

        self.app_user_override = [{"email": staff_email, "role": "staff", "is_active": True}]
        mock_perms.return_value = {"create_sale"}  # staff lacks view_recruitment

        res = self.client.get("/api/recruitment/leads", headers=malicious_headers)
        self.assertEqual(res.status_code, 403)

        # Verify get_user_permissions was called with staff_email, NOT admin@parulchem.com
        mock_perms.assert_called_with(staff_email, self.mock_db)

    @patch("rbac_utils.get_user_permissions")
    def test_auth_create_lead_derives_created_by_from_verified_token(self, mock_perms):
        """Phase 3.3: Verify created_by on new candidates comes strictly from verified token, ignoring x-user-email."""
        mock_perms.return_value = {"manage_recruitment"}
        cat_data = [{"category_id": 1, "category_name": "Sales Executive", "is_active": True}]
        lead_builder = MockQueryBuilder(insert_return=[{"lead_id": 1, "lead_code": "REC-000001"}])
        act_builder = MockQueryBuilder(insert_return=[{"activity_id": 1}])

        def table_router(table_name):
            if table_name == "recruitment_categories":
                return MockQueryBuilder(select_data=cat_data)
            elif table_name == "recruitment_leads":
                return lead_builder
            elif table_name == "recruitment_activities":
                return act_builder
            return MockQueryBuilder()

        self.mock_db.table.side_effect = table_router

        # Admin token, but client supplies spoofed x-user-email
        admin_token = self.create_test_token("admin@parulchem.com")
        headers = {
            "Authorization": f"Bearer {admin_token}",
            "x-user-email": "forged_victim@parulchem.com",
        }

        payload = {
            "candidate_name": "Test Candidate",
            "phone": "9876543210",
            "category_name": "Sales Executive",
        }

        res = self.client.post("/api/recruitment/leads", json=payload, headers=headers)
        self.assertEqual(res.status_code, 200)

        # Verify created_by was taken from verified token ('admin@parulchem.com'), NOT forged header
        inserted_lead = lead_builder.inserted_data
        self.assertEqual(inserted_lead["created_by"], "admin@parulchem.com")
        self.assertNotEqual(inserted_lead["created_by"], "forged_victim@parulchem.com")

    def test_legacy_endpoint_backward_compatibility(self):
        """Phase 3.3: Verify authenticate_request supports legacy endpoints with x-user-email when require_token=False."""
        from rbac_utils import authenticate_request

        # 1. Legacy call with x-user-email without token succeeds when require_token=False
        email = authenticate_request(
            authorization=None,
            user_email_header="legacy_user@parulchem.com",
            require_token=False,
        )
        self.assertEqual(email, "legacy_user@parulchem.com")

        # 2. Modern call with Bearer token works and ignores x-user-email
        valid_token = self.create_test_token("token_user@parulchem.com")
        email_with_token = authenticate_request(
            authorization=f"Bearer {valid_token}",
            user_email_header="different_header@parulchem.com",
            require_token=False,
        )
        self.assertEqual(email_with_token, "token_user@parulchem.com")

        # 3. Invalid Bearer token is rejected even on legacy endpoints
        with self.assertRaises(HTTPException) as ctx:
            authenticate_request(
                authorization="Bearer invalid.token.value",
                user_email_header="legacy_user@parulchem.com",
                require_token=False,
            )
        self.assertEqual(ctx.exception.status_code, 401)

        # 4. Missing both headers on legacy endpoint raises 401
        with self.assertRaises(HTTPException) as ctx:
            authenticate_request(
                authorization=None,
                user_email_header=None,
                require_token=False,
            )
        self.assertEqual(ctx.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()


