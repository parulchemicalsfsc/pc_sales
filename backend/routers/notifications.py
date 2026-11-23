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
        # Check and trigger notifications for due follow-up callbacks
        if user_email:
            check_and_notify_due_callbacks(db, user_email)

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
        if user_email:
            check_and_notify_due_callbacks(db, user_email)

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
            .eq("notification_id", notification_id)
            .update({"is_read": True})
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
            .eq("notification_id", notification_id)
            .delete()
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


def check_and_notify_due_callbacks(db: SupabaseClient, user_email: str) -> int:
    """
    Checks if there are any scheduled callbacks due today or overdue for this user.
    Creates notifications in the `notifications` table if not already notified today.
    Returns the count of new notifications created.
    """
    if not user_email:
        return 0
    try:
        user_email = user_email.strip()
        import pytz
        today_ist = datetime.now(pytz.timezone("Asia/Kolkata")).date().isoformat()  # YYYY-MM-DD
        today_start_utc = (
            datetime.now(pytz.timezone("Asia/Kolkata"))
            .replace(hour=0, minute=0, second=0, microsecond=0)
            .astimezone(pytz.utc)
            .isoformat()
        )

        # 1. Fetch pending scheduled callbacks for this user
        cb_res = (
            db.table("calling_assignments")
            .select("assignment_id, customer_id, entity_type, assigned_date, notes")
            .eq("user_email", user_email)
            .eq("status", "Pending")
            .eq("reason", "Scheduled Callback")
            .execute()
        )

        callbacks = cb_res.data or []
        if not callbacks:
            return 0

        due_callbacks = []
        for cb in callbacks:
            raw_ad = (cb.get("assigned_date") or "").strip()
            ad = raw_ad[:10]
            # Match if scheduled on or before today
            if ad and ad <= today_ist:
                due_callbacks.append(cb)

        if not due_callbacks:
            return 0

        # 2. Check which assignments already received a due notification today
        due_assignment_ids = [c["assignment_id"] for c in due_callbacks]
        notif_res = (
            db.table("notifications")
            .select("entity_id")
            .eq("user_email", user_email)
            .eq("entity_type", "calling_assignment")
            .in_("entity_id", due_assignment_ids)
            .gte("created_at", today_start_utc)
            .execute()
        )

        already_notified_ids = set([n["entity_id"] for n in (notif_res.data or []) if n.get("entity_id") is not None])
        to_notify = [c for c in due_callbacks if c["assignment_id"] not in already_notified_ids]
        if not to_notify:
            return 0

        # 3. Enrich customer/distributor details
        cust_ids = list(set([c["customer_id"] for c in to_notify if c.get("customer_id")]))
        name_map = {}
        if cust_ids:
            try:
                c_res = db.table("customers").select("customer_id, name, village, mobile").in_("customer_id", cust_ids).execute()
                for c in (c_res.data or []):
                    name_map[("customer", c["customer_id"])] = c
            except Exception:
                pass
            try:
                d_res = db.table("distributors").select("distributor_id, mantri_name, village, mantri_mobile").in_("distributor_id", cust_ids).execute()
                for d in (d_res.data or []):
                    name_map[("distributor", d["distributor_id"])] = {
                        "name": d.get("mantri_name"),
                        "village": d.get("village"),
                        "mobile": d.get("mantri_mobile"),
                    }
            except Exception:
                pass

        created_count = 0
        import re
        for cb in to_notify:
            cid = cb.get("customer_id")
            etype = cb.get("entity_type") or "customer"
            entity_info = name_map.get((etype, cid)) or name_map.get(("customer", cid)) or name_map.get(("distributor", cid)) or {}
            c_name = entity_info.get("name") or f"Customer #{cid}"
            village = entity_info.get("village")
            loc_str = f" ({village})" if village else ""

            raw_date = cb.get("assigned_date") or ""
            time_part = ""
            if "T" in raw_date and len(raw_date) >= 16:
                time_part = f" at {raw_date[11:16]}"
            elif cb.get("notes") and "[Time:" in cb["notes"]:
                tm = re.search(r"\[Time:\s*(\d{1,2}:\d{2})\]", cb["notes"])
                if tm:
                    time_part = f" at {tm.group(1)}"

            is_overdue = (raw_date[:10] < today_ist) if raw_date else False
            status_text = "Overdue" if is_overdue else "Due Today"

            title = f"🔔 Follow-Up Call {status_text}: {c_name}"
            msg = f"Scheduled follow-up call with {c_name}{loc_str}{time_part}. Tap to view and call."

            create_notification_helper(
                db=db,
                title=title,
                message=msg,
                notification_type="callback_due",
                user_email=user_email,
                entity_type="calling_assignment",
                entity_id=cb["assignment_id"],
                action_url=f"/calling-list?tab=2&open={cb['assignment_id']}",
            )
            created_count += 1

        return created_count
    except Exception as e:
        print(f"Error checking due callbacks: {str(e)}")
        return 0
