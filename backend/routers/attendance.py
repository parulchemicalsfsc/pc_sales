"""
Attendance / Duty Sheet Router — v2

Roles that can submit the duty sheet: admin, sales_manager, manager.
Telecallers themselves no longer interact with this router from the UI.

Endpoints:
  GET  /api/attendance/duty-sheet-status   — should the popup open?
  GET  /api/attendance/telecallers         — list of all active telecallers
  POST /api/attendance/submit-duty-sheet   — admin/SM submits duty toggles

Legacy endpoints kept for backward-compat (nothing calls them from the UI):
  GET  /api/attendance/status
  POST /api/attendance/mark
"""

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from typing import List
from supabase_db import SupabaseClient, get_db
from datetime import datetime
import pytz
import logging

router = APIRouter()
logger = logging.getLogger("attendance")

IST = pytz.timezone("Asia/Kolkata")

# ─── Roles allowed to manage the duty sheet ───────────────────────────────────
DUTY_ROLES = {"admin", "sales_manager", "manager"}


# ─── Pydantic models ──────────────────────────────────────────────────────────

class TelecallerDuty(BaseModel):
    email: str
    is_on_duty: bool


class DutySheetPayload(BaseModel):
    telecallers: List[TelecallerDuty]


# Legacy model (kept for /mark endpoint)
class AttendanceMark(BaseModel):
    is_present: bool


# ─── Helpers ──────────────────────────────────────────────────────────────────

def get_today_ist() -> str:
    """Returns today's date in YYYY-MM-DD format (IST)."""
    return datetime.now(IST).date().isoformat()


def _get_now_ist():
    return datetime.now(IST)


def _is_before_10am() -> bool:
    return _get_now_ist().hour < 10


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/duty-sheet-status")
def get_duty_sheet_status(
    x_user_role: str = Header(None, alias="x-user-role"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Returns whether the duty-sheet popup should be shown to the calling user.

    Rules:
    - Only admin / sales_manager / manager roles see the popup.
    - Popup only shows before 10:00 AM IST.
    - If the duty sheet was already submitted today (by anyone), popup is suppressed.

    Order: role-check FIRST, then DB lookup, so a missing table never silently
    suppresses the popup for a valid admin/SM.
    """
    today = get_today_ist()
    before_10am = _is_before_10am()

    # ── 1. Role check FIRST (fast, no DB needed) ─────────────────────────────
    role = (x_user_role or "").lower().replace(" ", "_")
    if role not in DUTY_ROLES:
        logger.info(f"[DUTY] duty-sheet-status: role='{role}' not in DUTY_ROLES — no popup")
        return {"should_show_popup": False, "submitted": False, "before_10am": before_10am}

    # ── 2. Time check (before 10 AM IST only) ────────────────────────────────
    if not before_10am:
        logger.info(f"[DUTY] duty-sheet-status: after 10 AM — no popup")
        return {"should_show_popup": False, "submitted": False, "before_10am": False}

    # ── 3. Check if already submitted today ──────────────────────────────────
    #    If the duty_sheet_log table doesn't exist yet (migration pending),
    #    treat it as "not yet submitted" and still show the popup.
    try:
        res = db.table("duty_sheet_log").select("submitted_by, submitted_at").eq("duty_date", today).execute()
        if res.data:
            record = res.data[0]
            logger.info(f"[DUTY] duty-sheet-status: already submitted by {record.get('submitted_by')}")
            return {
                "should_show_popup": False,
                "submitted": True,
                "submitted_by": record.get("submitted_by"),
                "submitted_at": record.get("submitted_at"),
                "before_10am": before_10am,
            }
    except Exception as e:
        # Table may not exist yet — treat as not submitted and SHOW the popup.
        # The submit endpoint will create the row; if the table truly doesn't
        # exist, submit will fail with a clear error.
        logger.warning(f"[DUTY] duty_sheet_log query failed (table may not exist): {e}")

    logger.info(f"[DUTY] duty-sheet-status: role='{role}', before_10am={before_10am} — SHOW popup")
    return {
        "should_show_popup": True,
        "submitted": False,
        "submitted_by": None,
        "submitted_at": None,
        "before_10am": before_10am,
    }


@router.get("/telecallers")
def get_all_telecallers(
    db: SupabaseClient = Depends(get_db),
):
    """
    Returns all active telecallers from app_users table.
    'Active' means: is_active = true AND role contains 'telecaller' or matches staff-type roles.
    Inactive / deactivated accounts are excluded.
    """
    today = get_today_ist()
    telecaller_roles = {"telecaller", "staff", "telecaller1", "telecaller2"}

    try:
        res = db.table("app_users").select("email, name, role, is_active").execute()
        users = res.data or []

        telecallers = [
            u for u in users
            if (
                u.get("is_active", True) is not False  # exclude deactivated
                and (
                    u.get("role", "").lower().replace(" ", "_") in telecaller_roles
                    or "telecaller" in u.get("role", "").lower()
                )
            )
        ]

        # Fetch today's existing duty status for pre-population
        att_res = db.table("telecaller_attendance") \
            .select("user_email, is_present") \
            .eq("attendance_date", today) \
            .execute()
        duty_map = {r["user_email"]: r["is_present"] for r in (att_res.data or [])}

        result = []
        for t in telecallers:
            email = t["email"]
            result.append({
                "email": email,
                "name": t.get("name") or email,
                "role": t.get("role", ""),
                # Default to True (on duty) if not yet set for today
                "is_on_duty": duty_map.get(email, True),
            })

        logger.info(f"[DUTY] Returning {len(result)} active telecallers")
        return {"telecallers": result}

    except Exception as e:
        logger.error(f"[DUTY] Error fetching telecallers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch telecallers")


@router.post("/submit-duty-sheet")
def submit_duty_sheet(
    body: DutySheetPayload,
    x_user_email: str = Header(..., alias="x-user-email"),
    x_user_role: str = Header(None, alias="x-user-role"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Admin / Sales Manager submits the daily duty sheet.

    Guards:
    1. Role must be admin / sales_manager / manager.
    2. Current IST time must be before 10:00 AM.
    3. Duty sheet must not have been submitted already today (idempotency via UNIQUE constraint).

    On success:
    - Upserts telecaller_attendance records (one per telecaller).
    - Inserts a row into duty_sheet_log to lock the day.
    """
    role = (x_user_role or "").lower().replace(" ", "_")
    if role not in DUTY_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only admin or sales manager can submit the duty sheet",
        )

    # ── Guard: reject submissions at/after 10:00 AM IST ──────────────────────
    now_ist = _get_now_ist()
    if now_ist.hour >= 10:
        raise HTTPException(
            status_code=400,
            detail="Duty sheet submission window has closed for today (must submit before 10:00 AM IST)",
        )

    today = get_today_ist()
    submitted_at = now_ist.isoformat()
    on_duty_count = sum(1 for t in body.telecallers if t.is_on_duty)

    # ── Upsert each telecaller's attendance ───────────────────────────────────
    try:
        for entry in body.telecallers:
            db.table("telecaller_attendance").upsert({
                "user_email": entry.email,
                "attendance_date": today,
                "is_present": entry.is_on_duty,
                "submitted_by": x_user_email,
                "submitted_at": submitted_at,
            }).execute()
    except Exception as e:
        logger.error(f"[DUTY] Failed to upsert attendance records: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save attendance records")

    # ── Insert into duty_sheet_log (UNIQUE on duty_date — race-safe) ──────────
    try:
        db.table("duty_sheet_log").insert({
            "duty_date": today,
            "submitted_by": x_user_email,
            "submitted_at": submitted_at,
            "on_duty_count": on_duty_count,
        }).execute()
    except Exception as e:
        err_msg = str(e).lower()
        # PostgreSQL unique violation
        if "unique" in err_msg or "duplicate" in err_msg or "23505" in err_msg:
            logger.warning(
                f"[DUTY] Race condition: duty_sheet_log already has a row for {today}. "
                f"Returning 409 to second submitter ({x_user_email})."
            )
            raise HTTPException(
                status_code=409,
                detail="Duty sheet was already submitted for today by another user",
            )
        logger.error(f"[DUTY] Failed to insert duty_sheet_log: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to record duty sheet submission")

    logger.info(
        f"[DUTY] ✅ Duty sheet submitted by {x_user_email} for {today}: "
        f"{on_duty_count}/{len(body.telecallers)} telecallers on duty"
    )

    # ── Admin notification if zero telecallers are on duty ───────────────────
    if on_duty_count == 0:
        try:
            db.table("notifications").insert({
                "user_email": x_user_email,
                "title": "⚠️ No Telecallers On Duty",
                "message": (
                    f"You submitted the duty sheet for {today} with zero telecallers on duty. "
                    "Auto-distribution will be skipped today."
                ),
                "notification_type": "warning",
                "entity_type": "calling_list",
                "is_read": False,
            }).execute()
        except Exception as ne:
            logger.warning(f"[DUTY] Could not send zero-telecaller notification: {ne}")

    return {
        "message": "Duty sheet submitted successfully",
        "date": today,
        "on_duty_count": on_duty_count,
        "total_telecallers": len(body.telecallers),
        "submitted_by": x_user_email,
    }


# ─── Legacy endpoints (kept for backward compat — not called by UI) ───────────

@router.get("/status")
def get_attendance_status(
    user_email: str = Header(..., alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    LEGACY: Telecaller self-attendance check.
    Kept for backward compat — no longer called by the frontend UI.
    """
    today_str = get_today_ist()
    try:
        res = db.table("telecaller_attendance") \
            .select("is_present") \
            .eq("user_email", user_email) \
            .eq("attendance_date", today_str) \
            .execute()
        records = res.data or []
        if records:
            return {"recorded": True, "is_present": records[0]["is_present"]}
        return {"recorded": False, "is_present": None}
    except Exception as e:
        logger.error(f"[ATTENDANCE-LEGACY] Error checking status for {user_email}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch attendance status")


@router.post("/mark")
def mark_attendance(
    body: AttendanceMark,
    user_email: str = Header(..., alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    LEGACY: Telecaller self-marks attendance.
    Kept for backward compat — no longer called by the frontend UI.
    """
    today_str = get_today_ist()
    try:
        data = {
            "user_email": user_email,
            "attendance_date": today_str,
            "is_present": body.is_present,
        }
        db.table("telecaller_attendance").upsert(data).execute()
        logger.info(f"[ATTENDANCE-LEGACY] Marked {user_email} as present={body.is_present} for {today_str}")
        return {"message": "Attendance recorded successfully", "is_present": body.is_present, "date": today_str}
    except Exception as e:
        logger.error(f"[ATTENDANCE-LEGACY] Error marking attendance for {user_email}: {e}")
        raise HTTPException(status_code=500, detail="Failed to mark attendance")
