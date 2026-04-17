from typing import Optional, List
import requests
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from models import Distributor
from supabase_db import SupabaseClient, get_supabase, SUPABASE_URL, SUPABASE_KEY
from rbac_utils import verify_permission
from activity_logger import get_activity_logger

router = APIRouter()


@router.get("/", response_model=List[Distributor], dependencies=[Depends(verify_permission("view_distributors"))])
def get_distributors(db: SupabaseClient = Depends(get_supabase)):
    """Get all distributors"""
    try:
        response = (
            db.table("distributors")
            .select("*")
            .order("created_at", desc=True)
            .execute()
        )

        if not response.data:
            return []

        return response.data
    except Exception as e:
        print("❌ GET ERROR:", str(e))
        raise HTTPException(
            status_code=500, detail=f"Error fetching distributors: {str(e)}"
        )


@router.post("/", dependencies=[Depends(verify_permission("create_distributor"))])
def create_distributor(
    distributor: Distributor,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Create a new distributor"""
    try:
        distributor_data = {
            "name": distributor.name,
            "village": distributor.village,
            "taluka": distributor.taluka,
            "district": distributor.district,
            "mantri_name": distributor.mantri_name,
            "mantri_mobile": distributor.mantri_mobile,
            "sabhasad_count": distributor.sabhasad_count,
            "sabhasad_morning": distributor.sabhasad_morning,
            "sabhasad_evening": distributor.sabhasad_evening,
            "contact_in_group": distributor.contact_in_group,
            "status": distributor.status,
            "record_date": distributor.record_date,
            "state": distributor.state,
            "dairy_type": distributor.dairy_type,
            "dairy_time_morning": distributor.dairy_time_morning,
            "dairy_time_evening": distributor.dairy_time_evening,
            "milk_collection_morning": distributor.milk_collection_morning,
            "milk_collection_evening": distributor.milk_collection_evening,
            "nature_of_sabhasad": distributor.nature_of_sabhasad,
            "support": distributor.support,
            "animal_delivery_period": distributor.animal_delivery_period,
            "payment_recovery_demo": distributor.payment_recovery_demo,
            "payment_recovery_dispatch": distributor.payment_recovery_dispatch,
            "decision_maker_availability_morning": distributor.decision_maker_availability_morning,
            "decision_maker_availability_evening": distributor.decision_maker_availability_evening,
            "high_holder_to_low_holder_villages": distributor.high_holder_to_low_holder_villages,
            "current_status_of_business": distributor.current_status_of_business,
        }

        # Convert empty strings to None — Supabase rejects "" for typed columns
        # (e.g. time, integer) and will return 400 Bad Request
        cleaned_data = {}
        for k, v in distributor_data.items():
            if v == "" or v == " ":
                cleaned_data[k] = None
            else:
                cleaned_data[k] = v

        # Remove keys with None values to let DB defaults apply
        cleaned_data = {k: v for k, v in cleaned_data.items() if v is not None}

        response = db.table("distributors").insert(cleaned_data).execute()

        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create distributor")

        if user_email:
            try:
                logger = get_activity_logger(db)
                logger.log_create(
                    user_email=user_email,
                    entity_type="distributor",
                    entity_name=f"{distributor.village} - {distributor.taluka}",
                    new_state=response.data[0] if response.data else None,
                )
            except Exception:
                pass

        return {
            "message": "Distributor created successfully",
            "distributor": response.data[0],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error creating distributor: {str(e)}"
        )



@router.put("/{distributor_id}", dependencies=[Depends(verify_permission("edit_distributor"))])
async def update_distributor(
    distributor_id: int,
    request: Request,
    distributor: Distributor,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Update an existing distributor"""
    print("🔥 UPDATE HIT")
    try:
        raw_body = await request.json()
        print("🔥 RAW REQUEST BODY:", raw_body)
        print("📦 PARSED DATA:", distributor.model_dump())
        print("🧠 MODEL FIELDS:", Distributor.model_fields.keys())

        # Fetch current record BEFORE updating so we can log the diff
        before_resp = db.table("distributors").select("*").eq("distributor_id", distributor_id).execute()
        before_data = before_resp.data[0] if before_resp.data else {}
        
        # Prepare data for update
        update_data = {
            "village": distributor.village,
            "taluka": distributor.taluka,
            "district": distributor.district,
            "mantri_name": distributor.mantri_name,
            "mantri_mobile": distributor.mantri_mobile,
            "sabhasad_morning": int(distributor.sabhasad_morning or 0),
            "sabhasad_evening": int(distributor.sabhasad_evening or 0),
            "status": distributor.status,
            "contact_in_group": distributor.contact_in_group,
            "record_date": distributor.record_date,
            "state": distributor.state,
            "dairy_type": distributor.dairy_type,
            "dairy_time_morning": distributor.dairy_time_morning,
            "dairy_time_evening": distributor.dairy_time_evening,
            "milk_collection_morning": distributor.milk_collection_morning,
            "milk_collection_evening": distributor.milk_collection_evening,
            "nature_of_sabhasad": distributor.nature_of_sabhasad,
            "support": distributor.support,
            "animal_delivery_period": distributor.animal_delivery_period,
            "payment_recovery_demo": distributor.payment_recovery_demo,
            "payment_recovery_dispatch": distributor.payment_recovery_dispatch,
            "decision_maker_availability_morning": distributor.decision_maker_availability_morning,
            "decision_maker_availability_evening": distributor.decision_maker_availability_evening,
            "high_holder_to_low_holder_villages": distributor.high_holder_to_low_holder_villages,
            "current_status_of_business": distributor.current_status_of_business,
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
            db.table("distributors")
            .eq("distributor_id", distributor_id)
            .update(update_data)
            .execute()
        )

        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Distributor not found")

        print("✅ UPDATE SUCCESS")
        return {
            "message": "Distributor updated successfully",
            "data": response.data[0],
        }
    except HTTPException:
        raise
    except Exception as e:
        print("❌ ERROR OCCURRED:", str(e))
        print(f"[ERROR] Error updating distributor {distributor_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating distributor: {str(e)}"
        )
    finally:
        if user_email:
            try:
                # Fetch updated record for the diff
                after_resp = db.table("distributors").select("*").eq("distributor_id", distributor_id).execute()
                after_data = after_resp.data[0] if after_resp.data else {}
                logger = get_activity_logger(db)
                logger.log_update_with_diff(
                    user_email=user_email,
                    entity_type="distributor",
                    entity_name=f"{distributor.village} - {distributor.taluka}",
                    entity_id=distributor_id,
                    before=before_data,
                    after=after_data,
                    skip_fields=["distributor_id", "created_at"],
                )
            except Exception:
                pass


@router.delete("/{distributor_id}", dependencies=[Depends(verify_permission("edit_distributor"))])
def delete_distributor(
    distributor_id: int,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Delete a distributor"""
    try:
        distributor_id = int(distributor_id)
        print("Deleting ID:", distributor_id)

        url = f"{SUPABASE_URL}/rest/v1/distributors?distributor_id=eq.{distributor_id}"
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"
        }

        response = requests.delete(url, headers=headers)
        print("DELETE STATUS:", response.status_code)
        print("DELETE RESPONSE:", response.text)

        if response.status_code not in [200, 204]:
            raise HTTPException(status_code=500, detail=response.text)

        return {"message": "Distributor deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print("DELETE ERROR:", str(e))
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pass
        # Temporarily disabling logging per user request
        # if user_email:
        #     try:
        #         logger = get_activity_logger(db)
        #         logger.log_delete(
        #             user_email=user_email,
        #             entity_type="distributor",
        #             entity_name=f"ID: {distributor_id}",
        #             entity_id=distributor_id,
        #         )
        #     except Exception:
        #         pass
