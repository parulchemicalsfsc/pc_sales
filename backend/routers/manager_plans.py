from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Query
from models import CustomerPlannedRoute, PlanStop
from supabase_db import SupabaseClient, get_supabase, SUPABASE_URL, SUPABASE_KEY
from rbac_utils import verify_permission

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
        query = (
            db.table("route_plan_items")
            .select(
                """
                *,
                daily_route_plans!inner(id, plan_date, user_email, status),
                customers!inner(id, name, village, taluka, district, mobile, contact_no)
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

        query = query.order("planned_sequence", asc=True)

        response = query.execute()

        if not response.data:
            return []

        # Group by customer and build the response model
        grouped: dict = {}
        for row in response.data:
            customer_id = row["customer_id"]
            if customer_id not in grouped:
                customer_info = row.get("customers")
                grouped[customer_id] = {
                    "customer_id": customer_id,
                    "customer_name": customer_info["name"] if customer_info else None,
                    "contact_no": customer_info["contact_no"] if customer_info else None,
                    "village": customer_info["village"] if customer_info else None,
                    "taluka": customer_info["taluka"] if customer_info else None,
                    "district": customer_info["district"] if customer_info else None,
                    "planned_stops": [],
                }

            stop_data = {
                "item_id": row["id"],
                "plan_id": row["plan_id"]
                if "plan_id" in row
                else row.get("daily_route_plans", {}).get("id"),
                "assigned_officer_email": row["daily_route_plans"]["user_email"]
                if row.get("daily_route_plans")
                else user_email,
                "assigned_officer_name": (
                    row["daily_route_plans"]["user_email"]
                    .split("@")[0]
                    if row.get("daily_route_plans") and row["daily_route_plans"].get("user_email")
                    else None
                ),
                "sequence_order": row["planned_sequence"],
                "planned_time": row["planned_time"],
                "task_type": row.get("task_type", "order"),
                "status": row["status"],
                "actual_visit": row.get("actual_visit"),
            }

            grouped[customer_id]["planned_stops"].append(stop_data)

        result = list(grouped.values())

        # Sort customers alphabetically by name for consistent UI display
        result.sort(key=lambda x: x["customer_name"] or "")

        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching plans by customer: {str(e)}"
        )