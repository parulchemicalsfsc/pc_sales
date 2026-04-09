"""
Calling List / Automation Router — v3
Handles telecaller call assignments, call logging, admin distribution,
and load-aware auto-distribution with APScheduler.
"""

import os
import math
import logging
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException, Header, Body
from pydantic import BaseModel
from supabase_db import SupabaseClient, get_db
from rbac_utils import verify_permission
from activity_logger import get_activity_logger

router = APIRouter()
logger = logging.getLogger("automation")

# ─── Pydantic Models ─────────────────────────────────────

class CallStatusUpdate(BaseModel):
    assignment_id: int
    call_outcome: str  # 'connected', 'not_reachable', 'callback', 'wrong_number'
    notes: Optional[str] = None
    callback_date: Optional[str] = None

class ReassignRequest(BaseModel):
    assignment_id: int
    new_user_email: str

class BulkReassignRequest(BaseModel):
    target_email: str
    priority: str  # 'High', 'Medium', 'Low'
    count: int  # how many to assign

VALID_OUTCOMES = {'connected', 'not_reachable', 'callback', 'wrong_number'}

# ─── Distribution Logic ──────────────────────────────────

def _get_telecaller_emails(db: SupabaseClient) -> list:
    """Get telecaller users from app_users table."""
    try:
        res = db.table("app_users").select("email, name, role").execute()
        users = res.data or []
        telecaller_roles = {"telecaller", "staff", "telecaller1", "telecaller2"}
        telecallers = [
            u for u in users
            if u.get("role", "").lower().replace(" ", "_") in telecaller_roles
               or "telecaller" in u.get("role", "").lower()
        ]
        logger.info(f"Found {len(telecallers)} telecallers out of {len(users)} users")
        return telecallers
    except Exception as e:
        logger.error(f"Error fetching telecallers: {e}")
        return []


def _check_already_distributed(db: SupabaseClient, target_date: str) -> bool:
    """Idempotency check: are there assignments for this date already?"""
    try:
        res = db.table("calling_assignments") \
            .select("assignment_id", count="exact") \
            .eq("assigned_date", target_date) \
            .limit(1) \
            .execute()
        return (res.count or 0) > 0 or len(res.data or []) > 0
    except Exception:
        # Fallback: just check if we get any data
        try:
            res = db.table("calling_assignments") \
                .select("assignment_id") \
                .eq("assigned_date", target_date) \
                .limit(1) \
                .execute()
            return len(res.data or []) > 0
        except:
            return False


def _get_pending_counts(db: SupabaseClient, emails: list) -> dict:
    """Get current pending assignment counts per telecaller (load-aware)."""
    counts = {e: 0 for e in emails}
    try:
        res = db.table("calling_assignments") \
            .select("user_email") \
            .eq("status", "Pending") \
            .in_("user_email", emails) \
            .execute()
        for row in res.data or []:
            email = row.get("user_email")
            if email in counts:
                counts[email] += 1
    except Exception as e:
        logger.error(f"Error fetching pending counts: {e}")
    return counts


def distribute_calls(db: SupabaseClient, admin_email: str = "system") -> dict:
    """
    Load-aware, idempotent distribution of pending customers to telecallers.
    Uses calling_assignments from algorithm or master list.
    """
    today_str = date.today().isoformat()

    # 1. Idempotency check
    if _check_already_distributed(db, today_str):
        return {"message": "Already distributed for today", "status": "skipped"}

    # 2. Get telecallers
    telecallers = _get_telecaller_emails(db)
    if not telecallers:
        logger.warning("No active telecallers found for distribution!")
        # Alert admin
        try:
            db.table("notifications").insert({
                "user_email": admin_email if admin_email != "system" else "system@internal",
                "title": "⚠️ No Telecallers Available",
                "message": "Auto-distribution failed: No active telecallers found. Please add telecallers to app_users.",
                "notification_type": "warning",
                "entity_type": "calling_list",
                "is_read": False,
            }).execute()
        except Exception:
            pass
        return {"message": "No active telecallers found", "status": "error", "total_calls": 0}

    emails = [t["email"] for t in telecallers]

    # 3. Get distributors to call (top 150 by priority score)
    try:
        dist_res = db.table("distributors") \
            .select("*") \
            .eq("status", "Active") \
            .order("priority_score", desc=True) \
            .limit(150) \
            .execute()
        customers = dist_res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch distributors: {e}")

    if not customers:
        return {"message": "No distributors to distribute", "status": "empty", "total_calls": 0}

    # 4. Load-aware distribution: fewer pending → more new calls
    pending_counts = _get_pending_counts(db, emails)
    # Sort by pending count ascending (least busy first)
    sorted_emails = sorted(emails, key=lambda e: pending_counts.get(e, 0))

    # 3b. Fetch historical affinity from call logs
    affinity_map = {}
    try:
        history_res = db.table("call_logs").select("customer_id, user_email").execute()
        for row in (history_res.data or []):
            affinity_map[row["customer_id"]] = row["user_email"]
    except Exception as e:
        logger.warning(f"Could not load affinity map: {e}")

    # Round-robin with load-aware ordering and affinity check
    assignments = []
    notifications_map = {}
    for i, cust in enumerate(customers):
        dist_id = cust["distributor_id"]
        assigned_email = affinity_map.get(dist_id)
        # Fallback to round-robin if no active affinity
        if not assigned_email or assigned_email not in emails:
            assigned_email = sorted_emails[i % len(sorted_emails)]

        assignments.append({
            "user_email": assigned_email,
            "customer_id": dist_id,
            "priority": cust.get("priority_label", "Medium"),
            "reason": "Auto-assigned" if dist_id not in affinity_map else "Historical Affinity",
            "assigned_date": today_str,
            "status": "Pending",
            "notes": "",
        })
        notifications_map[assigned_email] = notifications_map.get(assigned_email, 0) + 1

    # 5. Bulk insert assignments
    if assignments:
        # Insert in batches to avoid oversized requests
        batch_size = 50
        for i in range(0, len(assignments), batch_size):
            batch = assignments[i:i + batch_size]
            db.table("calling_assignments").insert(batch).execute()

    # 6. Send notifications to telecallers
    notification_records = []
    for email, count in notifications_map.items():
        notification_records.append({
            "user_email": email,
            "title": "📞 New Calls Assigned",
            "message": f"You have {count} new calls assigned for today.",
            "notification_type": "info",
            "entity_type": "calling_list",
            "is_read": False,
        })
    if notification_records:
        db.table("notifications").insert(notification_records).execute()

    return {
        "message": "Distribution successful",
        "status": "success",
        "total_calls": len(assignments),
        "telecaller_count": len(sorted_emails),
        "calls_per_person": math.ceil(len(assignments) / len(sorted_emails)),
        "distribution": {email: count for email, count in notifications_map.items()},
    }


# ─── Endpoints ────────────────────────────────────────────

@router.get("/my-assignments", dependencies=[Depends(verify_permission("view_calling_list"))])
def get_my_assignments(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user_email: str = Header(..., alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Fetch paginated assignments for the logged-in telecaller."""
    try:
        today_str = date.today().isoformat()
        offset = (page - 1) * limit

        # Build query
        query = db.table("calling_assignments") \
            .select("*") \
            .eq("user_email", user_email) \
            .eq("assigned_date", today_str) \
            .order("assignment_id")

        if status:
            if status == "completed":
                query = query.neq("status", "Pending")
            else:
                query = query.eq("status", status)

        query = query.limit(limit).offset(offset)
        res = query.execute()
        assignments = res.data or []

        # Get total count for pagination
        count_query = db.table("calling_assignments") \
            .select("assignment_id") \
            .eq("user_email", user_email) \
            .eq("assigned_date", today_str)
        if status:
            if status == "completed":
                count_query = count_query.neq("status", "Pending")
            else:
                count_query = count_query.eq("status", status)
        count_res = count_query.execute()
        total = len(count_res.data or [])

        # Enrich with distributor details
        dist_ids = [a["customer_id"] for a in assignments if a.get("customer_id")]
        distributors_map = {}
        if dist_ids:
            dist_res = db.table("distributors") \
                .select("distributor_id, name, village, taluka, district, mantri_mobile, priority_score, priority_label") \
                .in_("distributor_id", dist_ids) \
                .execute()
            distributors_map = {d["distributor_id"]: d for d in (dist_res.data or [])}

        enhanced = []
        for a in assignments:
            d = distributors_map.get(a["customer_id"], {})
            enhanced.append({
                **a,
                "name": d.get("name", "Unknown"),
                "mobile": d.get("mantri_mobile", ""),
                "village": d.get("village", ""),
                "taluka": d.get("taluka", ""),
                "district": d.get("district", ""),
                "priority_score": d.get("priority_score", 0),
                "priority_label": d.get("priority_label", "LOW"),
            })

        # Summary counts (all statuses for today)
        all_res = db.table("calling_assignments") \
            .select("status") \
            .eq("user_email", user_email) \
            .eq("assigned_date", today_str) \
            .execute()
        all_assignments = all_res.data or []
        pending = sum(1 for x in all_assignments if x["status"] == "Pending")
        called = sum(1 for x in all_assignments if x["status"] != "Pending")

        return {
            "assignments": enhanced,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": math.ceil(total / limit) if total > 0 else 1,
            },
            "summary": {
                "total": len(all_assignments),
                "pending": pending,
                "called": called,
            },
        }

    except Exception as e:
        logger.error(f"Error getting assignments: {e}")
        return {"assignments": [], "error": str(e), "pagination": {"page": 1, "limit": 20, "total": 0, "total_pages": 1}, "summary": {"total": 0, "pending": 0, "called": 0}}


@router.post("/update-call-status")
def update_call_status(
    body: CallStatusUpdate,
    user_email: str = Header(..., alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Telecaller logs a call outcome + notes."""
    if body.call_outcome not in VALID_OUTCOMES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid outcome. Must be one of: {', '.join(VALID_OUTCOMES)}"
        )

    try:
        # 1. Verify assignment belongs to this user and is Pending
        res = db.table("calling_assignments") \
            .select("*") \
            .eq("assignment_id", body.assignment_id) \
            .eq("user_email", user_email) \
            .execute()

        if not res.data:
            raise HTTPException(status_code=404, detail="Assignment not found or not yours")

        assignment = res.data[0]
        if assignment["status"] != "Pending":
            raise HTTPException(status_code=400, detail="This call has already been logged")

        # 2. Map outcome to status
        status_map = {
            "connected": "Called",
            "not_reachable": "Not Reachable",
            "callback": "Callback",
            "wrong_number": "Wrong Number",
        }
        new_status = status_map.get(body.call_outcome, "Called")

        # 3. Update assignment status + notes
        db.table("calling_assignments") \
            .eq("assignment_id", body.assignment_id) \
            .update({
                "status": new_status,
                "notes": body.notes or "",
            })

        # 4. Insert call log
        db.table("call_logs").insert({
            "assignment_id": body.assignment_id,
            "user_email": user_email,
            "customer_id": assignment["customer_id"],
            "call_outcome": body.call_outcome,
            "notes": body.notes or "",
        }).execute()

        # 5. If callback is selected with a date, schedule new assignment
        if body.call_outcome == "callback" and body.callback_date:
            db.table("calling_assignments").insert({
                "user_email": user_email,  # Affinity: stay with same telecaller
                "customer_id": assignment["customer_id"],
                "priority": assignment.get("priority", "Medium"),
                "reason": "Scheduled Callback",
                "assigned_date": body.callback_date,
                "status": "Pending",
                "notes": body.notes or "",
            }).execute()

        # 5b. Score adjustments based on call outcome
        customer_id = assignment["customer_id"]
        try:
            if body.call_outcome == "connected" and body.notes and "order" in (body.notes or "").lower():
                # Connected + order mentioned → decrease score by 15 (min 0)
                cust_res = db.table("customers").select("priority_score").eq("customer_id", customer_id).execute()
                if cust_res.data:
                    current_score = cust_res.data[0].get("priority_score", 0) or 0
                    new_score = max(0, current_score - 15)
                    from scoring_engine import priority_label as calc_label
                    db.table("customers").eq("customer_id", customer_id).update({
                        "priority_score": new_score,
                        "priority_label": calc_label(new_score),
                    })

            elif body.call_outcome == "not_reachable":
                # Not reachable → decrease score by 3 (min 0)
                cust_res = db.table("customers").select("priority_score").eq("customer_id", customer_id).execute()
                if cust_res.data:
                    current_score = cust_res.data[0].get("priority_score", 0) or 0
                    new_score = max(0, current_score - 3)
                    from scoring_engine import priority_label as calc_label
                    update_data = {
                        "priority_score": new_score,
                        "priority_label": calc_label(new_score),
                    }
                    # Check if 3+ not_reachable this week → force LOW
                    from datetime import timedelta
                    week_ago = (date.today() - timedelta(days=7)).isoformat()
                    nr_res = db.table("call_logs") \
                        .select("log_id") \
                        .eq("customer_id", customer_id) \
                        .eq("call_outcome", "not_reachable") \
                        .gte("created_at", week_ago) \
                        .execute()
                    nr_count = len(nr_res.data or [])
                    if nr_count >= 3:
                        update_data["priority_label"] = "LOW"
                        logger.info(f"Customer {customer_id} has {nr_count} not_reachable this week → forced LOW")

                    db.table("customers").eq("customer_id", customer_id).update(update_data)

            elif body.call_outcome == "callback":
                # Callback → freeze score so nightly job skips this customer
                db.table("customers").eq("customer_id", customer_id).update({
                    "score_frozen": True,
                })

            # 'connected' without order → no score change (intentional)

        except Exception as e:
            logger.error(f"Score adjustment failed for customer {customer_id}: {e}")

        # 6. Log the activity for the floating toast
        try:
            logger_service = get_activity_logger(db)
            customer_name_str = "Customer"
            try:
                c_res = db.table("customers").select("name").eq("customer_id", assignment["customer_id"]).execute()
                if c_res.data:
                    customer_name_str = c_res.data[0].get("name", "Customer")
            except:
                pass
            
            logger_service.log_activity(
                user_email=user_email,
                action_type="CALL",
                action_description=f"Logged call ({new_status}) for {customer_name_str}",
                entity_type="customer",
                entity_id=assignment["customer_id"],
                entity_name=customer_name_str,
            )
        except Exception as e:
            logger.error(f"Failed to log activity: {e}")

        return {"message": "Call status updated", "status": new_status}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating call status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update call status: {e}")


@router.get("/telecallers")
def get_telecallers(
    db: SupabaseClient = Depends(get_db),
):
    """List all active telecaller users."""
    try:
        telecallers = _get_telecaller_emails(db)
        return {"telecallers": telecallers}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/assignments")
def get_admin_assignments(
    target_date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    db: SupabaseClient = Depends(get_db),
):
    """Admin: view all assignments for a date, grouped summary."""
    try:
        d = target_date or date.today().isoformat()
        offset = (page - 1) * limit

        res = db.table("calling_assignments") \
            .select("*") \
            .eq("assigned_date", d) \
            .order("assignment_id") \
            .limit(limit) \
            .offset(offset) \
            .execute()

        assignments = res.data or []

        # Enrich with customer details
        cust_ids = list(set(a["customer_id"] for a in assignments if a.get("customer_id")))
        customers_map = {}
        if cust_ids:
            cust_res = db.table("customers") \
                .select("customer_id, name, mobile, village") \
                .in_("customer_id", cust_ids) \
                .execute()
            customers_map = {c["customer_id"]: c for c in (cust_res.data or [])}

        enhanced = []
        for a in assignments:
            c = customers_map.get(a["customer_id"], {})
            enhanced.append({
                **a,
                "name": c.get("name", "Unknown"),
                "mobile": c.get("mobile", ""),
                "village": c.get("village", ""),
            })

        # Count total for date
        count_res = db.table("calling_assignments") \
            .select("assignment_id") \
            .eq("assigned_date", d) \
            .execute()
        total = len(count_res.data or [])

        # Per-telecaller summary
        all_res = db.table("calling_assignments") \
            .select("user_email, status") \
            .eq("assigned_date", d) \
            .execute()
        telecaller_summary = {}
        for row in (all_res.data or []):
            email = row["user_email"]
            if email not in telecaller_summary:
                telecaller_summary[email] = {"total": 0, "pending": 0, "called": 0}
            telecaller_summary[email]["total"] += 1
            if row["status"] == "Pending":
                telecaller_summary[email]["pending"] += 1
            else:
                telecaller_summary[email]["called"] += 1

        return {
            "assignments": enhanced,
            "telecaller_summary": telecaller_summary,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": math.ceil(total / limit) if total > 0 else 1,
            },
            "date": d,
            "already_distributed": total > 0,
        }

    except Exception as e:
        logger.error(f"Error getting admin assignments: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/distribute")
def admin_distribute(
    admin_email: str = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Admin: Trigger idempotent, load-aware call distribution."""
    try:
        result = distribute_calls(db, admin_email or "admin")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Distribution failed: {e}")


@router.post("/admin/reassign")
def admin_reassign(
    body: ReassignRequest,
    db: SupabaseClient = Depends(get_db),
):
    """Admin: Reassign a call to a different telecaller. Only if status is Pending."""
    try:
        # 1. Verify assignment exists and is Pending
        res = db.table("calling_assignments") \
            .select("*") \
            .eq("assignment_id", body.assignment_id) \
            .execute()

        if not res.data:
            raise HTTPException(status_code=404, detail="Assignment not found")

        assignment = res.data[0]
        if assignment["status"] != "Pending":
            raise HTTPException(
                status_code=400,
                detail=f"Cannot reassign: call status is '{assignment['status']}', must be 'Pending'"
            )

        old_email = assignment["user_email"]

        # 2. Update assignment
        db.table("calling_assignments") \
            .eq("assignment_id", body.assignment_id) \
            .update({"user_email": body.new_user_email})

        # 3. Notify new telecaller
        db.table("notifications").insert({
            "user_email": body.new_user_email,
            "title": "📞 Call Reassigned to You",
            "message": f"A call has been reassigned to you (was: {old_email}).",
            "notification_type": "info",
            "entity_type": "calling_list",
            "is_read": False,
        }).execute()

        return {"message": "Reassigned successfully", "old_user": old_email, "new_user": body.new_user_email}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reassign failed: {e}")


@router.get("/distribution-status")
def get_distribution_status(
    db: SupabaseClient = Depends(get_db),
):
    """Check if today's distribution has happened and return timer info."""
    today_str = date.today().isoformat()
    distributed = _check_already_distributed(db, today_str)

    # Calculate time until 10 AM IST
    import pytz
    ist = pytz.timezone("Asia/Kolkata")
    now_ist = datetime.now(ist)
    target = now_ist.replace(hour=10, minute=0, second=0, microsecond=0)

    if now_ist >= target:
        minutes_remaining = 0
        past_deadline = True
    else:
        diff = target - now_ist
        minutes_remaining = int(diff.total_seconds() / 60)
        past_deadline = False

    return {
        "distributed": distributed,
        "date": today_str,
        "past_deadline": past_deadline,
        "minutes_until_deadline": minutes_remaining,
    }


@router.post("/admin/refresh-distribution")
def admin_refresh_distribution(
    admin_email: str = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Admin: Refresh distribution — re-distribute all uncalled (Pending) assignments
    from today using the same load-aware logic. Effectively a manual midnight reset.
    """
    try:
        today_str = date.today().isoformat()

        # 1. Get all pending assignments for today
        pending_res = db.table("calling_assignments") \
            .select("assignment_id") \
            .eq("assigned_date", today_str) \
            .eq("status", "Pending") \
            .execute()
        pending = pending_res.data or []

        if not pending:
            return {"message": "No pending assignments to refresh", "status": "empty", "refreshed": 0}

        # 2. Delete all pending assignments (keep completed ones)
        for p in pending:
            db.table("calling_assignments") \
                .eq("assignment_id", p["assignment_id"]) \
                .delete()

        # 3. Re-run distribution (this creates fresh assignments)
        # First remove today's marker so distribution runs
        result = distribute_calls(db, admin_email or "admin")

        return {
            "message": f"Refreshed: removed {len(pending)} pending, re-distributed",
            "status": "success",
            "removed": len(pending),
            "distribution": result,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Refresh failed: {e}")


@router.post("/admin/bulk-reassign")
def admin_bulk_reassign(
    body: BulkReassignRequest,
    db: SupabaseClient = Depends(get_db),
):
    """
    Admin: Reassign N pending calls of a given priority to a specific telecaller.
    Picks from other telecallers' pending assignments.
    """
    if body.count < 1:
        raise HTTPException(status_code=400, detail="Count must be at least 1")

    try:
        today_str = date.today().isoformat()

        # Get pending assignments of this priority NOT already assigned to target
        res = db.table("calling_assignments") \
            .select("assignment_id, user_email") \
            .eq("assigned_date", today_str) \
            .eq("status", "Pending") \
            .eq("priority", body.priority) \
            .neq("user_email", body.target_email) \
            .limit(body.count) \
            .execute()

        candidates = res.data or []
        if not candidates:
            raise HTTPException(
                status_code=404,
                detail=f"No pending {body.priority} calls available to reassign"
            )

        reassigned = 0
        for a in candidates:
            db.table("calling_assignments") \
                .eq("assignment_id", a["assignment_id"]) \
                .update({"user_email": body.target_email})
            reassigned += 1

        # Notify the telecaller
        db.table("notifications").insert({
            "user_email": body.target_email,
            "title": "📞 Bulk Calls Assigned",
            "message": f"{reassigned} {body.priority} priority calls have been assigned to you by admin.",
            "notification_type": "info",
            "entity_type": "calling_list",
            "is_read": False,
        }).execute()

        return {
            "message": f"Reassigned {reassigned} {body.priority} calls to {body.target_email}",
            "reassigned": reassigned,
            "requested": body.count,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk reassign failed: {e}")