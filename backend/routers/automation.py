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
        logger.info(f"[DIST] app_users total rows: {len(users)}")
        logger.info(f"[DIST] All roles in app_users: {[u.get('role') for u in users]}")
        telecaller_roles = {"telecaller", "staff", "telecaller1", "telecaller2"}
        telecallers = [
            u for u in users
            if u.get("role", "").lower().replace(" ", "_") in telecaller_roles
               or "telecaller" in u.get("role", "").lower()
        ]
        logger.info(f"[DIST] Found {len(telecallers)} telecallers: {[t['email'] for t in telecallers]}")
        return telecallers
    except Exception as e:
        logger.error(f"[DIST] Error fetching telecallers: {e}", exc_info=True)
        return []


def _check_already_distributed(db: SupabaseClient, target_date: str, valid_emails: list = None) -> bool:
    """
    Idempotency check: are there assignments for this date for VALID telecallers?
    If valid_emails is provided, only count assignments where user_email is in that list.
    Ghost assignments (for removed users) are ignored.
    """
    try:
        res = db.table("calling_assignments") \
            .select("assignment_id, user_email") \
            .eq("assigned_date", target_date) \
            .execute()
        all_rows = res.data or []
        if valid_emails:
            # Only count assignments for currently active telecallers
            valid_rows = [r for r in all_rows if r.get("user_email") in valid_emails]
            ghost_rows = [r for r in all_rows if r.get("user_email") not in valid_emails]
            found = len(valid_rows) > 0
            logger.info(
                f"[DIST] Idempotency check for {target_date}: total_rows={len(all_rows)}, "
                f"valid_rows={len(valid_rows)}, ghost_rows={len(ghost_rows)}, "
                f"valid_emails={valid_emails}, already_distributed={found}"
            )
            if ghost_rows:
                logger.warning(f"[DIST] ⚠️ Found {len(ghost_rows)} ghost assignments for unknown users: "
                               f"{list(set(r['user_email'] for r in ghost_rows))} — these will be cleared")
        else:
            found = len(all_rows) > 0
            logger.info(f"[DIST] Idempotency check for {target_date}: already_distributed={found} (rows={len(all_rows)})")
        return found
    except Exception as ex:
        logger.warning(f"[DIST] Idempotency check failed ({ex}), falling back to False")
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
        logger.info(f"[DIST] Pending counts per telecaller: {counts}")
    except Exception as e:
        logger.error(f"[DIST] Error fetching pending counts: {e}")
    return counts


def distribute_calls(db: SupabaseClient, admin_email: str = "system", force: bool = False) -> dict:
    """
    Load-aware, idempotent distribution of pending customers to telecallers.
    Queries the `customers` table — calling_assignments.customer_id = customers.customer_id.
    If force=True, clears any ghost/stale assignments for today before checking idempotency.
    """
    today_str = date.today().isoformat()
    logger.info(f"[DIST] ===== distribute_calls START (date={today_str}, triggered_by={admin_email}, force={force}) =====")

    # 1. Get telecallers FIRST so we can do smart idempotency check
    telecallers = _get_telecaller_emails(db)
    if not telecallers:
        logger.warning("[DIST] ❌ No active telecallers found — aborting distribution!")
        try:
            db.table("notifications").insert({
                "user_email": admin_email if admin_email not in ("system", "system_scheduler") else "system@internal",
                "title": "⚠️ No Telecallers Available",
                "message": "Auto-distribution failed: No active telecallers found in app_users.",
                "notification_type": "warning",
                "entity_type": "calling_list",
                "is_read": False,
            }).execute()
        except Exception as ne:
            logger.error(f"[DIST] Failed to send no-telecaller notification: {ne}")
        return {"message": "No active telecallers found", "status": "error", "total_calls": 0}

    valid_emails = [t["email"] for t in telecallers]
    logger.info(f"[DIST] Telecallers to distribute to: {valid_emails}")

    # 2. Clear ghost assignments (assignments for users no longer in telecaller list)
    try:
        ghost_res = db.table("calling_assignments") \
            .select("assignment_id, user_email") \
            .eq("assigned_date", today_str) \
            .eq("status", "Pending") \
            .execute()
        ghost_rows = [r for r in (ghost_res.data or []) if r.get("user_email") not in valid_emails]
        if ghost_rows:
            ghost_ids = [r["assignment_id"] for r in ghost_rows]
            logger.warning(f"[DIST] 🗑️ Deleting {len(ghost_rows)} ghost assignments for unknown users: "
                           f"{list(set(r['user_email'] for r in ghost_rows))}")
            for gid in ghost_ids:
                db.table("calling_assignments").eq("assignment_id", gid).delete().execute()
            logger.info(f"[DIST] Ghost cleanup complete — deleted {len(ghost_ids)} rows")
    except Exception as ge:
        logger.warning(f"[DIST] Ghost cleanup failed (non-fatal): {ge}")

    # 3. Smart idempotency check — only block if VALID telecallers already have assignments
    already = _check_already_distributed(db, today_str, valid_emails=valid_emails)
    if already and not force:
        logger.info(f"[DIST] Already distributed for {today_str} to valid telecallers — skipping. Use force=True to override.")
        return {"message": "Already distributed for today", "status": "skipped"}
    elif already and force:
        logger.info(f"[DIST] force=True — clearing existing valid assignments and re-distributing")
        try:
            existing_res = db.table("calling_assignments") \
                .select("assignment_id") \
                .eq("assigned_date", today_str) \
                .eq("status", "Pending") \
                .execute()
            for row in (existing_res.data or []):
                db.table("calling_assignments").eq("assignment_id", row["assignment_id"]).delete().execute()
            logger.info(f"[DIST] Force-cleared {len(existing_res.data or [])} existing pending assignments")
        except Exception as fe:
            logger.error(f"[DIST] Force-clear failed: {fe}")

    emails = valid_emails  # Already fetched above

    # 3. Get distributors to call (top 150, ordered by priority_score descending)
    # NOTE: calling_assignments.customer_id stores distributor_id here due to schema reuse.
    # See: Switch Call Distribution to Distributors Table (implementation doc)
    customers_to_call = []
    try:
        dist_res = db.table("distributors") \
            .select("distributor_id, mantri_name, mantri_mobile, village, priority_score, priority_label") \
            .order("priority_score", desc=True) \
            .limit(150) \
            .execute()
        raw_distributors = dist_res.data or []
        
        # Map distributor fields to customer fields to avoid breaking downstream logic
        for d in raw_distributors:
            customers_to_call.append({
                "customer_id": d.get("distributor_id"),
                "name": d.get("mantri_name"),
                "mobile": d.get("mantri_mobile"),
                "village": d.get("village"),
                "priority_score": d.get("priority_score"),
                "priority_label": d.get("priority_label")
            })
            
        logger.info(f"[DIST] Fetched {len(customers_to_call)} distributors (top 150 by priority_score)")
    except Exception as e:
        logger.error(f"[DIST] ❌ Failed to fetch distributors: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch distributors: {e}")
        
    if customers_to_call:
        logger.info(f"[DIST] Sample distributor IDs: {[c['customer_id'] for c in customers_to_call[:5]]}")

    if not customers_to_call:
        logger.warning("[DIST] ❌ No distributors found to distribute.")
        return {"message": "No distributors to distribute", "status": "empty", "total_calls": 0}

    # 4. Load-aware distribution: fewer pending → more new calls
    pending_counts = _get_pending_counts(db, emails)
    sorted_emails = sorted(emails, key=lambda e: pending_counts.get(e, 0))
    logger.info(f"[DIST] Sorted telecallers by load (least busy first): {sorted_emails}")

    # 4b. Fetch historical affinity from call logs
    affinity_map = {}
    try:
        history_res = db.table("call_logs").select("customer_id, user_email").execute()
        for row in (history_res.data or []):
            affinity_map[row["customer_id"]] = row["user_email"]
        logger.info(f"[DIST] Loaded {len(affinity_map)} affinity entries from call_logs")
    except Exception as e:
        logger.warning(f"[DIST] Could not load affinity map (non-fatal): {e}")

    # 5. Round-robin assignment
    assignments = []
    notifications_map = {}
    for i, cust in enumerate(customers_to_call):
        cust_id = cust["customer_id"]
        assigned_email = affinity_map.get(cust_id)
        if not assigned_email or assigned_email not in emails:
            assigned_email = sorted_emails[i % len(sorted_emails)]

        priority = cust.get("priority_label") or "Medium"
        reason = "Historical Affinity" if cust_id in affinity_map else "Auto-assigned"
        assignments.append({
            "user_email": assigned_email,
            "customer_id": cust_id,
            "priority": priority,
            "reason": reason,
            "assigned_date": today_str,
            "status": "Pending",
            "notes": "",
        })
        notifications_map[assigned_email] = notifications_map.get(assigned_email, 0) + 1

    logger.info(f"[DIST] Built {len(assignments)} assignments. Distribution: {notifications_map}")

    # 6. Bulk insert assignments
    if assignments:
        batch_size = 50
        batches_inserted = 0
        for i in range(0, len(assignments), batch_size):
            batch = assignments[i:i + batch_size]
            try:
                db.table("calling_assignments").insert(batch).execute()
                batches_inserted += 1
                logger.info(f"[DIST] Inserted batch {batches_inserted} ({len(batch)} rows)")
            except Exception as be:
                logger.error(f"[DIST] ❌ Batch insert failed (batch {batches_inserted+1}): {be}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"Batch insert failed: {be}")
        logger.info(f"[DIST] ✅ All {batches_inserted} batch(es) inserted successfully")

    # 7. Send notifications to telecallers
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
        try:
            db.table("notifications").insert(notification_records).execute()
            logger.info(f"[DIST] Sent {len(notification_records)} notifications")
        except Exception as ne:
            logger.warning(f"[DIST] Notification insert failed (non-fatal): {ne}")

    result = {
        "message": "Distribution successful",
        "status": "success",
        "total_calls": len(assignments),
        "telecaller_count": len(sorted_emails),
        "calls_per_person": math.ceil(len(assignments) / len(sorted_emails)) if sorted_emails else 0,
        "distribution": {email: count for email, count in notifications_map.items()},
    }
    logger.info(f"[DIST] ===== distribute_calls END: {result} =====")
    return result


# ─── Endpoints ────────────────────────────────────────────

@router.get("/debug-state")
def debug_state(db: SupabaseClient = Depends(get_db)):
    """
    Debug endpoint: returns current system state to diagnose distribution issues.
    Hit GET /api/automation/debug-state in browser to see full diagnostics.
    """
    import os
    today_str = date.today().isoformat()

    # 1. Scheduler env
    scheduler_enabled = os.environ.get("SCHEDULER_ENABLED", "").strip()

    # 2. Telecallers
    try:
        users_res = db.table("app_users").select("email, name, role").execute()
        all_users = users_res.data or []
        telecaller_roles = {"telecaller", "staff", "telecaller1", "telecaller2"}
        telecallers = [
            u for u in all_users
            if u.get("role", "").lower().replace(" ", "_") in telecaller_roles
               or "telecaller" in u.get("role", "").lower()
        ]
    except Exception as e:
        all_users = []
        telecallers = []
        logger.error(f"[DEBUG] app_users query failed: {e}")

    # 3. Customers count
    try:
        cust_res = db.table("distributors").select("distributor_id").limit(5).execute()
        cust_sample = [c["distributor_id"] for c in (cust_res.data or [])]
        cust_count_res = db.table("distributors").select("distributor_id").execute()
        cust_total = len(cust_count_res.data or [])
        
        scored_res = db.table("distributors").select("distributor_id").not_.is_("priority_score", "null").limit(1).execute()
        has_scored = len(scored_res.data or []) > 0
    except Exception as e:
        cust_sample = []
        cust_total = -1
        has_scored = False
        logger.error(f"[DEBUG] distributors query failed: {e}")

    # 4. Assignments for today
    try:
        today_res = db.table("calling_assignments") \
            .select("assignment_id, user_email, status") \
            .eq("assigned_date", today_str) \
            .execute()
        today_assignments = today_res.data or []
    except Exception as e:
        today_assignments = []
        logger.error(f"[DEBUG] calling_assignments query failed: {e}")

    # 5. All-time assignment count
    try:
        all_assign_res = db.table("calling_assignments").select("assignment_id").execute()
        total_assignments = len(all_assign_res.data or [])
    except Exception as e:
        total_assignments = -1

    return {
        "debug": True,
        "today": today_str,
        "scheduler_enabled_env": scheduler_enabled,
        "scheduler_will_run": scheduler_enabled == "1",
        "all_app_users": [{"email": u["email"], "role": u["role"]} for u in all_users],
        "telecallers_found": [{"email": t["email"], "role": t["role"]} for t in telecallers],
        "telecaller_count": len(telecallers),
        "customers_total": cust_total,
        "customers_sample_ids": cust_sample,
        "has_scored_distributors": has_scored,
        "assignments_for_today": len(today_assignments),
        "already_distributed_today": len(today_assignments) > 0,
        "total_assignments_ever": total_assignments,
        "today_summary": {
            email: {"pending": sum(1 for a in today_assignments if a["user_email"] == email and a["status"] == "Pending"),
                    "called": sum(1 for a in today_assignments if a["user_email"] == email and a["status"] != "Pending")}
            for email in set(a["user_email"] for a in today_assignments)
        },
        "diagnosis": {
            "scheduler_issue": scheduler_enabled != "1",
            "no_telecallers": len(telecallers) == 0,
            "no_customers": cust_total == 0,
            "already_distributed": len(today_assignments) > 0,
        }
    }


@router.get("/my-assignments", dependencies=[Depends(verify_permission("view_calling_list"))])
def get_my_assignments(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user_email: str = Header(..., alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Fetch paginated assignments for the logged-in telecaller."""
    logger.info(f"[MY-ASSIGN] Request: user={user_email}, status={status}, page={page}, limit={limit}")
    try:
        offset = (page - 1) * limit

        # Show ALL assignments for this user (no date filter — was the primary bug)
        query = db.table("calling_assignments") \
            .select("*") \
            .eq("user_email", user_email) \
            .order("assignment_id")

        if status:
            if status == "completed":
                query = query.neq("status", "Pending")
            else:
                query = query.eq("status", status)

        query = query.limit(limit).offset(offset)
        res = query.execute()
        assignments = res.data or []
        logger.info(f"[MY-ASSIGN] Raw assignments fetched: {len(assignments)} rows")

        # Total count
        count_query = db.table("calling_assignments") \
            .select("assignment_id") \
            .eq("user_email", user_email)
        if status:
            if status == "completed":
                count_query = count_query.neq("status", "Pending")
            else:
                count_query = count_query.eq("status", status)
        count_res = count_query.execute()
        total = len(count_res.data or [])
        logger.info(f"[MY-ASSIGN] Total count for pagination: {total}")

        # Enrich with customer details
        cust_ids = [a["customer_id"] for a in assignments if a.get("customer_id")]
        logger.info(f"[MY-ASSIGN] Enriching {len(cust_ids)} distributor IDs: {cust_ids[:10]}")
        # NOTE: customer_id col stores distributor_id here due to schema reuse.
        # See: Switch Call Distribution to Distributors Table (implementation doc)
        customers_map = {}
        if cust_ids:
            try:
                dist_res = db.table("distributors") \
                    .select("distributor_id, mantri_name, village, taluka, district, mantri_mobile, priority_score, priority_label") \
                    .in_("distributor_id", cust_ids) \
                    .execute()
                # Map fields to what the frontend expects
                for d in (dist_res.data or []):
                    customers_map[d["distributor_id"]] = {
                        "customer_id": d.get("distributor_id"),
                        "name": d.get("mantri_name"),
                        "mobile": d.get("mantri_mobile"),
                        "village": d.get("village"),
                        "taluka": d.get("taluka"),
                        "district": d.get("district"),
                        "priority_score": d.get("priority_score"),
                        "priority_label": d.get("priority_label")
                    }
            except Exception as e:
                logger.error(f"[MY-ASSIGN] ❌ Distributor enrichment failed: {e}", exc_info=True)
            
            logger.info(f"[MY-ASSIGN] Distributor lookup returned {len(customers_map)} matches out of {len(cust_ids)} IDs")
            if len(customers_map) < len(cust_ids):
                missing = set(cust_ids) - set(customers_map.keys())
                logger.warning(f"[MY-ASSIGN] ⚠️ Missing distributor enrichment for IDs: {missing}")

        enhanced = []
        for a in assignments:
            c = customers_map.get(a["customer_id"], {})
            enhanced.append({
                **a,
                "name": c.get("name", "Unknown"),
                "mobile": c.get("mobile", ""),
                "village": c.get("village", ""),
                "taluka": c.get("taluka", ""),
                "district": c.get("district", ""),
                "priority_score": c.get("priority_score", 0),
                "priority_label": c.get("priority_label", "LOW"),
            })

        # Summary counts
        all_res = db.table("calling_assignments") \
            .select("status") \
            .eq("user_email", user_email) \
            .execute()
        all_assignments = all_res.data or []
        pending = sum(1 for x in all_assignments if x["status"] == "Pending")
        called = sum(1 for x in all_assignments if x["status"] != "Pending")
        logger.info(f"[MY-ASSIGN] Summary — total={len(all_assignments)}, pending={pending}, called={called}")

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
        logger.error(f"[MY-ASSIGN] ❌ Unhandled exception: {e}", exc_info=True)
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
            }).execute()  # BUG FIX: was missing .execute()

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
    force: bool = Query(False, description="Set true to re-distribute even if already done today"),
    admin_email: str = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Admin: Trigger idempotent, load-aware call distribution. Use ?force=true to override idempotency."""
    try:
        result = distribute_calls(db, admin_email or "admin", force=force)
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
            .update({"user_email": body.new_user_email}).execute()  # BUG FIX: was missing .execute()

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
    target = now_ist.replace(hour=22, minute=5, second=0, microsecond=0)  # TEST: revert to hour=10, minute=0

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
                .delete() \
                .execute()  # BUG FIX: was missing .execute()

        # 3. Re-run distribution with force=True since we already cleared
        result = distribute_calls(db, admin_email or "admin", force=True)

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
                .update({"user_email": body.target_email}) \
                .execute()  # BUG FIX: was missing .execute()
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