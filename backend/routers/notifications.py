"""
Notifications Router
Handles notification operations including creation, retrieval, and marking as read
"""

from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from models import Notification
from supabase_db import SupabaseClient, get_supabase

router = APIRouter()


@router.get("/")
def get_notifications(
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    limit: int = 50,
    offset: int = 0,
    is_read: Optional[bool] = None,
    notification_type: Optional[str] = None,
    db: SupabaseClient = Depends(get_supabase),
):
    """Get all notifications for a user"""
    try:
        # Build query
        query = db.table("notifications").select("*")

        # Filter by user email if provided (None means broadcast to all)
        if user_email:
            # Use OR filter to get both user-specific and broadcast notifications
            # Syntax: column.operator.value
            query = query.or_(f"user_email.eq.{user_email},user_email.is.null")
        
        # Filter by read status
        if is_read is not None:
            # Postgres boolean handling
            is_read_str = "true" if is_read else "false"
            query = query.eq("is_read", is_read)

        # Filter by type
        if notification_type:
            query = query.eq("notification_type", notification_type)

        # Order by most recent first
        query = query.order("created_at", desc=True)

        # Apply pagination
        query = query.limit(limit).offset(offset)

        response = query.execute()

        # Get unread count (efficiently)
        unread_query = db.table("notifications").select("notification_id", count="exact").eq("is_read", False)
        
        if user_email:
             unread_query = unread_query.or_(f"user_email.eq.{user_email},user_email.is.null")
             
        unread_response = unread_query.execute()
        # count is in unread_response.count if using count="exact", but supabase-py might return it differently
        # Let's fallback to length if count property isn't standard, but select count is better.
        # However, for safety with this client version, let's keep it simple but filtered.
        
        unread_count = len(unread_response.data) if unread_response.data else 0

        return {
            "data": response.data or [],
            "total": len(response.data or []), # This is page total, not grand total, but suffices for now
            "unread_count": unread_count,
            # "grand_total": count # if we wanted real pagination count
        }

    except Exception as e:
        print(f"Error fetching notifications: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching notifications: {str(e)}"
        )


@router.get("/unread-count")
def get_unread_count(
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_supabase),
):
    """Get count of unread notifications for a user"""
    try:
        query = db.table("notifications").select("notification_id", count="exact").eq("is_read", False)

        # Filter for user-specific and broadcast
        if user_email:
             query = query.or_(f"user_email.eq.{user_email},user_email.is.null")
             
        response = query.execute()
        
        # count is usually in count attribute if explicitly requested, or we can use len(data)
        # supabase-py wrapper I see earlier has "count" in SupabaseResponse
        count = response.count if response.count is not None else len(response.data or [])

        return {"count": count}

    except Exception as e:
        print(f"Error fetching unread count: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching unread count: {str(e)}"
        )


@router.get("/{notification_id}")
def get_notification(
    notification_id: int,
    db: SupabaseClient = Depends(get_supabase),
):
    """Get a single notification by ID"""
    try:
        response = (
            db.table("notifications")
            .select("*")
            .eq("notification_id", notification_id)
            .execute()
        )

        if not response.data:
            raise HTTPException(status_code=404, detail="Notification not found")

        return response.data[0]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching notification: {str(e)}"
        )


@router.post("/")
def create_notification(
    notification: Notification,
    db: SupabaseClient = Depends(get_supabase),
):
    """Create a new notification"""
    try:
        notification_data = {
            "user_email": notification.user_email,
            "title": notification.title,
            "message": notification.message,
            "notification_type": notification.notification_type,
            "entity_type": notification.entity_type,
            "entity_id": notification.entity_id,
            "action_url": notification.action_url,
            "is_read": False,
            "created_at": datetime.utcnow().isoformat(),
        }

        response = db.table("notifications").insert(notification_data).execute()

        if not response.data:
            raise HTTPException(status_code=400, detail="Failed to create notification")

        return {
            "message": "Notification created successfully",
            "notification": response.data[0],
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating notification: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error creating notification: {str(e)}"
        )


@router.put("/mark-all-read")
def mark_all_read(
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_supabase),
):
    """Mark all notifications as read for a user"""
    try:
        # Update all unread notifications for this user
        query = db.table("notifications").eq("is_read", False).update({"is_read": True})

        if user_email:
            query = query.eq("user_email", user_email)

        response = query.execute()

        count = len(response.data) if response.data else 0

        return {
            "message": f"Marked {count} notifications as read",
            "count": count,
        }

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error marking all as read: {str(e)}"
        )


@router.put("/{notification_id}/mark-read")
def mark_notification_read(
    notification_id: int,
    db: SupabaseClient = Depends(get_supabase),
):
    """Mark a notification as read"""
    try:
        response = (
            db.table("notifications")
            .update({"is_read": True})
            .eq("notification_id", notification_id)
            .execute()
        )

        if not response.data:
            raise HTTPException(status_code=404, detail="Notification not found")

        return {
            "message": "Notification marked as read",
            "notification": response.data[0],
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error marking notification as read: {str(e)}"
        )


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int,
    db: SupabaseClient = Depends(get_supabase),
):
    """Delete a notification"""
    try:
        response = (
            db.table("notifications")
            .delete()
            .eq("notification_id", notification_id)
            .execute()
        )

        if not response.data:
            raise HTTPException(status_code=404, detail="Notification not found")

        return {"message": "Notification deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error deleting notification: {str(e)}"
        )


@router.delete("/delete-old")
def delete_old_notifications(
    days_old: int = 30,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_supabase),
):
    """Delete read notifications older than specified days"""
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=days_old)

        query = (
            db.table("notifications")
            .delete()
            .eq("is_read", True)
            .lt("created_at", cutoff_date.isoformat())
        )

        if user_email:
            query = query.eq("user_email", user_email)

        response = query.execute()

        count = len(response.data) if response.data else 0

        return {
            "message": f"Deleted {count} old notifications",
            "count": count,
        }

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error deleting old notifications: {str(e)}"
        )


# ======================
# Notification Helper Functions
# ======================


def create_notification_helper(
    db: SupabaseClient,
    title: str,
    message: str,
    notification_type: str,
    user_email: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    action_url: Optional[str] = None,
):
    """Helper function to create a notification (can be called from other routers)"""
    try:
        notification_data = {
            "user_email": user_email,
            "title": title,
            "message": message,
            "notification_type": notification_type,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action_url": action_url,
            "is_read": False,
            "created_at": datetime.utcnow().isoformat(),
        }

        db.table("notifications").insert(notification_data).execute()
        return True
    except Exception as e:
        print(f"Error creating notification: {str(e)}")
        return False
