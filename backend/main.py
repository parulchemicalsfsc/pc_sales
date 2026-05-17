import os
import logging
from contextlib import asynccontextmanager

# ─── Load .env FIRST so all env vars (SCHEDULER_ENABLED etc.) are available ──
from dotenv import load_dotenv
load_dotenv()  # reads backend/.env into os.environ

# ─── Logging Setup ────────────────────────────────────────────────────────────
# Writes to BOTH console (so you see it in terminal) AND backend.log file
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(),                        # → terminal / console
        logging.FileHandler("backend.log", mode="a", encoding="utf-8"),  # → backend.log
    ],
)
logger = logging.getLogger("main")
logger.info("=" * 60)
logger.info("Backend starting up...")
logger.info(f"SCHEDULER_ENABLED = {os.environ.get('SCHEDULER_ENABLED', '(not set)')}")
logger.info("=" * 60)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import (
    admin,
    algorithm,
    analytics,
    automation,
    chat,
    customers,
    dashboard,
    demos,
    distributors,
    imports,
    notifications,
    payments,
    products,
    reports,
    sales,
    rbac,
    sessions,
    forecasting,
    shopkeepers,
    doctors,
    leads,
    attendance,
    reviews,
)
from scheduler import start_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start scheduler
    scheduler = start_scheduler()
    yield
    # Shutdown scheduler
    scheduler.shutdown()


app = FastAPI(title="Sales Management API", lifespan=lifespan)

# Build CORS origin list from env — always include local dev + production origins
_frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
_allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    # Production frontend — always allowed regardless of FRONTEND_URL env var
    "https://pc-sales.vercel.app",
]
if _frontend_url and _frontend_url not in _allowed_origins:
    _allowed_origins.append(_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "Sales Management API running"}


# ─── Health / Keep-Alive ──────────────────────────────────────────────────────
# Hit this every 5 min from cron-job.org to prevent Render from sleeping.
@app.get("/health")
def health_check():
    return {"status": "ok"}


# ─── External Cron Triggers ───────────────────────────────────────────────────
# Secured by CRON_SECRET env var. Set the same secret as a query param in
# your cron-job.org request URL: ?secret=YOUR_SECRET
# These run the job directly via HTTP — no dependency on APScheduler being alive.

def _verify_cron_secret(secret: str):
    expected = os.getenv("CRON_SECRET", "").strip()
    if not expected:
        raise Exception("CRON_SECRET env var not set on server")
    if secret != expected:
        raise Exception("Invalid cron secret")

@app.post("/cron/distribute")
def cron_distribute(secret: str = ""):
    """External trigger: run 10 AM call distribution job."""
    try:
        _verify_cron_secret(secret)
    except Exception as e:
        from fastapi import HTTPException as _HTTPException
        raise _HTTPException(status_code=403, detail=str(e))
    from scheduler import distribute_calls_job
    logger.info("[CRON] External trigger → distribute_calls_job")
    distribute_calls_job()
    return {"status": "distribute_calls_job triggered"}

@app.post("/cron/midnight-refresh")
def cron_midnight_refresh(secret: str = ""):
    """External trigger: run midnight refresh job."""
    try:
        _verify_cron_secret(secret)
    except Exception as e:
        from fastapi import HTTPException as _HTTPException
        raise _HTTPException(status_code=403, detail=str(e))
    from scheduler import midnight_refresh_job
    logger.info("[CRON] External trigger → midnight_refresh_job")
    midnight_refresh_job()
    return {"status": "midnight_refresh_job triggered"}

@app.post("/cron/nightly-scoring")
def cron_nightly_scoring(secret: str = ""):
    """External trigger: run nightly priority scoring job."""
    try:
        _verify_cron_secret(secret)
    except Exception as e:
        from fastapi import HTTPException as _HTTPException
        raise _HTTPException(status_code=403, detail=str(e))
    from scheduler import run_nightly_scoring
    logger.info("[CRON] External trigger → run_nightly_scoring")
    run_nightly_scoring()
    return {"status": "run_nightly_scoring triggered"}


app.include_router(customers, prefix="/api/customers")
app.include_router(products, prefix="/api/products")
app.include_router(sales, prefix="/api/sales")
app.include_router(payments, prefix="/api/payments")
app.include_router(demos, prefix="/api/demos")
app.include_router(distributors, prefix="/api/distributors")
app.include_router(shopkeepers, prefix="/api/shopkeepers")
app.include_router(doctors, prefix="/api/doctors")
app.include_router(dashboard, prefix="/api/dashboard")
app.include_router(reports, prefix="/api/reports")
app.include_router(analytics, prefix="/api/analytics")
app.include_router(admin, prefix="/api/admin")
app.include_router(algorithm, prefix="/api/algorithm")
app.include_router(imports, prefix="/api/imports")
app.include_router(automation, prefix="/api/automation")
app.include_router(notifications, prefix="/api/notifications")
app.include_router(rbac, prefix="/api/rbac")
app.include_router(sessions, prefix="/api/user-sessions")
app.include_router(forecasting, prefix="/api/forecasting")
app.include_router(chat, prefix="/api/chat")
app.include_router(leads, prefix="/api/leads")
app.include_router(attendance, prefix="/api/attendance")
app.include_router(reviews.router, prefix="/api/reviews")
