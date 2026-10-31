"""
Recruitment Module Router
-------------------------
Handles recruitment categories, candidate profiles, Google Drive resume validation,
duplicate candidate detection, and initial candidate lifecycle tracking.
Strictly isolated from commercial Sales Leads tables.
"""
import logging
import os
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from models import (
    RecruitmentCategory,
    RecruitmentLeadCreate,
    RecruitmentLeadUpdate,
    RecruitmentActivityCreate,
    RecruitmentStatusChange,
)
from rbac_utils import verify_permission
from supabase_db import SupabaseClient, get_db

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_STATUSES = {"Lead Generated", "Shortlisted", "Profile on Hold", "Rejected"}
ALLOWED_ACTIVITY_TYPES = {
    "Note",
    "Call",
    "Interview",
    "Follow-up",
    "Status Change",
    "Email",
    "Review",
    "Creation",
    "Other",
}
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


# ─── Validation Helpers ───────────────────────────────────────────────────────

def validate_candidate_phone(phone: Optional[str]) -> str:
    """Validate 10-digit mobile number, stripping common Indian prefixes and punctuation."""
    if not phone or not phone.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Phone number is required",
        )
    cleaned = re.sub(r"[\s\-\(\)\.]", "", phone.strip())
    if cleaned.startswith("+91"):
        cleaned = cleaned[3:]
    elif cleaned.startswith("91") and len(cleaned) == 12:
        cleaned = cleaned[2:]

    if not re.match(r"^[0-9]{10}$", cleaned):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please enter a valid 10-digit mobile number",
        )
    return cleaned


def validate_candidate_email(email: Optional[str]) -> Optional[str]:
    """Validate standard email format if provided."""
    if not email or not email.strip():
        return None
    cleaned = email.strip()
    if not EMAIL_REGEX.match(cleaned):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid email address format",
        )
    return cleaned.lower()


def validate_google_drive_url(url: Optional[str]) -> Optional[str]:
    """
    Validate that resume_url is a legitimate HTTP/HTTPS Google Drive URL.
    Checks scheme and hostname strictly (drive.google.com or docs.google.com).
    """
    if not url or not url.strip():
        return None
    cleaned = url.strip()
    try:
        parsed = urlparse(cleaned)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid resume URL format",
        )

    if parsed.scheme.lower() not in ("http", "https"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Resume URL must use http or https protocol",
        )

    hostname = (parsed.hostname or "").lower()
    allowed_hostnames = {"drive.google.com", "docs.google.com"}

    is_valid = (
        hostname in allowed_hostnames
        or any(hostname.endswith("." + allowed) for allowed in allowed_hostnames)
    )

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Resume URL must be a valid Google Drive URL (drive.google.com or docs.google.com)",
        )

    return cleaned


def validate_candidate_status(status_val: Optional[str]) -> str:
    """Validate candidate status against the database check constraint set."""
    if not status_val or not status_val.strip():
        return "Lead Generated"
    cleaned = status_val.strip()
    if cleaned not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status '{cleaned}'. Allowed statuses: {', '.join(sorted(ALLOWED_STATUSES))}",
        )
    return cleaned


def validate_iso_date(date_str: Optional[str], field_name: str = "date") -> Optional[str]:
    """Validate that date_str is a valid YYYY-MM-DD ISO date string."""
    if not date_str or not date_str.strip():
        return None
    cleaned = date_str.strip()
    try:
        parsed = datetime.strptime(cleaned, "%Y-%m-%d").date()
        return parsed.isoformat()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid {field_name} '{cleaned}'. Format must be YYYY-MM-DD",
        )


def validate_activity_type(act_type: Optional[str]) -> str:
    """Validate activity type against allowed set (case-insensitive lookup)."""
    if not act_type or not act_type.strip():
        return "Note"
    cleaned = act_type.strip()
    matched = next((t for t in ALLOWED_ACTIVITY_TYPES if t.lower() == cleaned.lower()), None)
    if not matched:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid activity type '{cleaned}'. Allowed types: {', '.join(sorted(ALLOWED_ACTIVITY_TYPES))}",
        )
    return matched


def resolve_category(db: SupabaseClient, category_id: Optional[int]) -> tuple[Optional[int], str]:
    """
    Validate category existence in recruitment_categories and return (category_id, category_name).
    Maintains denormalized category_name consistency.
    """
    if category_id is None:
        return None, "Unassigned"

    cat_res = (
        db.table("recruitment_categories")
        .select("category_id, name, is_active")
        .eq("category_id", category_id)
        .execute()
    )
    if not cat_res.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Recruitment category with id {category_id} does not exist",
        )

    cat = cat_res.data[0]
    if not cat.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Recruitment category '{cat.get('name')}' is inactive",
        )

    return cat["category_id"], cat["name"]


def find_duplicate_candidates(
    db: SupabaseClient,
    phone: Optional[str],
    email: Optional[str] = None,
    exclude_id: Optional[int] = None,
) -> list[dict]:
    """Search for existing unarchived candidates matching phone or email."""
    matches = []
    if phone:
        q = (
            db.table("recruitment_leads")
            .select("lead_id, lead_code, candidate_name, phone, email, status, category_name, created_at")
            .eq("is_archived", False)
            .eq("phone", phone)
        )
        if exclude_id is not None:
            q = q.neq("lead_id", exclude_id)
        res = q.limit(5).execute()
        if res.data:
            matches.extend(res.data)

    if email and not matches:
        q = (
            db.table("recruitment_leads")
            .select("lead_id, lead_code, candidate_name, phone, email, status, category_name, created_at")
            .eq("is_archived", False)
            .eq("email", email.lower())
        )
        if exclude_id is not None:
            q = q.neq("lead_id", exclude_id)
        res = q.limit(5).execute()
        if res.data:
            matches.extend(res.data)

    return matches


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/categories", dependencies=[Depends(verify_permission("view_recruitment"))])
def get_recruitment_categories(
    db: SupabaseClient = Depends(get_db),
):
    """List active recruitment categories."""
    try:
        res = (
            db.table("recruitment_categories")
            .select("*")
            .eq("is_active", True)
            .order("name")
            .execute()
        )
        categories = []
        for cat in (res.data or []):
            item = dict(cat)
            if "category_name" not in item:
                item["category_name"] = item.get("name", "")
            categories.append(item)
        return categories
    except Exception as e:
        logger.error(f"[RECRUITMENT] Error fetching recruitment categories: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching recruitment categories: {str(e)}",
        )


@router.get("/leads/check-duplicate", dependencies=[Depends(verify_permission("view_recruitment"))])
def check_duplicate_candidate(
    phone: Optional[str] = Query(None, description="Phone number to check"),
    email: Optional[str] = Query(None, description="Email address to check"),
    exclude_id: Optional[int] = Query(None, description="Exclude candidate lead_id"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Check if a candidate phone or email already exists in the talent pool.
    Informational endpoint used by UI warning dialogs.
    """
    try:
        clean_phone = None
        if phone:
            clean = re.sub(r"[\s\-\(\)\.]", "", phone.strip())
            if clean.startswith("+91"):
                clean = clean[3:]
            elif clean.startswith("91") and len(clean) == 12:
                clean = clean[2:]
            clean_phone = clean

        clean_email = email.strip().lower() if email else None
        duplicates = find_duplicate_candidates(
            db, phone=clean_phone, email=clean_email, exclude_id=exclude_id
        )
        return {
            "duplicate_found": len(duplicates) > 0,
            "matches": duplicates,
        }
    except Exception as e:
        logger.error(f"[RECRUITMENT] Error checking duplicates: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error checking duplicates: {str(e)}",
        )


@router.get("/leads/follow-ups", dependencies=[Depends(verify_permission("view_recruitment"))])
def get_recruitment_follow_ups(
    filter_type: str = Query("all", pattern="^(all|overdue|today|upcoming)$", description="Filter type: all, overdue, today, upcoming"),
    reference_date: Optional[str] = Query(None, description="Reference ISO date YYYY-MM-DD, defaults to current UTC date"),
    category_id: Optional[int] = Query(None, description="Optional category filter"),
    limit: int = Query(50, ge=1, le=100, description="Page limit"),
    offset: int = Query(0, ge=0, description="Page offset"),
    db: SupabaseClient = Depends(get_db),
):
    """
    List candidate leads with scheduled follow-ups.
    Supports filtering by overdue, today, upcoming, or all scheduled follow-ups.
    """
    try:
        ref_date = validate_iso_date(reference_date, "reference_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")

        query = db.table("recruitment_leads").select("*", count="exact")
        query = query.eq("is_archived", False).not_null("follow_up_date")

        if category_id is not None:
            query = query.eq("category_id", category_id)

        if filter_type == "overdue":
            query = query.lt("follow_up_date", ref_date).order("follow_up_date", desc=False)
        elif filter_type == "today":
            query = query.eq("follow_up_date", ref_date).order("candidate_name", desc=False)
        elif filter_type == "upcoming":
            query = query.gt("follow_up_date", ref_date).order("follow_up_date", desc=False)
        else:  # "all"
            query = query.order("follow_up_date", desc=False)

        resp = query.range(offset, offset + limit - 1).execute()
        leads = resp.data or []
        total = resp.count if resp.count is not None else len(leads)

        return {
            "leads": leads,
            "total": total,
            "filter_type": filter_type,
            "reference_date": ref_date,
            "limit": limit,
            "offset": offset,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RECRUITMENT] Error fetching candidate follow-ups: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching candidate follow-ups: {str(e)}",
        )


@router.get("/leads", dependencies=[Depends(verify_permission("view_recruitment"))])
def get_recruitment_leads(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by candidate status"),
    category_id: Optional[int] = Query(None, description="Filter by category ID"),
    search: Optional[str] = Query(None, description="Search candidate name, phone, email, lead_code"),
    follow_up: Optional[str] = Query(None, description="Filter: overdue, today, upcoming, or has_follow_up"),
    is_archived: bool = Query(False, description="Filter archived candidates"),
    limit: int = Query(25, ge=1, le=100, description="Page limit"),
    offset: int = Query(0, ge=0, description="Page offset"),
    db: SupabaseClient = Depends(get_db),
):
    """List candidate leads with filtering and pagination."""
    try:
        query = db.table("recruitment_leads").select("*", count="exact")
        query = query.eq("is_archived", is_archived)

        if status_filter:
            query = query.eq("status", status_filter)
        if category_id is not None:
            query = query.eq("category_id", category_id)

        if follow_up:
            today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            f_clean = follow_up.strip().lower()
            if f_clean == "overdue":
                query = query.not_null("follow_up_date").lt("follow_up_date", today_str)
            elif f_clean == "today":
                query = query.eq("follow_up_date", today_str)
            elif f_clean == "upcoming":
                query = query.gt("follow_up_date", today_str)
            elif f_clean in ("has_follow_up", "all"):
                query = query.not_null("follow_up_date")
            else:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invalid follow_up filter '{follow_up}'. Allowed: overdue, today, upcoming, has_follow_up",
                )

        if search and search.strip():
            clean_search = re.sub(r'[,.()"\']', "", search.strip())
            clean_search = clean_search.replace("%", "\\%").replace("_", "\\_")
            term = f"%{clean_search}%"
            query = query.or_(
                f"candidate_name.ilike.{term},"
                f"phone.ilike.{term},"
                f"email.ilike.{term},"
                f"lead_code.ilike.{term}"
            )

        resp = (
            query.order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        leads = resp.data or []
        total = resp.count if resp.count is not None else len(leads)

        return {
            "leads": leads,
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RECRUITMENT] Error fetching candidate leads: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching recruitment leads: {str(e)}",
        )


@router.get("/leads/{lead_id}", dependencies=[Depends(verify_permission("view_recruitment"))])
def get_recruitment_lead(
    lead_id: int,
    db: SupabaseClient = Depends(get_db),
):
    """Retrieve details for a single candidate lead."""
    try:
        res = db.table("recruitment_leads").select("*").eq("lead_id", lead_id).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Candidate lead with id {lead_id} not found",
            )
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RECRUITMENT] Error fetching candidate lead {lead_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching candidate lead: {str(e)}",
        )


@router.get("/leads/{lead_id}/activities", dependencies=[Depends(verify_permission("view_recruitment"))])
def get_candidate_activities(
    lead_id: int,
    order: str = Query("asc", pattern="^(asc|desc)$", description="Chronological ordering: 'asc' (oldest first) or 'desc' (newest first)"),
    limit: int = Query(50, ge=1, le=200, description="Page limit"),
    offset: int = Query(0, ge=0, description="Page offset"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Retrieve activity history for a candidate lead, ordered chronologically.
    Verifies candidate existence and respects immutability.
    """
    try:
        lead_check = db.table("recruitment_leads").select("lead_id, lead_code, candidate_name").eq("lead_id", lead_id).execute()
        if not lead_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Candidate lead with id {lead_id} not found",
            )
        candidate = lead_check.data[0]

        is_desc = (order.lower() == "desc")
        query = (
            db.table("recruitment_activities")
            .select("*", count="exact")
            .eq("lead_id", lead_id)
            .order("logged_at", desc=is_desc)
            .order("activity_id", desc=is_desc)
            .range(offset, offset + limit - 1)
        )
        resp = query.execute()
        activities = resp.data or []
        total = resp.count if resp.count is not None else len(activities)

        return {
            "lead_id": lead_id,
            "candidate_name": candidate.get("candidate_name"),
            "lead_code": candidate.get("lead_code"),
            "activities": activities,
            "total": total,
            "order": order.lower(),
            "limit": limit,
            "offset": offset,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RECRUITMENT] Error fetching activities for lead {lead_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching candidate activities: {str(e)}",
        )


@router.post("/leads/{lead_id}/activities", status_code=status.HTTP_201_CREATED)
def record_candidate_activity(
    lead_id: int,
    payload: RecruitmentActivityCreate,
    current_user: str = Depends(verify_permission("manage_recruitment")),
    db: SupabaseClient = Depends(get_db),
):
    """
    Record an activity (Note, Call, Interview, Follow-up, etc.) for a candidate lead.
    Identity is strictly derived from the authenticated context (current_user).
    Client-provided logged_by or created_by values are never accepted.
    If follow_up_date is provided, recruitment_leads.follow_up_date is synchronized.
    """
    try:
        lead_check = db.table("recruitment_leads").select("lead_id, status").eq("lead_id", lead_id).execute()
        if not lead_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Candidate lead with id {lead_id} not found",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RECRUITMENT] Error checking lead {lead_id} for activity recording: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error checking candidate lead: {str(e)}",
        )

    summary = (payload.summary or "").strip()
    if not summary:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Activity summary is required",
        )

    activity_type = validate_activity_type(payload.activity_type)
    follow_up_date = validate_iso_date(payload.follow_up_date, "follow_up_date")

    activity_data = {
        "lead_id": lead_id,
        "activity_type": activity_type,
        "summary": summary,
        "details": payload.details.strip() if payload.details else None,
        "outcome": payload.outcome.strip() if payload.outcome else None,
        "next_action": payload.next_action.strip() if payload.next_action else None,
        "follow_up_date": follow_up_date,
        "logged_by": current_user,  # Derived strictly from trusted auth context
        "is_auto": False,
    }

    try:
        res = db.table("recruitment_activities").insert(activity_data).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to record activity in database",
            )
        created_activity = res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RECRUITMENT] Error inserting activity for lead {lead_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error inserting activity: {str(e)}",
        )

    # If follow_up_date is provided, synchronize it to recruitment_leads
    if follow_up_date:
        try:
            db.table("recruitment_leads").eq("lead_id", lead_id).update({
                "follow_up_date": follow_up_date,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception as sync_err:
            logger.warning(
                f"[RECRUITMENT] Recorded activity {created_activity.get('activity_id')} "
                f"but failed to sync follow_up_date to lead {lead_id}: {sync_err}"
            )

    return created_activity


@router.post("/leads/{lead_id}/status")
def change_candidate_status(
    lead_id: int,
    payload: RecruitmentStatusChange,
    current_user: str = Depends(verify_permission("manage_recruitment")),
    db: SupabaseClient = Depends(get_db),
):
    """
    Dedicated status transition endpoint for candidate leads.
    Validates against the four permitted statuses:
      - Lead Generated
      - Shortlisted
      - Profile on Hold
      - Rejected
    Logs status transition into recruitment_activities with old_status, new_status,
    summary, trusted logged_by identity, and timestamp.
    Explicitly handles audit logging consistency across REST calls.
    """
    try:
        existing_res = db.table("recruitment_leads").select("*").eq("lead_id", lead_id).execute()
        if not existing_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Candidate lead with id {lead_id} not found",
            )
        existing_lead = existing_res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RECRUITMENT] Error loading lead {lead_id} for status change: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error loading candidate lead: {str(e)}",
        )

    new_status = validate_candidate_status(payload.status)
    old_status = existing_lead.get("status", "Lead Generated")
    follow_up_date = validate_iso_date(payload.follow_up_date, "follow_up_date")
    status_notes = payload.status_notes.strip() if payload.status_notes else None

    # Prepare lead update
    lead_update = {
        "status": new_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if status_notes is not None:
        lead_update["status_notes"] = status_notes
    if payload.follow_up_date is not None:
        lead_update["follow_up_date"] = follow_up_date

    try:
        upd_res = db.table("recruitment_leads").eq("lead_id", lead_id).update(lead_update).execute()
        if not upd_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update status for candidate lead {lead_id}",
            )
        updated_lead = upd_res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RECRUITMENT] Database error updating status for lead {lead_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error updating candidate status: {str(e)}",
        )

    # Record status transition in recruitment_activities
    activity_data = {
        "lead_id": lead_id,
        "activity_type": "Status Change",
        "old_status": old_status,
        "new_status": new_status,
        "summary": f"Status changed from {old_status} to {new_status}",
        "details": status_notes,
        "follow_up_date": follow_up_date,
        "logged_by": current_user,  # Derived strictly from trusted auth context
        "is_auto": False,
    }

    activity_logged = True
    activity_record = None
    activity_error = None
    try:
        act_res = db.table("recruitment_activities").insert(activity_data).execute()
        if act_res.data:
            activity_record = act_res.data[0]
    except Exception as act_err:
        activity_logged = False
        activity_error = str(act_err)
        logger.error(
            f"[RECRUITMENT] Lead {lead_id} status updated to '{new_status}', "
            f"but failed to insert activity audit entry: {act_err}"
        )

    return {
        "success": True,
        "lead": updated_lead,
        "activity_logged": activity_logged,
        "activity": activity_record,
        "activity_error": activity_error,
    }


@router.post("/leads")
def create_recruitment_lead(
    payload: RecruitmentLeadCreate,
    current_user: str = Depends(verify_permission("manage_recruitment")),
    db: SupabaseClient = Depends(get_db),
):
    """
    Create a new candidate lead.
    Validates required fields, phone/email, Google Drive URL, and checks duplicates.
    lead_code is auto-generated by the PostgreSQL sequence trigger.
    created_by is populated strictly from the authenticated identity.
    """
    candidate_name = payload.candidate_name.strip()
    if not candidate_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Candidate name is required",
        )

    phone = validate_candidate_phone(payload.phone)
    alternate_phone = validate_candidate_phone(payload.alternate_phone) if payload.alternate_phone else None
    email = validate_candidate_email(payload.email)
    resume_url = validate_google_drive_url(payload.resume_url)
    status_val = validate_candidate_status(payload.status)
    follow_up_date = validate_iso_date(payload.follow_up_date, "follow_up_date")

    if payload.total_experience_years < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Total experience years must be >= 0",
        )
    if payload.current_ctc is not None and payload.current_ctc < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Current CTC must be >= 0",
        )
    if payload.expected_ctc is not None and payload.expected_ctc < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Expected CTC must be >= 0",
        )
    if payload.notice_period_days is not None and payload.notice_period_days < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Notice period days must be >= 0",
        )

    resolved_cat_id, category_name = resolve_category(db, payload.category_id)

    # Duplicate check: warn/conflict if duplicate exists and client has not confirmed allow_duplicate
    duplicates = find_duplicate_candidates(db, phone=phone, email=email)
    if duplicates and not payload.allow_duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "DUPLICATE_CANDIDATE",
                "message": f"A candidate with phone '{phone}' or email '{email or ''}' already exists.",
                "existing_candidate": duplicates[0],
            },
        )

    # Construct insert record. Notice lead_code is omitted so the DB trigger populates it.
    lead_record = {
        "candidate_name": candidate_name,
        "email": email,
        "phone": phone,
        "alternate_phone": alternate_phone,
        "city": payload.city.strip() if payload.city else None,
        "state": payload.state.strip() if payload.state else "Gujarat",
        "category_id": resolved_cat_id,
        "category_name": category_name,
        "source": payload.source.strip() if payload.source else "Manual",
        "current_company": payload.current_company.strip() if payload.current_company else None,
        "current_designation": payload.current_designation.strip() if payload.current_designation else None,
        "total_experience_years": payload.total_experience_years,
        "highest_qualification": payload.highest_qualification.strip() if payload.highest_qualification else None,
        "current_ctc": payload.current_ctc,
        "expected_ctc": payload.expected_ctc,
        "notice_period_days": payload.notice_period_days,
        "key_skills": payload.key_skills.strip() if payload.key_skills else None,
        "resume_url": resume_url,
        "questionnaire_responses": payload.questionnaire_responses or {},
        "status": status_val,
        "status_notes": payload.status_notes.strip() if payload.status_notes else None,
        "follow_up_date": follow_up_date,
        "assigned_to": payload.assigned_to.strip() if payload.assigned_to else None,
        "created_by": current_user,
        "is_archived": False,
    }

    try:
        res = db.table("recruitment_leads").insert(lead_record).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create candidate lead record in database",
            )
        created_lead = res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RECRUITMENT] Failed to insert candidate lead: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error creating candidate lead: {str(e)}",
        )

    # Initial append-only activity log entry.
    # Handled with graceful fallback: failure to log the audit entry does not invalidate
    # the created lead, as multi-table transactions are not supported over REST.
    new_lead_id = created_lead["lead_id"]
    try:
        activity_data = {
            "lead_id": new_lead_id,
            "activity_type": "Creation",
            "new_status": status_val,
            "summary": f"Candidate profile created by {current_user}",
            "logged_by": current_user,
            "is_auto": True,
        }
        db.table("recruitment_activities").insert(activity_data).execute()
    except Exception as act_err:
        logger.warning(
            f"[RECRUITMENT] Created lead {new_lead_id} but failed to log activity audit entry: {act_err}"
        )

    return created_lead


@router.patch("/leads/{lead_id}")
def update_recruitment_lead(
    lead_id: int,
    payload: RecruitmentLeadUpdate,
    current_user: str = Depends(verify_permission("manage_recruitment")),
    db: SupabaseClient = Depends(get_db),
):
    """
    Update editable fields of a candidate lead.
    Prohibits modifying lead_id, lead_code, created_by, or created_at.
    Maintains category consistency and updates updated_at.
    """
    try:
        existing_res = db.table("recruitment_leads").select("*").eq("lead_id", lead_id).execute()
        if not existing_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Candidate lead with id {lead_id} not found",
            )
        existing_lead = existing_res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RECRUITMENT] Error loading candidate lead {lead_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error loading candidate lead: {str(e)}",
        )

    update_payload = payload.model_dump(exclude_unset=True)

    # Explicitly prohibit immutable audit and identity fields
    for forbidden in ("lead_id", "lead_code", "created_by", "created_at"):
        update_payload.pop(forbidden, None)

    if not update_payload:
        return existing_lead

    update_data = {}

    if "candidate_name" in update_payload:
        val = (update_payload["candidate_name"] or "").strip()
        if not val:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Candidate name cannot be empty",
            )
        update_data["candidate_name"] = val

    if "phone" in update_payload:
        update_data["phone"] = validate_candidate_phone(update_payload["phone"])

    if "alternate_phone" in update_payload:
        val = update_payload["alternate_phone"]
        update_data["alternate_phone"] = validate_candidate_phone(val) if val else None

    if "email" in update_payload:
        update_data["email"] = validate_candidate_email(update_payload["email"])

    if "resume_url" in update_payload:
        update_data["resume_url"] = validate_google_drive_url(update_payload["resume_url"])

    if "category_id" in update_payload:
        cat_id, cat_name = resolve_category(db, update_payload["category_id"])
        update_data["category_id"] = cat_id
        update_data["category_name"] = cat_name

    if "status" in update_payload:
        update_data["status"] = validate_candidate_status(update_payload["status"])

    if "total_experience_years" in update_payload:
        exp = update_payload["total_experience_years"]
        if exp is not None and exp < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Total experience years must be >= 0",
            )
        update_data["total_experience_years"] = exp

    if "current_ctc" in update_payload:
        ctc = update_payload["current_ctc"]
        if ctc is not None and ctc < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Current CTC must be >= 0",
            )
        update_data["current_ctc"] = ctc

    if "expected_ctc" in update_payload:
        ctc = update_payload["expected_ctc"]
        if ctc is not None and ctc < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Expected CTC must be >= 0",
            )
        update_data["expected_ctc"] = ctc

    if "notice_period_days" in update_payload:
        np_days = update_payload["notice_period_days"]
        if np_days is not None and np_days < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Notice period days must be >= 0",
            )
        update_data["notice_period_days"] = np_days

    if "follow_up_date" in update_payload:
        update_data["follow_up_date"] = validate_iso_date(update_payload["follow_up_date"], "follow_up_date")

    # Simple scalar and dictionary fields
    for field in (
        "city",
        "state",
        "source",
        "current_company",
        "current_designation",
        "highest_qualification",
        "key_skills",
        "questionnaire_responses",
        "status_notes",
        "assigned_to",
        "is_archived",
    ):
        if field in update_payload:
            update_data[field] = update_payload[field]

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        res = db.table("recruitment_leads").eq("lead_id", lead_id).update(update_data).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update candidate lead {lead_id}",
            )
        updated_lead = res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RECRUITMENT] Failed to update candidate lead {lead_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error updating candidate lead: {str(e)}",
        )

    # If status changed, log status change activity
    old_status = existing_lead.get("status")
    new_status = updated_lead.get("status")
    if "status" in update_data and old_status != new_status:
        try:
            activity_data = {
                "lead_id": lead_id,
                "activity_type": "Status Change",
                "old_status": old_status,
                "new_status": new_status,
                "summary": f"Status changed from {old_status} to {new_status}",
                "details": update_data.get("status_notes"),
                "logged_by": current_user,
                "is_auto": True,
            }
            db.table("recruitment_activities").insert(activity_data).execute()
        except Exception as act_err:
            logger.warning(
                f"[RECRUITMENT] Updated lead {lead_id} status but failed to log activity: {act_err}"
            )

    return updated_lead
