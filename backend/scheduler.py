
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
        logger.info(f"[SCHEDULER] Deleting pending assignments older than {today}...")
        res = db.table("calling_assignments") \
            .lt("assigned_date", today) \
            .eq("status", "Pending") \
            .delete() \
            .execute()
        deleted = len(res.data or [])
        logger.info(f"[SCHEDULER] Cleared {deleted} old pending assignments.")
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
            replace_existing=True
        )
        # 12:00 AM IST (midnight)
        scheduler.add_job(
            midnight_refresh_job,
            trigger=CronTrigger(hour=0, minute=0, timezone=ist),
            id="midnight_refresh",
            name="Midnight Refresh — Clear Pending",
            replace_existing=True
        )
        # 11:45 PM IST
        scheduler.add_job(
            run_nightly_scoring,
            trigger=CronTrigger(hour=23, minute=45, timezone=ist),
            id="nightly_scoring",
            name="Nightly Priority Scoring at 11:45 PM IST",
            replace_existing=True
        )
        scheduler.start()
        logger.info("✅ Scheduler ENABLED — midnight refresh + 10:00 AM distribution + 11:45 PM scoring")
    else:
        logger.info("⏸️ Scheduler DISABLED — set SCHEDULER_ENABLED=1 to enable")

    return scheduler
