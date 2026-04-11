import os
from contextlib import asynccontextmanager

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

# Build CORS origin list from env — always include local dev origins
_frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
_allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
if _frontend_url:
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
