from typing import Optional

import requests
from activity_logger import get_activity_logger
from fastapi import APIRouter, Depends, Header, HTTPException
from models import Demo
from supabase_db import SupabaseClient, get_supabase
from rbac_utils import verify_permission

from routers.notifications import create_notification_helper

router = APIRouter()


# ======================
# Get all demos
# ======================
@router.get("/", dependencies=[Depends(verify_permission("view_demos"))])
def get_demos(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    db: SupabaseClient = Depends(get_supabase),
):
    """Get all demos with related customer, product, and distributor information"""
    try:
        # Build query
        query = (
            db.table("demos")
            .select("*")
            .order("demo_date", desc=True)
            .order("demo_time", desc=True)
        )

        # Filter by status if provided
        if status:
            query = query.eq("conversion_status", status)

        # Apply pagination
        query = query.limit(limit).offset(skip)

        demos_response = query.execute()

        if not demos_response.data:
            return []

        # Get related data
        customers_response = (
            db.table("customers").select("customer_id, name, mobile, village").execute()
        )
        customers_dict = (
            {c["customer_id"]: c for c in customers_response.data}
            if customers_response.data
            else {}
        )

        products_response = (
            db.table("products").select("product_id, product_name").execute()
        )
        products_dict = (
            {p["product_id"]: p for p in products_response.data}
            if products_response.data
            else {}
        )

        distributors_response = (
            db.table("distributors").select("distributor_id, mantri_name").execute()
        )

        distributors_dict = (
            {d["distributor_id"]: d for d in distributors_response.data}
            if distributors_response.data
            else {}
        )

        # Enrich demos with related data
        result = []
        for demo in demos_response.data:
            customer_id = demo.get("customer_id")
            product_id = demo.get("product_id")
            distributor_id = demo.get("distributor_id")

            # Get customer, product, and distributor from dictionaries
            customer = customers_dict.get(customer_id, {})
            product = products_dict.get(product_id, {})
            distributor = distributors_dict.get(distributor_id, {})

            result.append(
                {
                    **demo,
                    "customer_name": customer.get("name"),
                    "customer_mobile": customer.get("mobile"),
                    "village": customer.get("village"),
                    "product_name": product.get("product_name"),
                    "distributor_name": distributor.get("mantri_name"),
                }
            )

        return result
    except requests.HTTPError as e:
        print(f"Warning: Supabase HTTP error in get_demos: {e}")
        # Return empty list if table doesn't exist
        return []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching demos: {str(e)}")


# ======================
# Get single demo
# ======================
@router.get("/{demo_id}", dependencies=[Depends(verify_permission("view_demos"))])
def get_demo(demo_id: int, db: SupabaseClient = Depends(get_supabase)):
    """Get a single demo by ID"""
    try:
        response = db.table("demos").select("*").eq("demo_id", demo_id).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Demo not found")

        demo = response.data[0]

        # Get related data
        customer_id = demo.get("customer_id")
        product_id = demo.get("product_id")
        distributor_id = demo.get("distributor_id")

        if customer_id:
            customer_response = (
                db.table("customers")
                .select("*")
                .eq("customer_id", customer_id)
                .execute()
            )
            if customer_response.data:
                demo["customer"] = customer_response.data[0]

        if product_id:
            product_response = (
                db.table("products").select("*").eq("product_id", product_id).execute()
            )
            if product_response.data:
                demo["product"] = product_response.data[0]

        if distributor_id:
            distributor_response = (
                db.table("distributors")
                .select("*")
                .eq("distributor_id", distributor_id)
                .execute()
            )
            if distributor_response.data:
                demo["distributor"] = distributor_response.data[0]

        return demo
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching demo: {str(e)}")


# ======================
# Create demo
# ======================
@router.post("/", dependencies=[Depends(verify_permission("schedule_demo"))])
def create_demo(
    demo: Demo,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Create a new demo"""
    try:
        # Validate required fields
        if not demo.customer_id:
            raise HTTPException(status_code=400, detail="Customer ID is required")

        if not demo.product_id:
            raise HTTPException(status_code=400, detail="Product ID is required")

        if not demo.demo_date:
            raise HTTPException(status_code=400, detail="Demo date is required")

        if not demo.demo_time:
            raise HTTPException(status_code=400, detail="Demo time is required")

        demo_data = {
            "customer_id": demo.customer_id,
            "distributor_id": getattr(demo, "distributor_id", None),
            "demo_date": demo.demo_date,
            "demo_time": demo.demo_time,
            "product_id": demo.product_id,
            "quantity_provided": getattr(demo, "quantity_provided", 1),
            "follow_up_date": getattr(demo, "follow_up_date", None),
            "conversion_status": getattr(demo, "conversion_status", "Scheduled"),
            "notes": getattr(demo, "notes", None),
            "demo_location": getattr(demo, "demo_location", None),
        }

        # Convert empty strings to None to prevent Supabase 400s on constrained types
        cleaned_data = {}
        for k, v in demo_data.items():
            if v == "" or v == " ":
                cleaned_data[k] = None
            else:
                cleaned_data[k] = v

        # Remove explicit None values so Database defaults naturally apply
        cleaned_data = {k: v for k, v in cleaned_data.items() if v is not None}

        response = db.table("demos").insert(cleaned_data).execute()

        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create demo")

        created_demo = response.data[0]

        # Notification creation removed as per user request


        return {"message": "Demo scheduled successfully", "demo": created_demo}

    except requests.HTTPError as e:
        detail = str(e)
        raise HTTPException(status_code=400, detail=f"Supabase error: {detail}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating demo: {str(e)}")


# ======================
# Update demo
# ======================
@router.put("/{demo_id}", dependencies=[Depends(verify_permission("edit_demo"))])
def update_demo(
    demo_id: int,
    demo_data: dict,
    db: SupabaseClient = Depends(get_supabase),
):
    """Update a demo"""
    try:
        # Clean data
        cleaned_data = {}
        for k, v in demo_data.items():
            if v == "" or v == " ":
                cleaned_data[k] = None
            else:
                cleaned_data[k] = v
        cleaned_data = {k: v for k, v in cleaned_data.items() if v is not None}

        response = db.table("demos").eq("demo_id", demo_id).update(cleaned_data).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Demo not found")

        return {"message": "Demo updated successfully", "demo": response.data[0]}

    except requests.HTTPError as e:
        detail = str(e)
        raise HTTPException(status_code=400, detail=f"Supabase error: {detail}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating demo: {str(e)}")


# ======================
# Update demo status
# ======================
@router.put("/{demo_id}/status", dependencies=[Depends(verify_permission("edit_demo"))])
def update_demo_status(
    demo_id: int,
    conversion_status: str,
    notes: Optional[str] = None,
    db: SupabaseClient = Depends(get_supabase),
):
    """Update demo conversion status"""
    try:
        update_data = {"conversion_status": conversion_status}
        if notes is not None:
            update_data["notes"] = notes

        response = (
            db.table("demos").eq("demo_id", demo_id).update(update_data).execute()
        )

        if not response.data:
            raise HTTPException(status_code=404, detail="Demo not found")

        return {"message": "Demo updated successfully", "demo": response.data[0]}

    except requests.HTTPError as e:
        detail = str(e)
        raise HTTPException(status_code=400, detail=f"Supabase error: {detail}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating demo: {str(e)}")


# ======================
# Delete demo
# ======================
@router.delete("/{demo_id}", dependencies=[Depends(verify_permission("delete_demo"))])
def delete_demo(demo_id: int, db: SupabaseClient = Depends(get_supabase)):
    """Delete a demo"""

    try:
        response = db.table("demos").eq("demo_id", demo_id).delete().execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Demo not found")

        return {"message": "Demo deleted successfully"}

    except requests.HTTPError as e:
        detail = str(e)
        raise HTTPException(status_code=400, detail=f"Supabase error: {detail}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting demo: {str(e)}")
