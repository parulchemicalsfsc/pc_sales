from fastapi import APIRouter, Depends, HTTPException
from typing import List

from supabase_db import get_db, SupabaseClient
from models import Review
from rbac_utils import verify_permission

router = APIRouter()

@router.get("/", response_model=List[Review], dependencies=[Depends(verify_permission("view_reviews"))])
def get_all_reviews(db: SupabaseClient = Depends(get_db)):
    """Fetch all reviews."""
    try:
        response = db.table("reviews").select("*").order("date", desc=True).execute()
        return response.data or []
    except Exception as e:
        print(f"Error fetching reviews: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reviews.")

@router.delete("/{review_id}", dependencies=[Depends(verify_permission("delete_reviews"))])
def delete_review(review_id: int, db: SupabaseClient = Depends(get_db)):
    """Delete a review."""
    try:
        response = db.table("reviews").delete().eq("id", review_id).execute()
        return {"message": "Review deleted successfully"}
    except Exception as e:
        print(f"Error deleting review {review_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete review.")
