"""
User Sessions Router
Tracks daily active time per user via periodic heartbeats.
Uses IST (Asia/Kolkata) to determine the current date.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from supabase_db import SupabaseClient, get_db

router = APIRouter()

# IST timezone offset (+05:30)
IST = timezone(timedelta(hours=5, minutes=30))


def _ist_today() -> str:
    """Return today's date string in IST, e.g. '2026-03-28'."""
    return datetime.now(IST).strftime("%Y-%m-%d")


class HeartbeatRequest(BaseModel):
    delta_seconds: int  # seconds elapsed since last heartbeat


@router.post("/heartbeat")
def session_heartbeat(
    body: HeartbeatRequest,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Upsert today's session row for the current user.
    Adds delta_seconds to the running total.
    """
    if not user_email:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Clamp delta to sane range (0–120 s) to prevent clock‑drift abuse
    delta = max(0, min(body.delta_seconds, 120))
    today = _ist_today()

    try:
        # Try to fetch existing row
        existing = (
            db.table("user_sessions")
            .select("id,total_seconds")
            .eq("user_email", user_email)
            .eq("session_date", today)
            .execute()
        )

        if existing.data and len(existing.data) > 0:
            # Update existing row
            row = existing.data[0]
            new_total = row["total_seconds"] + delta
            db.table("user_sessions").eq("id", row["id"]).update({
                "total_seconds": new_total,
                "last_heartbeat": datetime.now(IST).isoformat(),
            })
            return {"total_seconds": new_total, "date": today}
        else:
            # Insert new row
            result = db.table("user_sessions").insert({
                "user_email": user_email,
                "session_date": today,
                "total_seconds": delta,
                "last_heartbeat": datetime.now(IST).isoformat(),
            })
            return {"total_seconds": delta, "date": today}

    except Exception as e:
        # If table doesn't exist, return gracefully
        error_msg = str(e)
        if "user_sessions" in error_msg and ("404" in error_msg or "relation" in error_msg):
            return {"total_seconds": 0, "date": today, "error": "Table not created yet. Run SQL migration."}
        raise HTTPException(status_code=500, detail=f"Session heartbeat failed: {error_msg}")


@router.get("/today")
def get_today_session(
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Return today's accumulated seconds for the current user."""
    if not user_email:
        raise HTTPException(status_code=401, detail="Not authenticated")

    today = _ist_today()

    try:
        result = (
            db.table("user_sessions")
            .select("total_seconds,last_heartbeat")
            .eq("user_email", user_email)
            .eq("session_date", today)
            .execute()
        )

        if result.data and len(result.data) > 0:
            return {"total_seconds": result.data[0]["total_seconds"], "date": today}
        else:
            return {"total_seconds": 0, "date": today}

    except Exception as e:
        error_msg = str(e)
        if "user_sessions" in error_msg and ("404" in error_msg or "relation" in error_msg):
            return {"total_seconds": 0, "date": today, "error": "Table not created yet"}
        raise HTTPException(status_code=500, detail=f"Failed to get session: {error_msg}")


class AuthLogRequest(BaseModel):
    action: str  # "LOGIN" or "LOGOUT"


@router.post("/log-auth")
def log_auth_event(
    body: AuthLogRequest,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Log a LOGIN or LOGOUT event to the activity_logs table."""
    if not user_email:
        raise HTTPException(status_code=401, detail="Not authenticated")

    action = body.action.upper()
    if action not in ("LOGIN", "LOGOUT"):
        raise HTTPException(status_code=400, detail="action must be LOGIN or LOGOUT")

    try:
        from activity_logger import get_activity_logger
        logger = get_activity_logger(db)
        if action == "LOGIN":
            logger.log_login(user_email)
        else:
            logger.log_logout(user_email)
        return {"ok": True, "action": action}
    except Exception as e:
        # Don't block the user if logging fails
        print(f"[WARN] Failed to log auth event: {e}")
        return {"ok": False, "error": str(e)}
