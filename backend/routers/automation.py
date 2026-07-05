"""
Calling List / Automation Router — v3
Handles telecaller call assignments, call logging, admin distribution,
and load-aware auto-distribution with APScheduler.
"""

import os
import math
import logging
from datetime import datetime, date
import pytz
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException, Header, Body
from pydantic import BaseModel
from supabase_db import SupabaseClient, get_db
from rbac_utils import verify_permission
from activity_logger import get_activity_logger

router = APIRouter()
logger = logging.getLogger("automation")

def get_today_ist() -> str:
    """Returns today's date in YYYY-MM-DD format using IST timezone."""
    ist = pytz.timezone('Asia/Kolkata')
    return datetime.now(ist).date().isoformat()

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

class TransferPendingRequest(BaseModel):
    from_user_email: str
    to_user_email: str

class AdhocCallRequest(BaseModel):
    entity_id: int          # customer_id or distributor_id
    entity_type: str        # 'customer' or 'distributor'
    call_outcome: str       # connected, not_reachable, callback, wrong_number
    notes: Optional[str] = None
    callback_date: Optional[str] = None

VALID_OUTCOMES = {'connected', 'not_reachable', 'callback', 'wrong_number'}

# ─── Distribution Logic ──────────────────────────────────

def _get_present_sales_managers(db: SupabaseClient) -> list:
    """Get sales manager users from app_users table, filtered by today's attendance."""
    try:
        res = db.table("app_users").select("email, name, role").execute()
        users = res.data or []
        
        all_sales_managers = [
            u for u in users
            if u.get("role", "").lower() == "sales_manager"
        ]
        
        # Filter by today's attendance (IST)
        today_str = get_today_ist()
        att_res = db.table("telecaller_attendance") \
            .select("user_email, is_present") \
            .eq("attendance_date", today_str) \
            .eq("is_present", True) \
            .execute()
            
        present_emails = {row["user_email"] for row in (att_res.data or [])}
        
        sales_managers = [t for t in all_sales_managers if t["email"] in present_emails]
        
        if not sales_managers:
            sales_managers = all_sales_managers
            
        return sales_managers
    except Exception as e:
        logger.error(f"[DIST] Error fetching sales managers: {e}", exc_info=True)
        return []

def _get_telecaller_emails(db: SupabaseClient) -> list:
    """Get telecaller users from app_users table, filtered by today's attendance."""
    try:
        res = db.table("app_users").select("email, name, role").execute()
        users = res.data or []
        
        telecaller_roles = {"telecaller", "staff", "telecaller1", "telecaller2"}
        all_telecallers = [
            u for u in users
            if u.get("role", "").lower().replace(" ", "_") in telecaller_roles
               or "telecaller" in u.get("role", "").lower()
        ]
        
        # Filter by today's attendance (IST)
        today_str = get_today_ist()
        att_res = db.table("telecaller_attendance") \
            .select("user_email, is_present") \
            .eq("attendance_date", today_str) \
            .eq("is_present", True) \
            .execute()
            
        present_emails = {row["user_email"] for row in (att_res.data or [])}
        
        telecallers = [t for t in all_telecallers if t["email"] in present_emails]
        
        if not telecallers:
            telecallers = all_telecallers
            
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
    today_str = get_today_ist()
    logger.info(f"[DIST] ===== distribute_calls START (date={today_str}, triggered_by={admin_email}, force={force}) =====")

    # 1. Get sales managers FIRST so we can do smart idempotency check
    telecallers = _get_present_sales_managers(db)
    if not telecallers:
        logger.warning("[DIST] ❌ No active telecallers found (or none marked present) — aborting distribution!")
        try:
            db.table("notifications").insert({
                "user_email": admin_email if admin_email not in ("system", "system_scheduler") else "system@internal",
                "title": "⚠️ No Telecallers Present",
                "message": "Auto-distribution failed: Zero telecallers are marked as present today.",
                "notification_type": "warning",
                "entity_type": "calling_list",
                "is_read": False,
            }).execute()
        except Exception as ne:
            logger.error(f"[DIST] Failed to send no-telecaller notification: {ne}")
        return {"message": "No telecallers marked present", "status": "error", "total_calls": 0}

    valid_emails = [t["email"] for t in telecallers]
    logger.info(f"[DIST] Telecallers to distribute to: {valid_emails}")

    # 2. Clear ghost assignments (assignments for users no longer in telecaller list)
    # (Removed old pending cleanup per user request - pending assignments now roll over)
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
        logger.warning(f"[DIST] Cleanup tasks failed (non-fatal): {ge}")

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
        # Raise a plain RuntimeError (not HTTPException) so this is safe to call
        # from both the scheduler background job AND HTTP endpoints.
        raise RuntimeError(f"Failed to fetch distributors: {e}") from e
        
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

    # 5. Skip distributors who already have a Pending assignment
    existing_pending = set()
    try:
        ep_res = db.table("calling_assignments") \
            .select("customer_id") \
            .eq("status", "Pending") \
            .in_("customer_id", [c["customer_id"] for c in customers_to_call]) \
            .execute()
        for r in (ep_res.data or []):
            existing_pending.add(r["customer_id"])
    except Exception as e:
        logger.warning(f"[DIST] Could not load existing pending assignments (non-fatal): {e}")

    # 6. Round-robin assignment
    assignments = []
    notifications_map = {}
    for i, cust in enumerate(customers_to_call):
        cust_id = cust["customer_id"]
        if cust_id in existing_pending:
            continue
            
        assigned_email = affinity_map.get(cust_id)
        if not assigned_email or assigned_email not in emails:
            assigned_email = sorted_emails[i % len(sorted_emails)]

        priority = cust.get("priority_label") or "Medium"
        reason = "Historical Affinity" if cust_id in affinity_map else "Auto-assigned"
        assignments.append({
            "user_email": assigned_email,
            "customer_id": cust_id,
            "entity_type": "distributor",
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
                raise RuntimeError(f"Batch insert failed: {be}") from be
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
    today_str = get_today_ist()

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
        
        scored_res = db.table("distributors").select("distributor_id").gte("priority_score", 0).limit(1).execute()
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
    target_email: Optional[str] = Query(None, description="Admin only: view assignments for specific user"),
    user_email: str = Header(..., alias="x-user-email"),
    user_role: str = Header(None, alias="x-user-role"),
    db: SupabaseClient = Depends(get_db),
):
    """Fetch paginated assignments for the logged-in user or admin."""
    logger.info(f"[MY-ASSIGN] Request: user={user_email}, role={user_role}, target={target_email}, status={status}, page={page}, limit={limit}")
    try:
        offset = (page - 1) * limit
        role = (user_role or "").lower()

        # Determine filtering
        query = db.table("calling_assignments").select("*")
        count_query = db.table("calling_assignments").select("assignment_id", count="exact")

        if role == "admin":
            if target_email:
                query = query.eq("user_email", target_email)
                count_query = count_query.eq("user_email", target_email)
            else:
                query = query.eq("user_email", user_email)
                count_query = count_query.eq("user_email", user_email)
        else:
            query = query.eq("user_email", user_email)
            count_query = count_query.eq("user_email", user_email)

        query = query.order("assignment_id")

        if status:
            if status == "completed":
                query = query.neq("status", "Pending")
                count_query = count_query.neq("status", "Pending")
            else:
                query = query.eq("status", status)
                count_query = count_query.eq("status", status)

        query = query.limit(limit).offset(offset)
        res = query.execute()
        assignments = res.data or []
        logger.info(f"[MY-ASSIGN] Raw assignments fetched: {len(assignments)} rows")

        # Total count
        count_res = count_query.execute()
        total = count_res.count if hasattr(count_res, "count") and count_res.count is not None else len(count_res.data or [])
        logger.info(f"[MY-ASSIGN] Total count for pagination: {total}")

        # Enrich with details based on entity_type
        # We need to separate them by entity_type to fetch from correct tables
        distributor_ids = [a["customer_id"] for a in assignments if a.get("entity_type") == "distributor" and a.get("customer_id")]
        customer_ids = [a["customer_id"] for a in assignments if a.get("entity_type") == "customer" and a.get("customer_id")]
        
        # Fallback for old records without entity_type: assume distributor if role is sales_manager, else customer
        for a in assignments:
            if not a.get("entity_type") and a.get("customer_id"):
                if role == "sales_manager":
                    distributor_ids.append(a["customer_id"])
                    a["entity_type"] = "distributor"
                else:
                    customer_ids.append(a["customer_id"])
                    a["entity_type"] = "customer"

        logger.info(f"[MY-ASSIGN] Enriching {len(distributor_ids)} distributor IDs, {len(customer_ids)} customer IDs")
        
        customers_map = {}
        if distributor_ids:
            try:
                dist_res = db.table("distributors") \
                    .select("distributor_id, mantri_name, village, taluka, district, mantri_mobile, priority_score, priority_label") \
                    .in_("distributor_id", distributor_ids) \
                    .execute()
                for d in (dist_res.data or []):
                    customers_map[("distributor", d["distributor_id"])] = {
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
                
        if customer_ids:
            try:
                cust_res = db.table("customers") \
                    .select("customer_id, name, village, taluka, district, mobile") \
                    .in_("customer_id", customer_ids) \
                    .execute()
                for c in (cust_res.data or []):
                    customers_map[("customer", c["customer_id"])] = {
                        "name": c.get("name"),
                        "mobile": c.get("mobile"),
                        "village": c.get("village"),
                        "taluka": c.get("taluka"),
                        "district": c.get("district"),
                        "priority_score": 0,
                        "priority_label": "None"
                    }
            except Exception as e:
                logger.error(f"[MY-ASSIGN] ❌ Customer enrichment failed: {e}", exc_info=True)

        # Fetch last call details
        last_calls_map = {}
        all_ids = distributor_ids + customer_ids
        if all_ids:
            try:
                logs_res = db.table("call_logs") \
                    .select("customer_id, call_outcome, notes, called_at, user_email") \
                    .in_("customer_id", all_ids) \
                    .order("called_at", desc=True) \
                    .execute()
                for log in (logs_res.data or []):
                    # Map called_at to created_at for frontend compatibility
                    log["created_at"] = log.pop("called_at", None)
                    cid = log["customer_id"]
                    if cid not in last_calls_map:
                        last_calls_map[cid] = log
            except Exception as e:
                logger.error(f"[MY-ASSIGN] ❌ Last call log enrichment failed: {e}", exc_info=True)

        enhanced = []
        for a in assignments:
            key = (a.get("entity_type", "customer"), a.get("customer_id"))
            c = customers_map.get(key, {})
            last_call = last_calls_map.get(a.get("customer_id"))
            enhanced.append({
                **a,
                "name": c.get("name", "Unknown"),
                "mobile": c.get("mobile", ""),
                "village": c.get("village", ""),
                "taluka": c.get("taluka", ""),
                "district": c.get("district", ""),
                "priority_score": c.get("priority_score", 0),
                "priority_label": c.get("priority_label", "LOW"),
                "last_call": last_call,
            })

        # Summary counts
        all_query = db.table("calling_assignments").select("status")
        if role == "admin":
            if target_email:
                all_query = all_query.eq("user_email", target_email)
            else:
                all_query = all_query.eq("user_email", user_email)
        elif role == "sales_manager":
            all_query = all_query.eq("user_email", user_email).eq("entity_type", "distributor")
        else:
            all_query = all_query.eq("user_email", user_email).eq("entity_type", "customer")
            
        all_res = all_query.execute()
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


# In-memory dictionary to store call timers without needing SQL migrations right away.
# Key: f"{user_email}_{assignment_id}", Value: start_time (datetime)
_CALL_TIMERS = {}

class StartCallTimerRequest(BaseModel):
    assignment_id: int

@router.post("/start-call-timer")
def start_call_timer(
    body: StartCallTimerRequest,
    user_email: str = Header(..., alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Telecaller clicked Call, start the timer."""
    try:
        now_utc = datetime.now(pytz.utc)
        
        # Store in memory
        _CALL_TIMERS[f"{user_email}_{body.assignment_id}"] = now_utc

        # Try to save to DB (will fail if migration not run, but we ignore the error)
        try:
            db.table("calling_assignments") \
                .eq("assignment_id", body.assignment_id) \
                .eq("user_email", user_email) \
                .update({"call_started_at": now_utc.isoformat()}).execute()
        except Exception:
            pass

        return {"message": "Timer started"}
    except Exception as e:
        logger.error(f"Error starting call timer: {e}")
        raise HTTPException(status_code=500, detail="Failed to start call timer")


@router.post("/log-adhoc-call")
def log_adhoc_call(
    body: AdhocCallRequest,
    user_email: str = Header(..., alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Log a call outcome for any customer/distributor without needing a pre-existing assignment.
    - If a Pending assignment exists for this user+entity today → update it.
    - Otherwise → create a new assignment record with the final status.
    Also always writes to call_logs.
    """
    if body.call_outcome not in VALID_OUTCOMES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid outcome. Must be one of: {', '.join(VALID_OUTCOMES)}"
        )

    try:
        today_str = get_today_ist()
        status_map = {
            "connected": "Called",
            "not_reachable": "Not Reachable",
            "callback": "Callback",
            "wrong_number": "Wrong Number",
        }
        new_status = status_map[body.call_outcome]

        # Check for an existing Pending assignment for this user + entity today
        existing_res = db.table("calling_assignments") \
            .select("assignment_id") \
            .eq("user_email", user_email) \
            .eq("customer_id", body.entity_id) \
            .eq("assigned_date", today_str) \
            .eq("status", "Pending") \
            .execute()

        assignment_id = None
        if existing_res.data:
            # Update existing
            assignment_id = existing_res.data[0]["assignment_id"]
            upd = {"status": new_status, "notes": body.notes or ""}
            if body.call_outcome == "callback" and body.callback_date:
                upd["callback_date"] = body.callback_date
            db.table("calling_assignments").eq("assignment_id", assignment_id).update(upd).execute()
        else:
            priority = "High" if body.entity_type == "distributor" else "Medium"

            # Create new called assignment
            new_row = {
                "user_email": user_email,
                "customer_id": body.entity_id,
                "entity_type": body.entity_type,
                "assigned_date": today_str,
                "status": new_status,
                "notes": body.notes or "",
                "priority": priority,
                "reason": "Adhoc Call",
            }
            if body.call_outcome == "callback" and body.callback_date:
                new_row["callback_date"] = body.callback_date
            ins = db.table("calling_assignments").insert(new_row).execute()
            if ins.data:
                assignment_id = ins.data[0].get("assignment_id")

        # Always write a call_logs entry
        log_row = {
            "assignment_id": assignment_id,
            "customer_id": body.entity_id,
            "user_email": user_email,
            "call_outcome": body.call_outcome,
            "notes": body.notes or "",
            "called_at": datetime.now(pytz.timezone("Asia/Kolkata")).isoformat(),
        }
        if body.call_outcome == "callback" and body.callback_date:
            log_row["callback_date"] = body.callback_date
        db.table("call_logs").insert(log_row).execute()

        return {"message": f"Call logged: {new_status}", "status": new_status, "assignment_id": assignment_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error logging adhoc call: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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

        # Calculate time_taken
        time_taken = None
        timer_key = f"{user_email}_{body.assignment_id}"
        
        # First check memory
        if timer_key in _CALL_TIMERS:
            start_dt = _CALL_TIMERS.pop(timer_key)
            time_taken = int((datetime.now(pytz.utc) - start_dt).total_seconds())
        # Fallback to DB
        elif assignment.get("call_started_at"):
            try:
                start_dt = datetime.fromisoformat(assignment["call_started_at"].replace("Z", "+00:00"))
                now_dt = datetime.now(pytz.utc)
                time_taken = int((now_dt - start_dt).total_seconds())
            except Exception as e:
                logger.warning(f"Failed to parse call_started_at: {e}")
        
        if time_taken and time_taken > 86400:
            time_taken = 86400

        # 4. Insert call log
        log_data = {
            "assignment_id": body.assignment_id,
            "user_email": user_email,
            "customer_id": assignment["customer_id"],
            "call_outcome": body.call_outcome,
            "notes": body.notes or "",
        }
        # Try inserting with time_taken. If it fails due to missing column, we fallback to without it.
        # But we assume the DB migration was run.
        if time_taken is not None:
            log_data["time_taken"] = time_taken

        try:
            db.table("call_logs").insert(log_data).execute()
        except Exception as e:
            # Fallback if time_taken column doesn't exist yet
            if "time_taken" in log_data:
                del log_data["time_taken"]
                log_data["notes"] = f"[Time Taken: {time_taken}s] " + log_data["notes"]
                db.table("call_logs").insert(log_data).execute()
            else:
                raise e

        # 5. If callback is selected with a date, schedule new assignment + send notifications
        if body.call_outcome == "callback" and body.callback_date:
            new_assign_res = db.table("calling_assignments").insert({
                "user_email": user_email,  # Affinity: stay with same telecaller
                "customer_id": assignment["customer_id"],
                "priority": assignment.get("priority", "Medium"),
                "reason": "Scheduled Callback",
                "assigned_date": body.callback_date,
                "status": "Pending",
                "notes": body.notes or "",
                "entity_type": assignment.get("entity_type", "distributor"),
            }).execute()
            new_assignment_id = (new_assign_res.data or [{}])[0].get("assignment_id")

            # Resolve the entity name for the notification message
            entity_name = "Unknown"
            entity_type = assignment.get("entity_type", "distributor")
            cid = assignment["customer_id"]
            try:
                if entity_type == "customer":
                    ent_res = db.table("customers").select("name").eq("customer_id", cid).execute()
                    entity_name = (ent_res.data or [{}])[0].get("name", "Unknown")
                else:
                    ent_res = db.table("distributors").select("mantri_name").eq("distributor_id", cid).execute()
                    entity_name = (ent_res.data or [{}])[0].get("mantri_name", "Unknown")
            except Exception:
                pass

            # Get caller's display name
            caller_name = user_email.split("@")[0]
            try:
                user_res = db.table("app_users").select("name").eq("email", user_email).execute()
                caller_name = (user_res.data or [{}])[0].get("name") or caller_name
            except Exception:
                pass

            action_url = f"/calling-list?open={new_assignment_id}" if new_assignment_id else "/calling-list"

            # ── Immediate notification: to the user who scheduled ──
            from routers.notifications import create_notification_helper
            create_notification_helper(
                db,
                title="📅 Callback Scheduled",
                message=f"You have scheduled a callback for {entity_name} on {body.callback_date}.",
                notification_type="info",
                user_email=user_email,
                entity_type="calling_assignment",
                entity_id=new_assignment_id,
                action_url=action_url,
            )

            # ── Immediate notification: to all admins/developers ──
            try:
                admins_res = db.table("app_users").select("email").in_("role", ["admin", "developer"]).execute()
                for admin in (admins_res.data or []):
                    if admin["email"] != user_email:
                        create_notification_helper(
                            db,
                            title="📅 Callback Scheduled by Agent",
                            message=f"{caller_name} has scheduled a callback for {entity_name} on {body.callback_date}.",
                            notification_type="info",
                            user_email=admin["email"],
                            entity_type="calling_assignment",
                            entity_id=new_assignment_id,
                            action_url="/call-distribution",
                        )
            except Exception as notif_err:
                logger.warning(f"[CALLBACK] Admin notification failed: {notif_err}")

        # 5b. Score adjustments based on call outcome
        # NOTE: customer_id here actually stores distributor_id (schema reuse).
        # All score adjustments must target the `distributors` table.
        distributor_id = assignment["customer_id"]
        try:
            if body.call_outcome == "connected" and body.notes and "order" in (body.notes or "").lower():
                # Connected + order mentioned → decrease score by 15 (min 0)
                dist_res = db.table("distributors").select("priority_score").eq("distributor_id", distributor_id).execute()
                if dist_res.data:
                    current_score = dist_res.data[0].get("priority_score", 0) or 0
                    new_score = max(0, current_score - 15)
                    from scoring_engine import priority_label as calc_label
                    db.table("distributors").eq("distributor_id", distributor_id).update({
                        "priority_score": new_score,
                        "priority_label": calc_label(new_score),
                    }).execute()
                    logger.info(f"[SCORE] distributor {distributor_id}: connected+order → score {current_score} → {new_score}")

            elif body.call_outcome == "not_reachable":
                # Not reachable → decrease score by 3 (min 0)
                dist_res = db.table("distributors").select("priority_score").eq("distributor_id", distributor_id).execute()
                if dist_res.data:
                    current_score = dist_res.data[0].get("priority_score", 0) or 0
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
                        .eq("customer_id", distributor_id) \
                        .eq("call_outcome", "not_reachable") \
                        .gte("created_at", week_ago) \
                        .execute()
                    nr_count = len(nr_res.data or [])
                    if nr_count >= 3:
                        update_data["priority_label"] = "LOW"
                        logger.info(f"[SCORE] distributor {distributor_id} has {nr_count} not_reachable this week → forced LOW")

                    db.table("distributors").eq("distributor_id", distributor_id).update(update_data).execute()
                    logger.info(f"[SCORE] distributor {distributor_id}: not_reachable → score {current_score} → {new_score}")

            elif body.call_outcome == "callback":
                # Callback → freeze score so nightly scoring job skips this distributor
                db.table("distributors").eq("distributor_id", distributor_id).update({
                    "score_frozen": True,
                }).execute()
                logger.info(f"[SCORE] distributor {distributor_id}: callback → score_frozen=True")

            # 'connected' without order → no score change (intentional)

        except Exception as e:
            logger.error(f"Score adjustment failed for distributor {distributor_id}: {e}")

        # 6. Log the activity for the floating toast
        try:
            logger_service = get_activity_logger(db)
            customer_name_str = "Unknown"
            try:
                # customer_id in calling_assignments actually stores distributor_id
                dist_res = db.table("distributors").select("mantri_name, village").eq("distributor_id", assignment["customer_id"]).execute()
                if dist_res.data:
                    customer_name_str = dist_res.data[0].get("mantri_name") or "Unknown"
                    village = dist_res.data[0].get("village") or ""
                    if village:
                        customer_name_str = f"{customer_name_str} ({village})"
            except:
                pass
            
            logger_service.log_activity(
                user_email=user_email,
                action_type="CALL",
                action_description=f"Logged call ({new_status}) for {customer_name_str}",
                entity_type="distributor",
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
        sales_managers = _get_present_sales_managers(db)
        
        combined = []
        seen = set()
        for u in telecallers + sales_managers:
            if u["email"] not in seen:
                combined.append(u)
                seen.add(u["email"])
                
        return {"telecallers": combined}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/telecaller-profile")
def get_telecaller_profile(
    email: str = Query(..., description="Telecaller email"),
    db: SupabaseClient = Depends(get_db),
):
    """Admin: get all-time stats for a specific telecaller including their converted mantri sales."""
    try:
        # 1. All-time call assignments for this telecaller
        all_assignments_res = db.table("calling_assignments") \
            .select("assignment_id, customer_id, status, assigned_date") \
            .eq("user_email", email) \
            .execute()
        all_assignments = all_assignments_res.data or []

        total_assigned = len(all_assignments)
        total_called = sum(1 for a in all_assignments if a.get("status") != "Pending")
        
        # All distributor IDs ever assigned to this telecaller
        assigned_dist_ids = list(set(a["customer_id"] for a in all_assignments if a.get("customer_id")))

        # 2. Find all sales made for those distributor IDs (all-time conversions)
        converted_mantris = []
        if assigned_dist_ids:
            # Fetch sales in chunks to avoid URL length limits
            chunk_size = 50
            all_sales = []
            for i in range(0, len(assigned_dist_ids), chunk_size):
                chunk = assigned_dist_ids[i:i+chunk_size]
                sales_res = db.table("sales") \
                    .select("sale_id, distributor_id, sale_date, total_amount, invoice_no, buyer_type") \
                    .in_("distributor_id", chunk) \
                    .order("sale_date", desc=True) \
                    .execute()
                all_sales.extend(sales_res.data or [])

            # Fetch recent call durations
            # NOTE: call_logs table may not have time_taken or created_at columns (migration pending).
            # We use log_id for ordering (auto-increment) and parse [Time Taken: Xs] from notes.
            call_durations = []
            log_data = []
            try:
                # Try fetching with time_taken column first
                logs_res = db.table("call_logs") \
                    .select("log_id, customer_id, time_taken, notes") \
                    .eq("user_email", email) \
                    .order("log_id", desc=True) \
                    .limit(50) \
                    .execute()
                log_data = logs_res.data or []
            except Exception:
                # Fallback: select only guaranteed base columns
                try:
                    logs_res = db.table("call_logs") \
                        .select("log_id, customer_id, notes") \
                        .eq("user_email", email) \
                        .order("log_id", desc=True) \
                        .limit(50) \
                        .execute()
                    log_data = logs_res.data or []
                except Exception as inner_e:
                    logger.warning(f"Fallback call_logs fetch failed: {inner_e}")

            if log_data:
                log_dist_ids = list(set(log["customer_id"] for log in log_data if log.get("customer_id")))
                dist_map = {}
                if log_dist_ids:
                    for i in range(0, len(log_dist_ids), 50):
                        dchunk = log_dist_ids[i:i+50]
                        dist_res = db.table("distributors") \
                            .select("distributor_id, mantri_name") \
                            .in_("distributor_id", dchunk) \
                            .execute()
                        for d in (dist_res.data or []):
                            dist_map[d["distributor_id"]] = d.get("mantri_name", "Unknown")

                import re
                for log in log_data:
                    tt = log.get("time_taken")
                    if tt is None and log.get("notes"):
                        # Parse [Time Taken: 120s] from notes
                        match = re.search(r"\[Time Taken: (\d+)s\]", log.get("notes", ""))
                        if match:
                            tt = int(match.group(1))

                    dist_name = dist_map.get(log.get("customer_id"), "Unknown")
                    call_durations.append({
                        "name": dist_name,
                        "time_taken": tt,  # may be None if no timer was captured
                    })

            # Get distributor details for all sold-to distributors
            sold_dist_ids = list(set(s["distributor_id"] for s in all_sales if s.get("distributor_id")))
            distributors_map = {}
            if sold_dist_ids:
                for i in range(0, len(sold_dist_ids), chunk_size):
                    chunk = sold_dist_ids[i:i+chunk_size]
                    dist_res = db.table("distributors") \
                        .select("distributor_id, mantri_name, village, taluka, district, mantri_mobile") \
                        .in_("distributor_id", chunk) \
                        .execute()
                    for d in (dist_res.data or []):
                        distributors_map[d["distributor_id"]] = d

            # Build converted mantri rows
            for sale in all_sales:
                dist_id = sale.get("distributor_id")
                dist = distributors_map.get(dist_id, {})
                converted_mantris.append({
                    "sale_id": sale.get("sale_id"),
                    "invoice_no": sale.get("invoice_no"),
                    "sale_date": sale.get("sale_date"),
                    "total_amount": sale.get("total_amount", 0),
                    "distributor_id": dist_id,
                    "mantri_name": dist.get("mantri_name", "Unknown"),
                    "village": dist.get("village", ""),
                    "taluka": dist.get("taluka", ""),
                    "district": dist.get("district", ""),
                    "mantri_mobile": dist.get("mantri_mobile", ""),
                })

        total_conversions = len(converted_mantris)
        total_revenue = sum(m.get("total_amount", 0) or 0 for m in converted_mantris)

        return {
            "email": email,
            "name": email.split("@")[0],
            "stats": {
                "total_assigned": total_assigned,
                "total_called": total_called,
                "pending": total_assigned - total_called,
                "completion_rate": round((total_called / total_assigned * 100) if total_assigned > 0 else 0, 1),
                "total_conversions": total_conversions,
                "total_revenue": total_revenue,
                "conversion_rate": round((total_conversions / total_called * 100) if total_called > 0 else 0, 1),
            },
            "converted_mantris": converted_mantris,
            "call_durations": call_durations if "call_durations" in locals() else [],
        }

    except Exception as e:
        logger.error(f"Error fetching telecaller profile: {e}")
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
        d = target_date or get_today_ist()
        offset = (page - 1) * limit

        res = db.table("calling_assignments") \
            .select("*") \
            .eq("assigned_date", d) \
            .order("assignment_id") \
            .limit(limit) \
            .offset(offset) \
            .execute()

        assignments = res.data or []

        # Enrich details based on entity_type (distributor vs customer)
        dist_ids = [a["customer_id"] for a in assignments if a.get("entity_type") == "distributor" and a.get("customer_id")]
        cust_ids = [a["customer_id"] for a in assignments if a.get("entity_type") == "customer" and a.get("customer_id")]
        
        # Fallback: if entity_type is missing, guess based on whether we can find it in distributors first?
        # Actually, let's just add any missing entity_type to both sets to be safe
        missing_type_ids = [a["customer_id"] for a in assignments if not a.get("entity_type") and a.get("customer_id")]
        dist_ids.extend(missing_type_ids)
        cust_ids.extend(missing_type_ids)

        dist_ids = list(set(dist_ids))
        cust_ids = list(set(cust_ids))

        distributors_map = {}
        if dist_ids:
            for i in range(0, len(dist_ids), 100):
                chunk = dist_ids[i:i+100]
                dist_res = db.table("distributors").select("distributor_id, mantri_name, mantri_mobile, village").in_("distributor_id", chunk).execute()
                for dist_row in (dist_res.data or []):
                    distributors_map[dist_row["distributor_id"]] = dist_row

        customers_map = {}
        if cust_ids:
            for i in range(0, len(cust_ids), 100):
                chunk = cust_ids[i:i+100]
                cust_res = db.table("customers").select("customer_id, name, mobile, village").in_("customer_id", chunk).execute()
                for cust_row in (cust_res.data or []):
                    customers_map[cust_row["customer_id"]] = cust_row

        enhanced = []
        for a in assignments:
            e_type = a.get("entity_type")
            cid = a.get("customer_id")
            
            # If explicit customer or it wasn't found in distributors
            if e_type == "customer" or (e_type != "distributor" and cid in customers_map and cid not in distributors_map):
                info = customers_map.get(cid, {})
                enhanced.append({
                    **a,
                    "name": info.get("name") or "Unknown",
                    "mobile": info.get("mobile") or "",
                    "village": info.get("village") or "",
                })
            else:
                # Default to distributor
                info = distributors_map.get(cid, {})
                enhanced.append({
                    **a,
                    "name": info.get("mantri_name") or "Unknown",
                    "mobile": info.get("mantri_mobile") or "",
                    "village": info.get("village") or "",
                })

        # Count total for date
        count_res = db.table("calling_assignments") \
            .select("assignment_id", count="exact") \
            .eq("assigned_date", d) \
            .execute()
        total = count_res.count if hasattr(count_res, "count") and count_res.count is not None else len(count_res.data or [])

        # Fetch user info
        users_res = db.table("app_users").select("email, name, role").execute()
        users_map = {u["email"]: u for u in (users_res.data or [])}

        # Per-telecaller summary — must match what each user sees in their
        # Calling List.  The Calling List endpoint (/my-assignments) counts
        # ALL assignments (no date filter), filtered by entity_type based on
        # the user's role.  We replicate that logic here so the admin
        # dashboard numbers are identical.
        #
        # Step 1: get the set of emails that have assignments TODAY so we
        #         know which telecallers to show cards for.
        today_emails = set()
        te_offset = 0
        while True:
            te_res = db.table("calling_assignments") \
                .select("user_email") \
                .eq("assigned_date", d) \
                .range(te_offset, te_offset + 999) \
                .execute()
            if not te_res.data:
                break
            for r in te_res.data:
                today_emails.add(r["user_email"])
            if len(te_res.data) < 1000:
                break
            te_offset += 1000

        # Step 2: for each email that has assignments today, fetch ALL their
        #         assignments (across all dates) — same as the calling list.
        telecaller_summary = {}
        for email in today_emails:
            u_info = users_map.get(email, {})
            u_role = u_info.get("role", "unknown").lower()

            # Build query matching the calling list summary logic
            q = db.table("calling_assignments").select("status")
            q = q.eq("user_email", email)

            # Filter by entity_type based on role (mirrors /my-assignments)
            if u_role == "sales_manager":
                q = q.eq("entity_type", "distributor")
            elif u_role not in ("admin", "developer"):
                q = q.eq("entity_type", "customer")

            q_res = q.execute()
            rows = q_res.data or []

            total = len(rows)
            pending = sum(1 for x in rows if x["status"] == "Pending")
            called = total - pending

            telecaller_summary[email] = {
                "total": total,
                "pending": pending,
                "called": called,
                "conversions": 0,
                "name": u_info.get("name", email.split("@")[0]),
                "role": u_info.get("role", "unknown"),
            }

        # Conversions: count sales created today for distributors assigned to each telecaller
        try:
            # 1. Get ALL sales for today (avoid not_.is_ which may fail in some supabase-py versions)
            sales_res = db.table("sales") \
                .select("sale_id, distributor_id, sale_date, buyer_type") \
                .eq("sale_date", d) \
                .execute()
            
            all_today_sales = sales_res.data or []
            logger.info(f"[CONVERSIONS] All sales for {d}: {len(all_today_sales)} total")
            
            # Filter to only distributor/mantri sales (distributor_id is not None/null)
            today_sale_dist_ids = set()
            for s in all_today_sales:
                dist_id = s.get("distributor_id")
                if dist_id is not None and dist_id != 0:
                    today_sale_dist_ids.add(dist_id)
                    logger.info(f"[CONVERSIONS] Sale {s.get('sale_id')}: distributor_id={dist_id}, buyer_type={s.get('buyer_type')}")

            logger.info(f"[CONVERSIONS] Distributor sales today: {len(today_sale_dist_ids)}, IDs: {today_sale_dist_ids}")

            if today_sale_dist_ids:
                # 2. Get all assignments for today to map telecaller → distributor_ids
                assign_res = db.table("calling_assignments") \
                    .select("user_email, customer_id") \
                    .eq("assigned_date", d) \
                    .execute()

                # Build telecaller → set of their assigned distributor IDs
                telecaller_dists: dict = {}
                for a in (assign_res.data or []):
                    em = a.get("user_email")
                    cid = a.get("customer_id")
                    if em and cid:
                        telecaller_dists.setdefault(em, set()).add(cid)

                logger.info(f"[CONVERSIONS] Telecaller assignments: { {k: list(v)[:5] for k, v in telecaller_dists.items()} }")

                # 3. Count how many of each telecaller's assigned distributors have sales today
                for em, dist_ids in telecaller_dists.items():
                    conversions = len(today_sale_dist_ids & dist_ids)
                    if em in telecaller_summary and conversions > 0:
                        telecaller_summary[em]["conversions"] = conversions
                        logger.info(f"[CONVERSIONS] {em}: {conversions} conversions (matched: {today_sale_dist_ids & dist_ids})")
            else:
                logger.info(f"[CONVERSIONS] No distributor sales found for {d}")

        except Exception as ce:
            logger.warning(f"Failed to fetch conversions for telecaller summary: {ce}", exc_info=True)

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


@router.post("/admin/distribute-mantris")
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
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Distribution failed: {e}")

class SabhsadDistributePayload(BaseModel):
    telecaller_emails: list[str]
    state: str
    district: str
    taluka: str
    village: str

@router.post("/admin/distribute-sabhsads")
def distribute_sabhsads(
    payload: SabhsadDistributePayload,
    user_role: str = Header(None, alias="x-user-role"),
    db: SupabaseClient = Depends(get_db),
):
    """Admin/Sales Manager: Distribute Sabhsads from a specific village to selected telecallers."""
    role = (user_role or "").lower()
    if role not in ["admin", "sales_manager"]:
        raise HTTPException(status_code=403, detail="Only Admins or Sales Managers can distribute Sabhsads")

    if not payload.telecaller_emails:
        raise HTTPException(status_code=400, detail="Must provide at least one telecaller email")

    try:
        # Fetch unassigned customers in this location (paginated)
        all_cust_ids = []
        batch = 1000
        offset = 0
        while True:
            query = db.table("customers").select("customer_id")
            if payload.state: query = query.eq("state", payload.state)
            if payload.district: query = query.eq("district", payload.district)
            if payload.taluka: query = query.eq("taluka", payload.taluka)
            if payload.village: query = query.eq("village", payload.village)
            query = query.range(offset, offset + batch - 1)
            cust_res = query.execute()
            if not cust_res.data:
                break
            all_cust_ids.extend([c["customer_id"] for c in cust_res.data])
            if len(cust_res.data) < batch:
                break
            offset += batch

        if not all_cust_ids:
            return {"message": "No sabhsads found in this location", "assigned": 0}

        # Find which of these are already assigned (paginate in chunks of 100 for IN query)
        assigned_ids = set()
        for i in range(0, len(all_cust_ids), 100):
            chunk = all_cust_ids[i:i+100]
            assigned_res = db.table("calling_assignments") \
                .select("customer_id") \
                .eq("entity_type", "customer") \
                .in_("customer_id", chunk) \
                .execute()
            for a in (assigned_res.data or []):
                assigned_ids.add(a["customer_id"])
            
        unassigned_ids = [cid for cid in all_cust_ids if cid not in assigned_ids]

        if not unassigned_ids:
            return {"message": "All sabhsads in this location are already assigned", "assigned": 0}

        ids_to_assign = unassigned_ids
        
        today_str = get_today_ist()
        assignments = []
        
        telecaller_count = len(payload.telecaller_emails)
        for i, cust_id in enumerate(ids_to_assign):
            assigned_email = payload.telecaller_emails[i % telecaller_count]
            assignments.append({
                "user_email": assigned_email,
                "customer_id": cust_id,
                "entity_type": "customer",
                "priority": "Medium",
                "reason": "Location Assignment",
                "assigned_date": today_str,
                "status": "Pending",
                "notes": "",
            })

        # Bulk insert in batches of 50
        if assignments:
            for i in range(0, len(assignments), 50):
                batch_chunk = assignments[i:i+50]
                db.table("calling_assignments").insert(batch_chunk).execute()


        # Notify telecallers
        notifications_map = {}
        for a in assignments:
            email = a["user_email"]
            notifications_map[email] = notifications_map.get(email, 0) + 1
            
        notification_records = []
        for email, count in notifications_map.items():
            notification_records.append({
                "user_email": email,
                "title": "📞 New Sabhsads Assigned",
                "message": f"You have {count} new Sabhsads assigned to you from {payload.village}.",
                "notification_type": "info",
                "entity_type": "calling_list",
                "is_read": False,
            })
        if notification_records:
            db.table("notifications").insert(notification_records).execute()

        return {
            "message": "Distribution successful",
            "assigned": len(assignments),
            "unassigned_remaining": len(unassigned_ids) - len(assignments),
            "distribution": notifications_map
        }
    except Exception as e:
        logger.error(f"[DIST-SABHSADS] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/locations")
def get_locations(db: SupabaseClient = Depends(get_db)):
    """Fetch distinct states, districts, talukas, and villages from customers table."""
    try:
        # Paginate to bypass Supabase's 1000-row server cap
        all_rows = []
        batch = 1000
        offset = 0
        while True:
            res = db.table("customers") \
                .select("state, district, taluka, village") \
                .range(offset, offset + batch - 1) \
                .execute()
            if not res.data:
                break
            all_rows.extend(res.data)
            if len(res.data) < batch:
                break
            offset += batch

        logger.info(f"[LOCATIONS] Fetched {len(all_rows)} customer rows for location hierarchy")

        # Group to build a hierarchical map
        hierarchy = {}
        
        for r in all_rows:
            s = (r.get("state") or "Unknown").strip().upper()
            d = (r.get("district") or "Unknown").strip().upper()
            t = (r.get("taluka") or "Unknown").strip().upper()
            v = (r.get("village") or "Unknown").strip().upper()
            
            if s not in hierarchy:
                hierarchy[s] = {}
            if d not in hierarchy[s]:
                hierarchy[s][d] = {}
            if t not in hierarchy[s][d]:
                hierarchy[s][d][t] = set()
            hierarchy[s][d][t].add(v)
            
        # Convert sets to lists
        for s in hierarchy:
            for d in hierarchy[s]:
                for t in hierarchy[s][d]:
                    hierarchy[s][d][t] = sorted(hierarchy[s][d][t])

        return hierarchy
    except Exception as e:
        logger.error(f"[LOCATIONS] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch locations")



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
    today_str = get_today_ist()
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
        today_str = get_today_ist()

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
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Refresh failed: {e}")


@router.get("/admin/available-counts")
def get_available_counts(
    target_email: str = Query(..., description="Target telecaller email (excluded from counts)"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Admin: Get the number of available (pending) calls per priority level and total.
    Excludes calls already assigned to the target email.
    Filters by entity_type: 'distributor' for sales_manager, 'customer' for telecaller.
    Returns: { "High": N, "Medium": N, "Low": N, "Any": N }
    """
    try:
        today_str = get_today_ist()

        # Determine target user's role to filter the correct entity_type
        user_res = db.table("app_users").select("role").eq("email", target_email).execute()
        role = user_res.data[0]["role"] if user_res.data else "telecaller"
        target_entity = "distributor" if role == "sales_manager" else "customer"

        # Get emails of all users with the same role
        role_res = db.table("app_users").select("email").eq("role", role).execute()
        same_role_emails = [r["email"] for r in role_res.data] if role_res.data else []

        if not same_role_emails:
            return {"High": 0, "Medium": 0, "Low": 0, "Any": 0}

        res = db.table("calling_assignments") \
            .select("priority") \
            .eq("assigned_date", today_str) \
            .eq("status", "Pending") \
            .eq("entity_type", target_entity) \
            .in_("user_email", same_role_emails) \
            .neq("user_email", target_email) \
            .execute()

        rows = res.data or []
        counts = {"High": 0, "Medium": 0, "Low": 0, "Any": len(rows)}
        for r in rows:
            p = r.get("priority")
            # If no priority is set, it won't increment High/Medium/Low but will be in Any
            if p in counts:
                counts[p] += 1

        return counts

    except Exception as e:
        logger.error(f"Error getting available counts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        today_str = get_today_ist()

        # Determine target user's role to filter the correct entity_type
        user_res = db.table("app_users").select("role").eq("email", body.target_email).execute()
        role = user_res.data[0]["role"] if user_res.data else "telecaller"
        target_entity = "distributor" if role == "sales_manager" else "customer"

        # Get emails of all users with the same role
        role_res = db.table("app_users").select("email").eq("role", role).execute()
        same_role_emails = [r["email"] for r in role_res.data] if role_res.data else []

        if not same_role_emails:
            raise HTTPException(status_code=404, detail="No users found with the same role.")

        # Server-side validation: check how many are actually available
        avail_query = db.table("calling_assignments") \
            .select("assignment_id") \
            .eq("assigned_date", today_str) \
            .eq("status", "Pending") \
            .eq("entity_type", target_entity) \
            .in_("user_email", same_role_emails) \
            .neq("user_email", body.target_email)

        if body.priority != "Any":
            avail_query = avail_query.eq("priority", body.priority)

        avail_res = avail_query.execute()
        available = len(avail_res.data or [])

        if body.count > available:
            raise HTTPException(
                status_code=400,
                detail=f"Requested {body.count} but only {available} {body.priority} priority calls are available"
            )

        # Get pending assignments of this priority NOT already assigned to target
        res_query = db.table("calling_assignments") \
            .select("assignment_id, user_email") \
            .eq("assigned_date", today_str) \
            .eq("status", "Pending") \
            .eq("entity_type", target_entity) \
            .in_("user_email", same_role_emails) \
            .neq("user_email", body.target_email)

        if body.priority != "Any":
            res_query = res_query.eq("priority", body.priority)

        res = res_query.limit(body.count).execute()

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


@router.post("/admin/transfer-pending")
def admin_transfer_pending(
    body: TransferPendingRequest,
    db: SupabaseClient = Depends(get_db),
):
    """
    Admin: Transfer all pending calls from one telecaller (e.g. half-day duty)
    to another telecaller.
    """
    if body.from_user_email == body.to_user_email:
        raise HTTPException(status_code=400, detail="Cannot transfer to the same user")

    try:
        today_str = get_today_ist()

        # Get all pending calls for the from_user
        res = db.table("calling_assignments") \
            .select("assignment_id") \
            .eq("assigned_date", today_str) \
            .eq("status", "Pending") \
            .eq("user_email", body.from_user_email) \
            .execute()

        candidates = res.data or []
        if not candidates:
            return {"message": "No pending calls to transfer", "transferred": 0}

        reassigned = 0
        for a in candidates:
            db.table("calling_assignments") \
                .eq("assignment_id", a["assignment_id"]) \
                .update({"user_email": body.to_user_email}) \
                .execute()
            reassigned += 1

        # Notify the new telecaller
        db.table("notifications").insert({
            "user_email": body.to_user_email,
            "title": "📞 Calls Transferred to You",
            "message": f"{reassigned} pending calls have been transferred to you from {body.from_user_email.split('@')[0]}.",
            "notification_type": "info",
            "entity_type": "calling_list",
            "is_read": False,
        }).execute()

        return {
            "message": f"Transferred {reassigned} calls from {body.from_user_email} to {body.to_user_email}",
            "transferred": reassigned,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transfer pending failed: {e}")


# ─── External Cron Trigger ────────────────────────────────
# Hit this endpoint from cron-job.org (or any external scheduler) at 10:00 AM IST
# to guarantee daily assignment even if the backend process restarts.
#
# Setup:
#   1. Add CRON_SECRET=<some-long-random-string> to backend/.env
#   2. On cron-job.org, create a job:
#        URL:    POST https://<your-backend>/api/automation/trigger-daily
#        Header: x-cron-secret: <same-secret>
#        Time:   04:30 UTC (= 10:00 AM IST)

@router.post("/trigger-daily")
def trigger_daily_cron(
    x_cron_secret: str = Header(None, alias="x-cron-secret"),
    db: SupabaseClient = Depends(get_db),
):
    """
    External-cron entry point for daily call distribution.
    Protected by CRON_SECRET env var — requests without the correct secret are
    rejected with 401. Safe to expose publicly because without the secret the
    endpoint is a no-op.
    """
    expected_secret = os.environ.get("CRON_SECRET", "").strip()
    if not expected_secret:
        # CRON_SECRET not configured — refuse all external calls to prevent
        # accidental open access.
        logger.error("[CRON] /trigger-daily called but CRON_SECRET env var is not set — rejecting.")
        raise HTTPException(
            status_code=503,
            detail="CRON_SECRET is not configured on this server. Set it in .env and restart."
        )

    if x_cron_secret != expected_secret:
        logger.warning(f"[CRON] /trigger-daily rejected — bad secret (received: {repr(x_cron_secret)})")
        raise HTTPException(status_code=401, detail="Invalid cron secret.")

    logger.info("[CRON] ✅ /trigger-daily authenticated — starting distribution...")
    try:
        result = distribute_calls(db, admin_email="external_cron")
        logger.info(f"[CRON] distribute_calls result: {result}")
        return {"triggered_by": "external_cron", **result}
    except RuntimeError as e:
        logger.error(f"[CRON] distribute_calls raised RuntimeError: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"[CRON] Unexpected error in trigger_daily_cron: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Cron trigger failed: {e}")


@router.post("/trigger-midnight")
def trigger_midnight_cron(
    x_cron_secret: str = Header(None, alias="x-cron-secret"),
    db: SupabaseClient = Depends(get_db),
):
    """
    External-cron entry point for the Midnight Refresh job.
    Clears old pending assignments. Protected by CRON_SECRET.
    """
    expected_secret = os.environ.get("CRON_SECRET", "").strip()
    if not expected_secret:
        raise HTTPException(status_code=503, detail="CRON_SECRET is not configured.")

    if x_cron_secret != expected_secret:
        raise HTTPException(status_code=401, detail="Invalid cron secret.")

    logger.info("[CRON] 🌙 /trigger-midnight authenticated — clearing old pending assignments...")
    try:
        today = get_today_ist()
        res = db.table("calling_assignments") \
            .lt("assigned_date", today) \
            .eq("status", "Pending") \
            .delete() \
            .execute()
        deleted = len(res.data or [])
        logger.info(f"[CRON] Cleared {deleted} old pending assignments.")
        return {"triggered_by": "external_cron", "message": "Midnight refresh successful", "deleted_count": deleted}
    except Exception as e:
        logger.error(f"[CRON] Unexpected error in trigger_midnight_cron: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Midnight cron trigger failed: {e}")


@router.post("/trigger-scoring")
def trigger_scoring_cron(
    x_cron_secret: str = Header(None, alias="x-cron-secret"),
    db: SupabaseClient = Depends(get_db),
):
    """
    External-cron entry point for the Nightly Priority Scoring job.
    Protected by CRON_SECRET.
    """
    expected_secret = os.environ.get("CRON_SECRET", "").strip()
    if not expected_secret:
        raise HTTPException(status_code=503, detail="CRON_SECRET is not configured.")

    if x_cron_secret != expected_secret:
        raise HTTPException(status_code=401, detail="Invalid cron secret.")

    logger.info("[CRON] 🔄 /trigger-scoring authenticated — starting nightly scoring...")
    try:
        # Ensure we can import run_nightly_scoring
        from scheduler import run_nightly_scoring
        
        # The internal run_nightly_scoring doesn't return anything or take db, 
        # it just uses the global db. We just call it.
        run_nightly_scoring()
        
        return {"triggered_by": "external_cron", "message": "Nightly scoring completed successfully"}
    except Exception as e:
        logger.error(f"[CRON] Unexpected error in trigger_scoring_cron: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Scoring cron trigger failed: {e}")