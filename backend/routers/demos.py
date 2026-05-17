from typing import Optional
from datetime import date, datetime, timedelta

import requests
from activity_logger import get_activity_logger
from fastapi import APIRouter, Depends, Header, HTTPException
from models import Demo
from supabase_db import SupabaseClient, get_supabase
from rbac_utils import verify_permission

from routers.notifications import create_notification_helper

router = APIRouter()


# ======================
# Demo Suggestions Algorithm
# ======================
@router.get("/suggestions", dependencies=[Depends(verify_permission("view_demos"))])
def get_demo_suggestions(limit: int = 20, db: SupabaseClient = Depends(get_supabase)):
    """
    Smart Demo Suggestion Algorithm:
    Scores each active distributor on 4 signals:
      1. priority_score  – from the nightly scoring engine (0–100)
      2. recency_score   – how long since last demo (longer gap = higher urgency)
      3. group_size      – contact_in_group (more contacts = higher impact)
      4. no_demo_bonus   – large bonus if they have NEVER had a demo
    Final suggestion_score = weighted sum of signals (0–100).
    """
    try:
        today = date.today()

        # 1. Fetch all active distributors
        dist_resp = (
            db.table("distributors")
            .select("distributor_id, mantri_name, village, taluka, district, contact_in_group, sabhasad_count, priority_score, priority_label, status")
            .eq("status", "Active")
            .execute()
        )
        distributors = dist_resp.data or []
        if not distributors:
            return []

        # 2. Fetch all demos — to compute last-demo date per distributor
        demos_resp = (
            db.table("demos")
            .select("distributor_id, demo_date, conversion_status")
            .execute()
        )
        demos = demos_resp.data or []

        # Build: distributor_id → list of demo dates
        from collections import defaultdict
        demo_map = defaultdict(list)
        for d in demos:
            did = d.get("distributor_id")
            if did:
                demo_map[did].append({
                    "date": d.get("demo_date"),
                    "status": d.get("conversion_status"),
                })

        # 3. Score each distributor
        MAX_DAYS_RECENCY = 180   # 6 months is our "cold" threshold
        MAX_GROUP_SIZE   = 100   # normalise group size against this

        scored = []
        for dist in distributors:
            did = dist["distributor_id"]
            entries = demo_map.get(did, [])

            # ── Recency signal ──────────────────────────────
            if entries:
                valid_dates = [e["date"] for e in entries if e.get("date")]
                if valid_dates:
                    latest_str = max(valid_dates)
                    try:
                        # demo_date is stored as text "YYYY-MM-DD"
                        latest_date = datetime.strptime(latest_str[:10], "%Y-%m-%d").date()
                        days_gap = (today - latest_date).days
                    except Exception:
                        days_gap = MAX_DAYS_RECENCY
                else:
                    days_gap = MAX_DAYS_RECENCY
                no_demo_bonus = 0
            else:
                days_gap = MAX_DAYS_RECENCY
                no_demo_bonus = 20   # never had a demo → high urgency bonus

            recency_score = min(days_gap / MAX_DAYS_RECENCY, 1.0) * 35   # max 35 pts

            # ── Priority signal (from nightly engine) ───────
            raw_priority = float(dist.get("priority_score") or 0)
            priority_score_norm = min(raw_priority / 100.0, 1.0) * 30   # max 30 pts

            # ── Group size signal ────────────────────────────
            group = int(dist.get("contact_in_group") or dist.get("sabhasad_count") or 0)
            group_score = min(group / MAX_GROUP_SIZE, 1.0) * 15   # max 15 pts

            # ── Total ────────────────────────────────────────
            total = round(recency_score + priority_score_norm + group_score + no_demo_bonus, 1)
            total = min(total, 100.0)

            # ── Last demo meta for display ───────────────────
            last_demo = None
            last_status = None
            if entries:
                valid = [(e["date"], e["status"]) for e in entries if e.get("date")]
                if valid:
                    last_demo, last_status = max(valid, key=lambda x: x[0])

            scored.append({
                "distributor_id": did,
                "mantri_name": dist.get("mantri_name"),
                "village": dist.get("village"),
                "taluka": dist.get("taluka"),
                "district": dist.get("district"),
                "contact_in_group": group,
                "priority_label": dist.get("priority_label", "LOW"),
                "priority_score": raw_priority,
                "total_demos": len(entries),
                "last_demo_date": last_demo,
                "last_demo_status": last_status,
                "days_since_last_demo": days_gap if entries else None,
                "suggestion_score": total,
                "reason": _build_reason(days_gap, raw_priority, group, not bool(entries)),
            })

        # 4. Sort by suggestion_score descending, return top N
        scored.sort(key=lambda x: x["suggestion_score"], reverse=True)
        return scored[:limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating suggestions: {str(e)}")


def _build_reason(days_gap: int, priority: float, group: int, never_had_demo: bool) -> str:
    parts = []
    if never_had_demo:
        parts.append("Never had a demo")
    elif days_gap >= 90:
        parts.append(f"No demo in {days_gap} days")
    elif days_gap >= 30:
        parts.append(f"Last demo was {days_gap} days ago")

    if priority >= 70:
        parts.append("High priority score")
    elif priority >= 40:
        parts.append("Medium priority score")

    if group >= 20:
        parts.append(f"Large group ({group} contacts)")
    elif group >= 10:
        parts.append(f"Active group ({group} contacts)")

    return " · ".join(parts) if parts else "Routine follow-up"




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

        doctors_response = db.table("doctors").select("doctor_id, name, mantri_mobile, village").execute()
        doctors_dict = {d["doctor_id"]: d for d in doctors_response.data} if doctors_response.data else {}

        shopkeepers_response = db.table("shopkeepers").select("shopkeeper_id, name, mantri_mobile, village").execute()
        shopkeepers_dict = {s["shopkeeper_id"]: s for s in shopkeepers_response.data} if shopkeepers_response.data else {}

        # Enrich demos with related data
        result = []
        for demo in demos_response.data:
            customer_id = demo.get("customer_id")
            product_id = demo.get("product_id")
            distributor_id = demo.get("distributor_id")

            buyer_type = demo.get("buyer_type") or "customer"
            
            resolved_name = ""
            resolved_mobile = ""
            resolved_village = ""

            if buyer_type == "mantri" and demo.get("distributor_id"):
                entity = distributors_dict.get(demo["distributor_id"], {})
                resolved_name = entity.get("mantri_name") or entity.get("name", "")
                resolved_mobile = entity.get("mantri_mobile") or entity.get("mobile") or ""
                resolved_village = entity.get("village", "")
            elif buyer_type == "distributor" and demo.get("distributor_id"):
                entity = distributors_dict.get(demo["distributor_id"], {})
                resolved_name = entity.get("name", "")
                resolved_mobile = entity.get("mantri_mobile") or entity.get("mobile") or entity.get("contact_mobile") or ""
                resolved_village = entity.get("village", "")
            elif buyer_type == "doctor" and demo.get("doctor_id"):
                entity = doctors_dict.get(demo["doctor_id"], {})
                resolved_name = entity.get("name", "")
                resolved_mobile = entity.get("mantri_mobile", "")
                resolved_village = entity.get("village", "")
            elif buyer_type == "shopkeeper" and demo.get("shopkeeper_id"):
                entity = shopkeepers_dict.get(demo["shopkeeper_id"], {})
                resolved_name = entity.get("name", "")
                resolved_mobile = entity.get("mantri_mobile", "")
                resolved_village = entity.get("village", "")
            else:
                entity = customers_dict.get(demo.get("customer_id"), {})
                resolved_name = entity.get("name", "")
                resolved_mobile = entity.get("mobile", "")
                resolved_village = entity.get("village", "")

            result.append(
                {
                    **demo,
                    "customer_name": resolved_name,
                    "customer_mobile": resolved_mobile,
                    "village": resolved_village,
                    "product_name": product.get("product_name"),
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
        if not demo.customer_id and not demo.distributor_id and not demo.doctor_id and not demo.shopkeeper_id:
            raise HTTPException(status_code=400, detail="A customer or entity ID is required")

        if not demo.product_id:
            raise HTTPException(status_code=400, detail="Product ID is required")

        if not demo.demo_date:
            raise HTTPException(status_code=400, detail="Demo date is required")

        if not demo.demo_time:
            raise HTTPException(status_code=400, detail="Demo time is required")

        buyer_type = getattr(demo, "buyer_type", "customer")

        demo_data = {
            "buyer_type": buyer_type,
            "demo_date": demo.demo_date,
            "demo_time": demo.demo_time,
            "product_id": demo.product_id,
            "quantity_provided": getattr(demo, "quantity_provided", 1),
            "follow_up_date": getattr(demo, "follow_up_date", None),
            "conversion_status": getattr(demo, "conversion_status", "Scheduled"),
            "notes": getattr(demo, "notes", None),
            "demo_location": getattr(demo, "demo_location", None),
        }

        if buyer_type in ["mantri", "distributor"]:
            demo_data["distributor_id"] = demo.distributor_id
            demo_data["customer_id"] = None
            demo_data["doctor_id"] = None
            demo_data["shopkeeper_id"] = None
        elif buyer_type == "doctor":
            demo_data["doctor_id"] = demo.doctor_id
            demo_data["customer_id"] = None
            demo_data["distributor_id"] = None
            demo_data["shopkeeper_id"] = None
        elif buyer_type == "shopkeeper":
            demo_data["shopkeeper_id"] = demo.shopkeeper_id
            demo_data["customer_id"] = None
            demo_data["distributor_id"] = None
            demo_data["doctor_id"] = None
        else:
            demo_data["customer_id"] = demo.customer_id
            demo_data["distributor_id"] = None
            demo_data["doctor_id"] = None
            demo_data["shopkeeper_id"] = None

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
