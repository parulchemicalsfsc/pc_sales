
import os
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from supabase_db import get_supabase

logger = logging.getLogger(__name__)

def distribute_calls_job():
    """
    Daily 10 AM IST job: idempotent call distribution.
    Uses the same distribute_calls() function as the admin endpoint.
    """
    try:
        logger.info("⏰ Auto-distribution triggered by scheduler")
        from routers.automation import distribute_calls
        db = get_supabase()
        result = distribute_calls(db, admin_email="system_scheduler")
        logger.info(f"Auto-distribution result: {result}")
    except Exception as e:
        logger.error(f"Auto-distribution failed: {e}")

def start_scheduler():
    """
    Start APScheduler with single-worker guard.
    Only runs if SCHEDULER_ENABLED=1 env var is set (set on one worker only).
    """
    scheduler = BackgroundScheduler()

    if os.environ.get("SCHEDULER_ENABLED", "").strip() == "1":
        # 10:00 AM IST (IST = UTC+5:30, so 4:30 AM UTC)
        trigger = CronTrigger(hour=4, minute=30)
        scheduler.add_job(
            distribute_calls_job,
            trigger=trigger,
            id="daily_calling_distribution",
            name="Auto-Distribute Calling List at 10 AM IST",
            replace_existing=True
        )
        scheduler.start()
        logger.info("✅ Scheduler ENABLED — daily distribution at 10:00 AM IST")
    else:
        logger.info("⏸️ Scheduler DISABLED — set SCHEDULER_ENABLED=1 to enable")

    return scheduler
