
import os
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from supabase_db import get_supabase

logger = logging.getLogger(__name__)

def distribute_calls_job():
    """Daily 10:00 AM IST job: idempotent call distribution."""
    try:
        logger.info("[SCHEDULER] ===== distribute_calls_job TRIGGERED (10:00 AM IST) =====")
        from routers.automation import distribute_calls
        db = get_supabase()
        logger.info("[SCHEDULER] DB connection obtained, calling distribute_calls...")
        result = distribute_calls(db, admin_email="system_scheduler")
        logger.info(f"[SCHEDULER] distribute_calls result: {result}")
    except Exception as e:
        logger.error(f"[SCHEDULER] ❌ distribute_calls_job FAILED: {e}", exc_info=True)

def midnight_refresh_job():
    """Midnight IST job: clear pending assignments so new day starts fresh."""
    try:
        logger.info("[SCHEDULER] 🌙 midnight_refresh_job TRIGGERED")
        from datetime import date
        db = get_supabase()
        today = date.today().isoformat()
        logger.info(f"[SCHEDULER] Deleting OLD PENDING distributor assignments older than {today} (sales manager assignments reset each midnight)...")
        res = db.table("calling_assignments") \
            .lt("assigned_date", today) \
            .eq("status", "Pending") \
            .eq("entity_type", "distributor") \
            .delete() \
            .execute()
        deleted = len(res.data or [])
        logger.info(f"[SCHEDULER] Cleared {deleted} old pending distributor assignments.")

        # Roll over the preserved ones (e.g. customer/sabhsad) to today so they appear in today's dashboard
        res_update = db.table("calling_assignments") \
            .lt("assigned_date", today) \
            .eq("status", "Pending") \
            .update({"assigned_date": today}) \
            .execute()
        updated = len(res_update.data or [])
        logger.info(f"[SCHEDULER] Rolled over {updated} old pending assignments to {today}.")
    except Exception as e:
        logger.error(f"[SCHEDULER] ❌ midnight_refresh_job FAILED: {e}", exc_info=True)

def run_nightly_scoring():
    """11:45 PM IST job: re-score all active distributors and bulk-update the DB."""
    try:
        from datetime import datetime, date
        from scoring_engine import score_all_customers
        db = get_supabase()
        logger.info("🔄 Nightly scoring job started")

        # ── Step 0: Unfreeze expired callbacks ─────────────────────
        # Distributors with score_frozen=true whose callback date has passed
        # should be unfrozen so they get re-scored tonight.
        today_str = date.today().isoformat()
        try:
            frozen_res = db.table("distributors") \
                .select("distributor_id") \
                .eq("score_frozen", True) \
                .execute()
            frozen_ids = [r["distributor_id"] for r in (frozen_res.data or [])]
            if frozen_ids:
                for did in frozen_ids:
                    cb_res = db.table("calling_assignments") \
                        .select("assigned_date") \
                        .eq("customer_id", did) \
                        .eq("reason", "Scheduled Callback") \
                        .eq("status", "Pending") \
                        .execute()
                    future_callbacks = [
                        r for r in (cb_res.data or [])
                        if r.get("assigned_date", "") >= today_str
                    ]
                    if not future_callbacks:
                        db.table("distributors") \
                            .eq("distributor_id", did) \
                            .update({"score_frozen": False})
                        logger.info(f"Unfroze distributor {did} — callback expired")
        except Exception as e:
            logger.warning(f"Callback unfreeze check failed (non-fatal): {e}")

        # ── Step 1: Fetch all active, non-frozen distributors ──────
        dist_res = db.table("distributors") \
            .select("*") \
            .eq("status", "Active") \
            .eq("score_frozen", False) \
            .execute()
        distributors = dist_res.data or []

        if not distributors:
            logger.info("No active non-frozen distributors to score")
            return

        # ── Step 2: Map distributor columns → scoring keys ─────────
        # Column mapping: distributors DB column → scoring_engine key
        COLUMN_MAP = {
            "animal_delivery_period":           "delivery_period",
            "payment_recovery_demo":            "demo_days",
            "payment_recovery_dispatch":        "dispatch_days",
            "high_holder_to_low_holder_villages": "high_low_holder",
            "current_status_of_business":       "current_business",
            "nature_of_sabhasad":               "nature_sabhasad",
            "support":                          "support",
        }

        mapped_list = []
        for dist in distributors:
            mapped = {"distributor_id": dist["distributor_id"]}
            for db_col, score_key in COLUMN_MAP.items():
                mapped[score_key] = dist.get(db_col)
            mapped_list.append(mapped)

        # ── Step 3: Score all distributors ──────────────────────────
        scored = score_all_customers(mapped_list)

        # ── Step 4: Single bulk upsert ─────────────────────────────
        now_ts = datetime.utcnow().isoformat()
        upsert_list = []
        for item in scored:
            upsert_list.append({
                "distributor_id": item["distributor_id"],
                "priority_score":  item["priority_score"],
                "priority_label":  item["priority_label"],
                "score_season":    item["score_season"],
                "score_payment":   item["score_payment"],
                "score_holder":    item["score_holder"],
                "score_business":  item["score_business"],
                "score_sabhasad":  item["score_sabhasad"],
                "score_support":   item["score_support"],
                "score_updated_at": now_ts,
            })

        db.table("distributors").upsert(upsert_list).execute()

        logger.info(f"✅ Nightly scoring complete — {len(upsert_list)} distributors scored at {now_ts}")

    except Exception as e:
        logger.error(f"Nightly scoring failed: {e}")


def check_callbacks_job():
    """Daily 9:00 AM IST: send reminder notifications for callback assignments due today."""
    try:
        from datetime import date as _date
        db = get_supabase()
        today = _date.today().isoformat()
        logger.info(f"[SCHEDULER] ⏰ check_callbacks_job — checking for callback assignments on {today}")

        # Find all Pending assignments with reason='Scheduled Callback' for today
        res = db.table("calling_assignments") \
            .select("assignment_id, user_email, customer_id, entity_type") \
            .eq("assigned_date", today) \
            .eq("status", "Pending") \
            .eq("reason", "Scheduled Callback") \
            .execute()

        callbacks = res.data or []
        logger.info(f"[SCHEDULER] Found {len(callbacks)} callback(s) due today")
        if not callbacks:
            return

        # Fetch all admin emails
        admins_res = db.table("app_users").select("email, name").in_("role", ["admin", "developer"]).execute()
        admin_emails = [a["email"] for a in (admins_res.data or [])]

        for cb in callbacks:
            assignment_id = cb["assignment_id"]
            user_email = cb["user_email"]
            entity_type = cb.get("entity_type") or "distributor"
            cid = cb["customer_id"]

            # Resolve entity name
            entity_name = "Unknown"
            try:
                if entity_type == "customer":
                    ent = db.table("customers").select("name").eq("customer_id", cid).execute()
                    entity_name = (ent.data or [{}])[0].get("name", "Unknown")
                else:
                    ent = db.table("distributors").select("mantri_name").eq("distributor_id", cid).execute()
                    entity_name = (ent.data or [{}])[0].get("mantri_name", "Unknown")
            except Exception:
                pass

            # Resolve caller name
            caller_name = user_email.split("@")[0]
            try:
                u_res = db.table("app_users").select("name").eq("email", user_email).execute()
                caller_name = (u_res.data or [{}])[0].get("name") or caller_name
            except Exception:
                pass

            action_url = f"/calling-list?open={assignment_id}"

            # Dedup: skip if reminder for this assignment was already sent today
            existing = db.table("notifications").select("notification_id") \
                .eq("user_email", user_email) \
                .eq("entity_type", "calling_assignment") \
                .eq("entity_id", assignment_id) \
                .eq("notification_type", "warning") \
                .gte("created_at", today) \
                .execute()
            if existing.data:
                continue

            # Reminder to the assigned agent
            db.table("notifications").insert({
                "user_email": user_email,
                "title": f"📞 Callback Reminder: {entity_name}",
                "message": f"You have a scheduled callback with {entity_name} today! Tap to open and log your call.",
                "notification_type": "warning",
                "entity_type": "calling_assignment",
                "entity_id": assignment_id,
                "action_url": action_url,
                "is_read": False,
            }).execute()

            # Reminder to all admins
            for admin_email in admin_emails:
                if admin_email != user_email:
                    db.table("notifications").insert({
                        "user_email": admin_email,
                        "title": f"📞 Callback Due Today: {entity_name}",
                        "message": f"{caller_name} has a scheduled callback with {entity_name} today.",
                        "notification_type": "info",
                        "entity_type": "calling_assignment",
                        "entity_id": assignment_id,
                        "action_url": "/call-distribution",
                        "is_read": False,
                    }).execute()

        logger.info(f"[SCHEDULER] ✅ Callback reminder job complete")
    except Exception as e:
        logger.error(f"[SCHEDULER] ❌ check_callbacks_job FAILED: {e}", exc_info=True)


def check_overdue_leads_job():
    """Daily 9:00 AM IST: create in-app notifications for leads with overdue follow-up dates."""
    try:
        from datetime import date as _date
        db = get_supabase()
        today = _date.today().isoformat()
        logger.info(f"[SCHEDULER] ⏰ check_overdue_leads_job — checking for overdue leads as of {today}")

        res = db.table("leads").select("lead_id, full_name, assigned_to, follow_up_date") \
            .lt("follow_up_date", today) \
            .neq("status", "Converted") \
            .neq("status", "Rejected") \
            .execute()

        leads = res.data or []
        logger.info(f"[SCHEDULER] Found {len(leads)} overdue lead(s)")

        if leads:
            lead_ids = [l["lead_id"] for l in leads]
            owners_res = db.table("lead_owners").select("lead_id, user_email").in_("lead_id", lead_ids).execute()
            owners_by_lead = {}
            for row in (owners_res.data or []):
                owners_by_lead.setdefault(row["lead_id"], []).append(row["user_email"])

            for lead in leads:
                lead_owners = owners_by_lead.get(lead["lead_id"], [])
                for assigned_to in lead_owners:
                    # Dedup: skip if a notification for this lead+today already exists
                    existing = db.table("notifications").select("notification_id") \
                        .eq("user_email", assigned_to) \
                        .eq("entity_type", "lead") \
                        .eq("action_url", "/lead-workspace") \
                        .ilike("title", f"%{lead['lead_id']}%") \
                        .gte("created_at", today) \
                        .execute()
                    if existing.data:
                        continue

                    db.table("notifications").insert({
                        "user_email": assigned_to,
                        "title": f"Follow-up Overdue: {lead['lead_id']}",
                        "message": f"Your follow-up for lead {lead['lead_id']} ({lead.get('full_name', '')}) was due on {lead['follow_up_date']}.",
                        "notification_type": "warning",
                        "entity_type": "lead",
                        "action_url": "/lead-workspace",
                        "is_read": False,
                    }).execute()

        logger.info(f"[SCHEDULER] ✅ Overdue lead check complete")
    except Exception as e:
        logger.error(f"[SCHEDULER] ❌ check_overdue_leads_job FAILED: {e}", exc_info=True)


def start_scheduler():

    """
    Start APScheduler with single-worker guard.
    Only runs if SCHEDULER_ENABLED=1 env var is set (set on one worker only).
    """
    scheduler = BackgroundScheduler()

    if os.environ.get("SCHEDULER_ENABLED", "").strip() == "1":
        import pytz
        ist = pytz.timezone("Asia/Kolkata")
        
        # 10:00 AM IST
        scheduler.add_job(
            distribute_calls_job,
            trigger=CronTrigger(hour=10, minute=0, timezone=ist),
            id="daily_calling_distribution",
            name="Auto-Distribute at 10:00 AM IST",
            replace_existing=True,
            misfire_grace_time=None
        )
        # 12:00 AM IST (midnight)
        scheduler.add_job(
            midnight_refresh_job,
            trigger=CronTrigger(hour=0, minute=0, timezone=ist),
            id="midnight_refresh",
            name="Midnight Refresh — Clear Pending",
            replace_existing=True,
            misfire_grace_time=None
        )
        # 11:45 PM IST
        scheduler.add_job(
            run_nightly_scoring,
            trigger=CronTrigger(hour=23, minute=45, timezone=ist),
            id="nightly_scoring",
            name="Nightly Priority Scoring at 11:45 PM IST",
            replace_existing=True,
            misfire_grace_time=None
        )
        # 9:00 AM IST — callback reminders for today's scheduled callbacks
        scheduler.add_job(
            check_callbacks_job,
            trigger=CronTrigger(hour=9, minute=0, timezone=ist),
            id="callback_reminders",
            name="Callback Reminder Notifications at 9:00 AM IST",
            replace_existing=True
        )
        # 9:05 AM IST — overdue lead follow-up alerts
        scheduler.add_job(
            check_overdue_leads_job,
            trigger=CronTrigger(hour=9, minute=5, timezone=ist),
            id="overdue_leads_check",
            name="Overdue Lead Follow-up Alerts at 9:05 AM IST",
            replace_existing=True
        )
        scheduler.start()
        logger.info("✅ Scheduler ENABLED — midnight + 9AM callbacks + 9:05 leads + 10AM distribution + 11:45PM scoring")
    else:
        logger.info("⏸️ Scheduler DISABLED — set SCHEDULER_ENABLED=1 to enable")

    return scheduler
