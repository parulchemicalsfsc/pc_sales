import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Query
from models import CustomerPlannedRoute, PlanStop
from supabase_db import SupabaseClient, get_supabase, SUPABASE_URL, SUPABASE_KEY
from rbac_utils import verify_permission

logger = logging.getLogger("uvicorn.error")

router = APIRouter()


@router.get(
    "/by-customer",
    response_model=List[CustomerPlannedRoute],
    dependencies=[Depends(verify_permission("view_plans"))],
)
def get_plans_by_customer(
    plan_date: Optional[str] = Query(None, description="Filter by date (YYYY-MM-DD). Defaults to today if omitted."),
    customer_id: Optional[str] = Query(None, description="Filter for a single specific customer UUID."),
    status: Optional[str] = Query(None, description="Filter by visit status (pending, completed, skipped)."),
    user_email: Optional[str] = Query(None, description="Filter by assigned field officer email."),
    db: SupabaseClient = Depends(get_supabase),
):
    """Get route plans grouped by customer, sorted by field officer."""
    try:
        target_date = plan_date or __import__("datetime").date.today().isoformat()

        # Build the Supabase query joining route_plan_items with daily_route_plans and customers
        # Note: The customers table has columns (customer_id, name, village, taluka, district, mobile)
        query = (
            db.table("route_plan_items")
            .select(
                """
                *,
                daily_route_plans!inner(id, plan_date, user_email, status),
                customers(customer_id, name, village, taluka, district, mobile)
            """
            )
            .eq("daily_route_plans.plan_date", target_date)
        )

        if customer_id:
            query = query.eq("customer_id", customer_id)

        if status:
            query = query.eq("status", status)

        if user_email:
            query = query.eq("daily_route_plans.user_email", user_email)

        query = query.order("planned_sequence", desc=False)

        response = query.execute()

        if not response.data:
            return []

        # Group by customer and build the response model
        grouped: dict = {}
        for row in response.data:
            c_id = str(row.get("customer_id") or "")
            if not c_id:
                continue

            customer_info = row.get("customers") or {}
            if c_id not in grouped:
                grouped[c_id] = {
                    "customer_id": c_id,
                    "customer_name": customer_info.get("name") or f"Customer #{c_id}",
                    "contact_no": customer_info.get("mobile") or None,
                    "village": customer_info.get("village") or None,
                    "taluka": customer_info.get("taluka") or None,
                    "district": customer_info.get("district") or None,
                    "planned_stops": [],
                }

            daily_plan = row.get("daily_route_plans") or {}
            officer_email = daily_plan.get("user_email") or user_email or "unassigned"
            officer_name = (
                officer_email.split("@")[0] if "@" in officer_email else officer_email
            )

            stop_data = {
                "item_id": str(row.get("id") or ""),
                "plan_id": str(row.get("plan_id") or daily_plan.get("id") or ""),
                "assigned_officer_email": officer_email,
                "assigned_officer_name": officer_name,
                "sequence_order": row.get("planned_sequence") or 1,
                "planned_time": str(row.get("planned_time") or "09:00"),
                "task_type": row.get("task_type") or "order",
                "status": row.get("status") or "pending",
                "actual_visit": row.get("actual_visit"),
            }

            grouped[c_id]["planned_stops"].append(stop_data)

        result = list(grouped.values())

        # Sort customers alphabetically by name for consistent UI display
        result.sort(key=lambda x: str(x.get("customer_name") or ""))

        return result
    except Exception as e:
        logger.warning(f"Error fetching plans by customer: {e}")
        # Return empty list gracefully so the frontend never encounters an unhandled 500
        return []
