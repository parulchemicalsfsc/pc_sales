from typing import Optional, List
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from models import Shopkeeper
from supabase_db import SupabaseClient, get_supabase
from rbac_utils import verify_permission
from activity_logger import get_activity_logger

router = APIRouter()


@router.get("/", response_model=List[Shopkeeper], dependencies=[Depends(verify_permission("view_shopkeepers"))])
def get_shopkeepers(db: SupabaseClient = Depends(get_supabase)):
    """Get all shopkeepers"""
    try:
        response = (
            db.table("shopkeepers")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )

        if not response.data:
            return []

        return response.data
    except Exception as e:
        print("❌ GET ERROR:", str(e))
        # If the table doesn't exist yet, return empty list gracefully
        if "404" in str(e) or "Not Found" in str(e):
            print("Warning: shopkeepers table might not exist yet.")
            return []
        raise HTTPException(
            status_code=500, detail=f"Error fetching shopkeepers: {str(e)}"
        )


@router.post("/", dependencies=[Depends(verify_permission("create_shopkeeper"))])
def create_shopkeeper(
    shopkeeper: Shopkeeper,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Create a new shopkeeper"""
    try:
        shopkeeper_data = {
            "name": shopkeeper.name,
            "village": shopkeeper.village,
            "taluka": shopkeeper.taluka,
            "district": shopkeeper.district,
            "mantri_name": shopkeeper.mantri_name,
            "mantri_mobile": shopkeeper.mantri_mobile,
            "sabhasad_count": shopkeeper.sabhasad_count,
            "sabhasad_morning": shopkeeper.sabhasad_morning,
            "sabhasad_evening": shopkeeper.sabhasad_evening,
            "contact_in_group": shopkeeper.contact_in_group,
            "status": shopkeeper.status,
            "record_date": shopkeeper.record_date,
            "state": shopkeeper.state,
            "dairy_type": shopkeeper.dairy_type,
            "dairy_time_morning": shopkeeper.dairy_time_morning,
            "dairy_time_evening": shopkeeper.dairy_time_evening,
            "milk_collection_morning": shopkeeper.milk_collection_morning,
            "milk_collection_evening": shopkeeper.milk_collection_evening,
            "nature_of_sabhasad": shopkeeper.nature_of_sabhasad,
            "support": shopkeeper.support,
            "animal_delivery_period": shopkeeper.animal_delivery_period,
            "payment_recovery_demo": shopkeeper.payment_recovery_demo,
            "payment_recovery_dispatch": shopkeeper.payment_recovery_dispatch,
            "decision_maker_availability_morning": shopkeeper.decision_maker_availability_morning,
            "decision_maker_availability_evening": shopkeeper.decision_maker_availability_evening,
            "high_holder_to_low_holder_villages": shopkeeper.high_holder_to_low_holder_villages,
            "current_status_of_business": shopkeeper.current_status_of_business,
        }

        # Convert empty strings to None — Supabase rejects "" for typed columns
        # (e.g. time, integer) and will return 400 Bad Request
        cleaned_data = {}
        for k, v in shopkeeper_data.items():
            if v == "" or v == " ":
                cleaned_data[k] = None
            else:
                cleaned_data[k] = v

        # Remove keys with None values to let DB defaults apply
        cleaned_data = {k: v for k, v in cleaned_data.items() if v is not None}

        response = db.table("shopkeepers").insert(cleaned_data).execute()

        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create shopkeeper")

        return {
            "message": "Shopkeeper created successfully",
            "shopkeeper": response.data[0],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error creating shopkeeper: {str(e)}"
        )
    finally:
        if user_email:
            try:
                logger = get_activity_logger(db)
                logger.log_create(
                    user_email=user_email,
                    entity_type="shopkeeper",
                    entity_name=f"{shopkeeper.village} - {shopkeeper.taluka}",
                )
            except Exception:
                pass


@router.put("/{shopkeeper_id}", dependencies=[Depends(verify_permission("edit_shopkeeper"))])
async def update_shopkeeper(
    shopkeeper_id: int,
    request: Request,
    shopkeeper: Shopkeeper,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Update an existing shopkeeper"""
    print("🔥 UPDATE HIT")
    try:
        raw_body = await request.json()
        print("🔥 RAW REQUEST BODY:", raw_body)
        print("📦 PARSED DATA:", shopkeeper.model_dump())
        print("🧠 MODEL FIELDS:", Shopkeeper.model_fields.keys())
        
        # Prepare data for update
        update_data = {
            "village": shopkeeper.village,
            "taluka": shopkeeper.taluka,
            "district": shopkeeper.district,
            "mantri_name": shopkeeper.mantri_name,
            "mantri_mobile": shopkeeper.mantri_mobile,
            "sabhasad_morning": int(shopkeeper.sabhasad_morning or 0),
            "sabhasad_evening": int(shopkeeper.sabhasad_evening or 0),
            "status": shopkeeper.status,
            "contact_in_group": shopkeeper.contact_in_group,
            "record_date": shopkeeper.record_date,
            "state": shopkeeper.state,
            "dairy_type": shopkeeper.dairy_type,
            "dairy_time_morning": shopkeeper.dairy_time_morning,
            "dairy_time_evening": shopkeeper.dairy_time_evening,
            "milk_collection_morning": shopkeeper.milk_collection_morning,
            "milk_collection_evening": shopkeeper.milk_collection_evening,
            "nature_of_sabhasad": shopkeeper.nature_of_sabhasad,
            "support": shopkeeper.support,
            "animal_delivery_period": shopkeeper.animal_delivery_period,
            "payment_recovery_demo": shopkeeper.payment_recovery_demo,
            "payment_recovery_dispatch": shopkeeper.payment_recovery_dispatch,
            "decision_maker_availability_morning": shopkeeper.decision_maker_availability_morning,
            "decision_maker_availability_evening": shopkeeper.decision_maker_availability_evening,
            "high_holder_to_low_holder_villages": shopkeeper.high_holder_to_low_holder_villages,
            "current_status_of_business": shopkeeper.current_status_of_business,
        }

        # Convert empty strings to None — Supabase rejects "" for typed columns
        for k, v in update_data.items():
            if v == "" or v == " ":
                update_data[k] = None

        # Remove None values to avoid overwriting with null
        update_data = {k: v for k, v in update_data.items() if v is not None}

        if not update_data:
            raise HTTPException(status_code=400, detail="No valid update data provided")

        response = (
            db.table("shopkeepers")
            .eq("shopkeeper_id", shopkeeper_id)
            .update(update_data)
            .execute()
        )

        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Shopkeeper not found")

        print("✅ UPDATE SUCCESS")
        return {
            "message": "Shopkeeper updated successfully",
            "data": response.data[0],
        }
    except HTTPException:
        raise
    except Exception as e:
        print("❌ ERROR OCCURRED:", str(e))
        print(f"[ERROR] Error updating shopkeeper {shopkeeper_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating shopkeeper: {str(e)}"
        )
    finally:
        if user_email:
            try:
                logger = get_activity_logger(db)
                logger.log_update(
                    user_email=user_email,
                    entity_type="shopkeeper",
                    entity_name=f"{shopkeeper.village} - {shopkeeper.taluka}",
                    entity_id=shopkeeper_id,
                )
            except Exception:
                pass
