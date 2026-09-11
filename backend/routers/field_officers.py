from typing import Optional, List
import requests
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from models import FieldOfficer
from supabase_db import SupabaseClient, get_supabase, SUPABASE_URL, SUPABASE_KEY
from rbac_utils import verify_permission
from activity_logger import get_activity_logger

router = APIRouter()


@router.get("/", response_model=List[FieldOfficer], dependencies=[Depends(verify_permission("view_field_officers"))])
def get_field_officers(db: SupabaseClient = Depends(get_supabase)):
    """Get all field officers"""
    try:
        # Paginate to bypass Supabase's 1000-row server cap
        all_rows = []
        batch = 1000
        offset = 0
        while True:
            response = (
                db.table("field_officers")
                .select("*")
                .order("created_at", desc=True)
                .range(offset, offset + batch - 1)
                .execute()
            )
            if not response.data:
                break
            all_rows.extend(response.data)
            if len(response.data) < batch:
                break
            offset += batch

        return all_rows
    except Exception as e:
        print("❌ GET ERROR:", str(e))
        if "404" in str(e) or "Not Found" in str(e):
            return []
        raise HTTPException(
            status_code=500, detail=f"Error fetching field officers: {str(e)}"
        )


@router.post("/", dependencies=[Depends(verify_permission("create_field_officer"))])
def create_field_officer(
    field_officer: FieldOfficer,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Create a new field officer"""
    try:
        data = {
            "name": field_officer.name,
            "village": field_officer.village,
            "taluka": field_officer.taluka,
            "district": field_officer.district,
            "mantri_name": field_officer.mantri_name,
            "mantri_mobile": field_officer.mantri_mobile,
            "sabhasad_count": field_officer.sabhasad_count,
            "sabhasad_morning": field_officer.sabhasad_morning,
            "sabhasad_evening": field_officer.sabhasad_evening,
            "contact_in_group": field_officer.contact_in_group,
            "status": field_officer.status,
            "record_date": field_officer.record_date,
            "state": field_officer.state,
            "dairy_type": field_officer.dairy_type,
            "dairy_time_morning": field_officer.dairy_time_morning,
            "dairy_time_evening": field_officer.dairy_time_evening,
            "milk_collection_morning": field_officer.milk_collection_morning,
            "milk_collection_evening": field_officer.milk_collection_evening,
            "nature_of_sabhasad": field_officer.nature_of_sabhasad,
            "support": field_officer.support,
            "animal_delivery_period": field_officer.animal_delivery_period,
            "payment_recovery_demo": field_officer.payment_recovery_demo,
            "payment_recovery_dispatch": field_officer.payment_recovery_dispatch,
            "decision_maker_availability_morning": field_officer.decision_maker_availability_morning,
            "decision_maker_availability_evening": field_officer.decision_maker_availability_evening,
            "high_holder_to_low_holder_villages": field_officer.high_holder_to_low_holder_villages,
            "current_status_of_business": field_officer.current_status_of_business,
        }

        # Convert empty strings to None — Supabase rejects "" for typed columns
        cleaned_data = {}
        for k, v in data.items():
            if v == "" or v == " ":
                cleaned_data[k] = None
            else:
                cleaned_data[k] = v

        cleaned_data = {k: v for k, v in cleaned_data.items() if v is not None}

        response = db.table("field_officers").insert(cleaned_data).execute()

        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create field officer")

        if user_email:
            try:
                logger = get_activity_logger(db)
                logger.log_create(
                    user_email=user_email,
                    entity_type="field_officer",
                    entity_name=f"{field_officer.name or field_officer.village} - {field_officer.taluka}",
                    new_state=response.data[0] if response.data else None,
                )
            except Exception:
                pass

        return {
            "message": "Field Officer created successfully",
            "field_officer": response.data[0],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error creating field officer: {str(e)}"
        )


@router.put("/{field_officer_id}", dependencies=[Depends(verify_permission("edit_field_officer"))])
async def update_field_officer(
    field_officer_id: int,
    request: Request,
    field_officer: FieldOfficer,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Update an existing field officer"""
    try:
        update_data = {
            "name": field_officer.name,
            "village": field_officer.village,
            "taluka": field_officer.taluka,
            "district": field_officer.district,
            "mantri_name": field_officer.mantri_name,
            "mantri_mobile": field_officer.mantri_mobile,
            "sabhasad_count": field_officer.sabhasad_count,
            "sabhasad_morning": int(field_officer.sabhasad_morning or 0),
            "sabhasad_evening": int(field_officer.sabhasad_evening or 0),
            "status": field_officer.status,
            "contact_in_group": field_officer.contact_in_group,
            "record_date": field_officer.record_date,
            "state": field_officer.state,
            "dairy_type": field_officer.dairy_type,
            "dairy_time_morning": field_officer.dairy_time_morning,
            "dairy_time_evening": field_officer.dairy_time_evening,
            "milk_collection_morning": field_officer.milk_collection_morning,
            "milk_collection_evening": field_officer.milk_collection_evening,
            "nature_of_sabhasad": field_officer.nature_of_sabhasad,
            "support": field_officer.support,
            "animal_delivery_period": field_officer.animal_delivery_period,
            "payment_recovery_demo": field_officer.payment_recovery_demo,
            "payment_recovery_dispatch": field_officer.payment_recovery_dispatch,
            "decision_maker_availability_morning": field_officer.decision_maker_availability_morning,
            "decision_maker_availability_evening": field_officer.decision_maker_availability_evening,
            "high_holder_to_low_holder_villages": field_officer.high_holder_to_low_holder_villages,
            "current_status_of_business": field_officer.current_status_of_business,
        }

        for k, v in update_data.items():
            if v == "" or v == " ":
                update_data[k] = None

        update_data = {k: v for k, v in update_data.items() if v is not None}

        if not update_data:
            raise HTTPException(status_code=400, detail="No valid update data provided")

        current_res = db.table("field_officers").select("*").eq("field_officer_id", field_officer_id).execute()
        current_fo = current_res.data[0] if current_res.data else None

        response = (
            db.table("field_officers")
            .eq("field_officer_id", field_officer_id)
            .update(update_data)
            .execute()
        )

        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Field officer not found")

        if user_email and current_fo:
            try:
                logger = get_activity_logger(db)
                logger.log_update_with_diff(
                    user_email=user_email,
                    entity_type="field_officer",
                    entity_name=f"{field_officer.name or field_officer.village}",
                    entity_id=field_officer_id,
                    before=current_fo,
                    after=update_data,
                )
            except Exception as le:
                print(f"[ERROR] Failed to log update diff: {le}")

        return {
            "message": "Field officer updated successfully",
            "data": response.data[0],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error updating field officer: {str(e)}"
        )


@router.delete("/{field_officer_id}", dependencies=[Depends(verify_permission("edit_field_officer"))])
def delete_field_officer(
    field_officer_id: int,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Delete a field officer"""
    try:
        field_officer_id = int(field_officer_id)

        url = f"{SUPABASE_URL}/rest/v1/field_officers?field_officer_id=eq.{field_officer_id}"
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"
        }

        response = requests.delete(url, headers=headers)

        if response.status_code not in [200, 204]:
            raise HTTPException(status_code=500, detail=response.text)

        return {"message": "Field officer deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
