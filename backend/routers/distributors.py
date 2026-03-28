from fastapi import APIRouter, Depends, HTTPException
from models import Distributor
from supabase_db import SupabaseClient, get_supabase
from rbac_utils import verify_permission

router = APIRouter()


@router.get("/", dependencies=[Depends(verify_permission("view_distributors"))])
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
        raise HTTPException(
            status_code=500, detail=f"Error fetching distributors: {str(e)}"
        )


@router.post("/", dependencies=[Depends(verify_permission("create_distributor"))])
def create_distributor(
    distributor: Distributor,
    db: SupabaseClient = Depends(get_supabase),
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
        }

        response = db.table("distributors").insert(distributor_data).execute()

        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create distributor")

        return {
            "message": "Distributor created successfully",
            "distributor": response.data[0],
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error creating distributor: {str(e)}"
        )


@router.put("/{distributor_id}", dependencies=[Depends(verify_permission("edit_distributor"))])
def update_distributor(
    distributor_id: int,
    distributor: Distributor,
    db: SupabaseClient = Depends(get_supabase),
):
    """Update an existing distributor"""
    try:
        # Prepare data for update
        update_data = {
            "name": distributor.name,
            "village": distributor.village,
            "taluka": distributor.taluka,
            "district": distributor.district,
            "mantri_name": distributor.mantri_name,
            "mantri_mobile": distributor.mantri_mobile,
            "sabhasad_morning": int(distributor.sabhasad_morning or 0),
            "sabhasad_evening": int(distributor.sabhasad_evening or 0),
            "status": distributor.status,
            "contact_in_group": distributor.contact_in_group,
        }

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

        return {
            "message": "Distributor updated successfully",
            "data": response.data[0],
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Error updating distributor {distributor_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating distributor: {str(e)}"
        )
