from typing import Optional, List
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from models import Doctor
from supabase_db import SupabaseClient, get_supabase
from rbac_utils import verify_permission
from activity_logger import get_activity_logger

router = APIRouter()


@router.get("/", response_model=List[Doctor], dependencies=[Depends(verify_permission("view_doctors"))])
def get_doctors(db: SupabaseClient = Depends(get_supabase)):
    """Get all doctors"""
    try:
        response = (
            db.table("doctors")
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
            print("Warning: doctors table might not exist yet.")
            return []
        raise HTTPException(
            status_code=500, detail=f"Error fetching doctors: {str(e)}"
        )


@router.post("/", dependencies=[Depends(verify_permission("create_doctor"))])
def create_doctor(
    doctor: Doctor,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Create a new doctor"""
    try:
        doctor_data = {
            "name": doctor.name,
            "village": doctor.village,
            "taluka": doctor.taluka,
            "district": doctor.district,
            "mantri_name": doctor.mantri_name,
            "mantri_mobile": doctor.mantri_mobile,
            "sabhasad_count": doctor.sabhasad_count,
            "sabhasad_morning": doctor.sabhasad_morning,
            "sabhasad_evening": doctor.sabhasad_evening,
            "contact_in_group": doctor.contact_in_group,
            "status": doctor.status,
            "record_date": doctor.record_date,
            "state": doctor.state,
            "dairy_type": doctor.dairy_type,
            "dairy_time_morning": doctor.dairy_time_morning,
            "dairy_time_evening": doctor.dairy_time_evening,
            "milk_collection_morning": doctor.milk_collection_morning,
            "milk_collection_evening": doctor.milk_collection_evening,
            "nature_of_sabhasad": doctor.nature_of_sabhasad,
            "support": doctor.support,
            "animal_delivery_period": doctor.animal_delivery_period,
            "payment_recovery_demo": doctor.payment_recovery_demo,
            "payment_recovery_dispatch": doctor.payment_recovery_dispatch,
            "decision_maker_availability_morning": doctor.decision_maker_availability_morning,
            "decision_maker_availability_evening": doctor.decision_maker_availability_evening,
            "high_holder_to_low_holder_villages": doctor.high_holder_to_low_holder_villages,
            "current_status_of_business": doctor.current_status_of_business,
        }

        # Convert empty strings to None — Supabase rejects "" for typed columns
        # (e.g. time, integer) and will return 400 Bad Request
        cleaned_data = {}
        for k, v in doctor_data.items():
            if v == "" or v == " ":
                cleaned_data[k] = None
            else:
                cleaned_data[k] = v

        # Remove keys with None values to let DB defaults apply
        cleaned_data = {k: v for k, v in cleaned_data.items() if v is not None}

        response = db.table("doctors").insert(cleaned_data).execute()

        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create doctor")

        if user_email:
            try:
                logger = get_activity_logger(db)
                logger.log_create(
                    user_email=user_email,
                    entity_type="doctor",
                    entity_name=f"{doctor.village} - {doctor.taluka}",
                    new_state=response.data[0] if response.data else None,
                )
            except Exception:
                pass

        return {
            "message": "Doctor created successfully",
            "doctor": response.data[0],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error creating doctor: {str(e)}"
        )



@router.put("/{doctor_id}", dependencies=[Depends(verify_permission("edit_doctor"))])
async def update_doctor(
    doctor_id: int,
    request: Request,
    doctor: Doctor,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Update an existing doctor"""
    print("🔥 UPDATE HIT")
    try:
        raw_body = await request.json()
        print("🔥 RAW REQUEST BODY:", raw_body)
        print("📦 PARSED DATA:", doctor.model_dump())
        print("🧠 MODEL FIELDS:", Doctor.model_fields.keys())
        
        # Prepare data for update
        update_data = {
            "name": doctor.name,
            "village": doctor.village,
            "taluka": doctor.taluka,
            "district": doctor.district,
            "mantri_name": doctor.mantri_name,
            "mantri_mobile": doctor.mantri_mobile,
            "sabhasad_morning": int(doctor.sabhasad_morning or 0),
            "sabhasad_evening": int(doctor.sabhasad_evening or 0),
            "status": doctor.status,
            "contact_in_group": doctor.contact_in_group,
            "record_date": doctor.record_date,
            "state": doctor.state,
            "dairy_type": doctor.dairy_type,
            "dairy_time_morning": doctor.dairy_time_morning,
            "dairy_time_evening": doctor.dairy_time_evening,
            "milk_collection_morning": doctor.milk_collection_morning,
            "milk_collection_evening": doctor.milk_collection_evening,
            "nature_of_sabhasad": doctor.nature_of_sabhasad,
            "support": doctor.support,
            "animal_delivery_period": doctor.animal_delivery_period,
            "payment_recovery_demo": doctor.payment_recovery_demo,
            "payment_recovery_dispatch": doctor.payment_recovery_dispatch,
            "decision_maker_availability_morning": doctor.decision_maker_availability_morning,
            "decision_maker_availability_evening": doctor.decision_maker_availability_evening,
            "high_holder_to_low_holder_villages": doctor.high_holder_to_low_holder_villages,
            "current_status_of_business": doctor.current_status_of_business,
        }

        # Convert empty strings to None — Supabase rejects "" for typed columns
        for k, v in update_data.items():
            if v == "" or v == " ":
                update_data[k] = None

        # Remove None values to avoid overwriting with null
        update_data = {k: v for k, v in update_data.items() if v is not None}

        if not update_data:
            raise HTTPException(status_code=400, detail="No valid update data provided")

        # Fetch current state before update for diff logging
        current_res = db.table("doctors").select("*").eq("doctor_id", doctor_id).execute()
        current_doctor = current_res.data[0] if current_res.data else None

        response = (
            db.table("doctors")
            .eq("doctor_id", doctor_id)
            .update(update_data)
            .execute()
        )

        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Doctor not found")

        print("✅ UPDATE SUCCESS")
        
        if user_email and current_doctor:
            try:
                logger = get_activity_logger(db)
                logger.log_update_with_diff(
                    user_email=user_email,
                    entity_type="doctor",
                    entity_name=f"{doctor.name or doctor.village}",
                    entity_id=doctor_id,
                    before_state=current_doctor,
                    after_state=update_data,
                )
            except Exception as le:
                print(f"[ERROR] Failed to log update diff: {le}")

        return {
            "message": "Doctor updated successfully",
            "data": response.data[0],
        }
    except HTTPException:
        raise
    except Exception as e:
        print("❌ ERROR OCCURRED:", str(e))
        print(f"[ERROR] Error updating doctor {doctor_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating doctor: {str(e)}"
        )
