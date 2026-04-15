"""
Admin Router
Handles admin-only operations including activity logs and user management
"""

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from activity_logger import get_activity_logger
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from supabase_db import SupabaseClient, get_db, get_supabase, get_supabase_admin
from models import UserCreate
from rbac_utils import verify_admin_role, verify_permission, clear_user_permission_cache
router = APIRouter()

# Legacy admin verify replaced by dynamic RBAC — kept for reference
# ADMIN_EMAIL = "admin@gmail.com"

@router.get("/my-logs")
def get_my_activity_logs(
    date: Optional[str] = None,
    limit: int = 100,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Get activity logs for the requesting user.
    """
    try:
        if not user_email:
            raise HTTPException(status_code=401, detail="Not authenticated")

        target_date = date or datetime.now().strftime("%Y-%m-%d")
        
        # Convert IST to UTC range for Supabase filtering
        ist = timezone(timedelta(hours=5, minutes=30))
        target_dt = datetime.strptime(target_date, "%Y-%m-%d")
        start_ist = target_dt.replace(tzinfo=ist, hour=0, minute=0, second=0, microsecond=0)
        end_ist = target_dt.replace(tzinfo=ist, hour=23, minute=59, second=59, microsecond=999999)
        
        # Use strftime with 'Z' suffix to avoid URL-encoding issues with '+00:00'
        normalized_start = start_ist.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        normalized_end = end_ist.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

        query = (
            db.table("activity_logs")
            .select("*")
            .eq("user_email", user_email)
            .gte("created_at", normalized_start)
            .lte("created_at", normalized_end)
            .order("created_at", desc=True)
            .limit(limit)
        )
        response = query.execute()

        return {
            "logs": response.data or [],
            "date": target_date,
            "total": len(response.data or [])
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching activity logs: {str(e)}")

@router.get("/health")
def health():
    """Health check endpoint"""
    return {"status": "ok"}


@router.get("/check-status")
def check_user_status(
    email: str,
    db: SupabaseClient = Depends(get_db),
):
    """
    Lightweight active-status check for login enforcement.
    Called immediately after Supabase Auth sign-in succeeds on the frontend.
    No permission guard — the caller just authenticated with Supabase.
    Returns whether this user's app_users record is active.
    """
    try:
        res = db.table("app_users").select("is_active, name").eq("email", email).execute()
        if not res.data:
            # User not yet in app_users — treat as inactive (shouldn't happen in normal flow)
            return {"is_active": False, "reason": "user_not_found"}
        return {"is_active": res.data[0].get("is_active", True)}
    except Exception as e:
        # Fail open so a DB error doesn't permanently lock everyone out
        print(f"[WARN] check-status error for {email}: {e}")
        return {"is_active": True}


@router.get("/activity-logs", dependencies=[Depends(verify_permission("view_activity_logs"))])
def get_activity_logs(
    limit: int = 100,
    offset: int = 0,
    user_email: Optional[str] = None,
    action_type: Optional[str] = None,
    entity_type: Optional[str] = None,
    selected_date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    admin_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Get activity logs with filtering and pagination
    Only accessible by admin users
    """
    try:
        print(f"[DEBUG] Admin activity logs request - limit: {limit}, offset: {offset}, selected_date: {selected_date}")

        normalized_start = None
        normalized_end = None
        if selected_date:
            # Convert selected IST date to UTC range for Supabase filtering
            ist = timezone(timedelta(hours=5, minutes=30))
            selected_dt = datetime.strptime(selected_date, "%Y-%m-%d")
            start_ist = selected_dt.replace(tzinfo=ist, hour=0, minute=0, second=0, microsecond=0)
            end_ist = selected_dt.replace(tzinfo=ist, hour=23, minute=59, second=59, microsecond=999999)
            
            # Use strftime with 'Z' suffix instead of .isoformat() to avoid URL-encoding
            # issues where '+00:00' gets the '+' decoded as a space, breaking the filter
            normalized_start = start_ist.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
            normalized_end = end_ist.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
            print(f"[DEBUG] Date filter: {selected_date} IST -> UTC range: {normalized_start} to {normalized_end}")
        elif start_date:
            normalized_start = f"{start_date}T00:00:00Z" if len(start_date) == 10 else start_date
        if end_date:
            normalized_end = f"{end_date}T23:59:59.999999Z" if len(end_date) == 10 else end_date

        # Start with base query - exclude admin's VIEW activities
        query = db.table("activity_logs").select("*")
        # Filter out admin viewing activity logs
        query = query.neq("user_email", admin_email).neq("action_type", "VIEW")
        print("[DEBUG] Base query created")

        # Build count query separately
        count_query = db.table("activity_logs").select("*", count="exact")
        # Apply same filters to count query
        count_query = count_query.neq("user_email", admin_email).neq(
            "action_type", "VIEW"
        )

        # Apply filters to both queries
        if user_email:
            query = query.eq("user_email", user_email)
            count_query = count_query.eq("user_email", user_email)

        if action_type:
            query = query.eq("action_type", action_type)
            count_query = count_query.eq("action_type", action_type)

        if entity_type:
            query = query.eq("entity_type", entity_type)
            count_query = count_query.eq("entity_type", entity_type)

        if normalized_start:
            query = query.gte("created_at", normalized_start)
            count_query = count_query.gte("created_at", normalized_start)

        if normalized_end:
            query = query.lte("created_at", normalized_end)
            count_query = count_query.lte("created_at", normalized_end)

        # Order by most recent first
        query = query.order("created_at", desc=True)

        # Apply pagination
        if limit and offset is not None:
            query = query.range(offset, offset + limit - 1)
        elif limit:
            query = query.limit(limit)

        # Execute queries
        print("[DEBUG] Executing main query...")
        response = query.execute()
        print(
            f"[DEBUG] Main query executed successfully, got {len(response.data) if response.data else 0} records"
        )

        print("[DEBUG] Executing count query...")
        count_response = count_query.execute()
        print(f"[DEBUG] Count query executed successfully")

        # Get total count from response
        # Priority: 1. count attribute, 2. data length, 3. default to 0
        total = 0
        if hasattr(count_response, "count") and count_response.count is not None:
            total = count_response.count
            print(f"[DEBUG] Using count attribute: {total}")
        elif count_response.data:
            total = len(count_response.data)
            print(f"[DEBUG] Using data length: {total}")
        else:
            total = 0
            print(f"[DEBUG] No count or data, using default: {total}")

        # Don't log admin viewing activity logs to avoid clutter

        return {
            "data": response.data or [],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    except Exception as e:
        # Print detailed error for debugging
        print(f"[ERROR] Error in get_activity_logs: {type(e).__name__}: {str(e)}")
        print(f"[ERROR] Exception details: {repr(e)}")
        import traceback

        print("[ERROR] Full traceback:")
        traceback.print_exc()

        error_msg = str(e).lower()
        print(f"[ERROR] Error message (lowercase): {error_msg}")

        # Check if it's a table not found error
        if "relation" in error_msg and "does not exist" in error_msg:
            raise HTTPException(
                status_code=500,
                detail="Activity logs table does not exist. Please run the database migration: backend/migrations/001_create_activity_logs.sql in your Supabase SQL Editor.",
            )
        elif "table" in error_msg or "column" in error_msg:
            raise HTTPException(
                status_code=500,
                detail=f"Database schema error: {str(e)}. Please ensure the activity_logs table is created correctly.",
            )
        else:
            raise HTTPException(
                status_code=500, detail=f"Error fetching activity logs: {str(e)}"
            )


@router.get("/activity-logs/stats", dependencies=[Depends(verify_permission("view_activity_logs"))])
def get_activity_stats(
    days: int = 30,
    admin_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Get activity statistics
    Only accessible by admin users
    """
    try:
        # Calculate date range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)

        # Get all activities in date range
        response = (
            db.table("activity_logs")
            .select("*")
            .gte("created_at", start_date.isoformat())
            .lte("created_at", end_date.isoformat())
            .execute()
        )

        activities = response.data or []

        # Calculate statistics
        stats = {
            "total_activities": len(activities),
            "date_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
                "days": days,
            },
            "by_user": {},
            "by_action_type": {},
            "by_entity_type": {},
            "recent_users": [],
        }

        # Group by user
        user_activity_count = {}
        for activity in activities:
            user_email = activity.get("user_email", "unknown")
            user_activity_count[user_email] = user_activity_count.get(user_email, 0) + 1

        stats["by_user"] = user_activity_count

        # Group by action type
        action_type_count = {}
        for activity in activities:
            action_type = activity.get("action_type", "unknown")
            action_type_count[action_type] = action_type_count.get(action_type, 0) + 1

        stats["by_action_type"] = action_type_count

        # Group by entity type
        entity_type_count = {}
        for activity in activities:
            entity_type = activity.get("entity_type")
            if entity_type:
                entity_type_count[entity_type] = (
                    entity_type_count.get(entity_type, 0) + 1
                )

        stats["by_entity_type"] = entity_type_count

        # Get list of recent active users
        recent_users = list(
            set([a.get("user_email") for a in activities if a.get("user_email")])
        )
        stats["recent_users"] = recent_users[:10]  # Top 10 recent users

        return stats

    except Exception as e:
        error_msg = str(e).lower()
        if "relation" in error_msg and "does not exist" in error_msg:
            raise HTTPException(
                status_code=500,
                detail="Activity logs table does not exist. Please run the database migration first.",
            )
        else:
            raise HTTPException(
                status_code=500, detail=f"Error fetching activity stats: {str(e)}"
            )


@router.get("/users", dependencies=[Depends(verify_permission("manage_users"))])
def get_all_users(
    admin_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Get list of all users from activity logs
    Only accessible by admin users
    """
    try:
        # Get distinct user emails from activity logs
        response = db.table("activity_logs").select("user_email").execute()

        if not response.data:
            return {"users": []}

        # Get unique users
        users = list(
            set(
                [item["user_email"] for item in response.data if item.get("user_email")]
            )
        )

        # Get user activity counts
        user_details = []
        for user_email in users:
            user_activities = (
                db.table("activity_logs")
                .select("*")
                .eq("user_email", user_email)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )

            last_activity = user_activities.data[0] if user_activities.data else None

            # Count total activities
            count_response = (
                db.table("activity_logs")
                .select("id", count="exact")
                .eq("user_email", user_email)
                .execute()
            )

            user_details.append(
                {
                    "email": user_email,
                    "total_activities": len(count_response.data)
                    if count_response.data
                    else 0,
                    "last_activity": last_activity.get("created_at")
                    if last_activity
                    else None,
                    "last_action": last_activity.get("action_description")
                    if last_activity
                    else None,
                }
            )

        # Sort by most active
        user_details.sort(key=lambda x: x["total_activities"], reverse=True)

        return {"users": user_details}

    except Exception as e:
        error_msg = str(e).lower()
        if "relation" in error_msg and "does not exist" in error_msg:
            raise HTTPException(
                status_code=500,
                detail="Activity logs table does not exist. Please run the database migration first.",
            )
        else:
            raise HTTPException(
                status_code=500, detail=f"Error fetching users: {str(e)}"
            )



@router.get("/app-users", dependencies=[Depends(verify_permission("view_users"))])
def get_app_users(
    status: Optional[str] = "all",
    admin_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Get users from the app_users table with their roles.
    Requires 'view_users' permission.
    Optional ?status=active|inactive|all (default: all)
    """
    try:
        query = db.table("app_users").select("*").order("created_at", desc=True)
        if status == "active":
            query = query.eq("is_active", True)
        elif status == "inactive":
            query = query.eq("is_active", False)

        response = query.execute()

        users = []
        for u in (response.data or []):
            users.append({
                "id": u.get("user_id"),
                "email": u.get("email", ""),
                "name": u.get("name", ""),
                "role": u.get("role", ""),
                "is_active": u.get("is_active", True),
                "created_at": u.get("created_at", ""),
            })

        return {"users": users}

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching users: {str(e)}"
        )


@router.delete("/activity-logs/{log_id}", dependencies=[Depends(verify_permission("manage_activity_logs"))])
def delete_activity_log(
    log_id: int,
    admin_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Delete a specific activity log
    Only accessible by admin users
    """
    try:
        response = db.table("activity_logs").eq("id", log_id).delete().execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Activity log not found")

        return {"message": "Activity log deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error deleting activity log: {str(e)}"
        )


@router.delete("/activity-logs/bulk", dependencies=[Depends(verify_permission("manage_activity_logs"))])
def delete_old_activity_logs(
    days_old: int = 90,
    admin_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Delete activity logs older than specified days
    Only accessible by admin users
    """
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=days_old)

        response = (
            db.table("activity_logs")
            .lt("created_at", cutoff_date.isoformat())
            .delete()
            .execute()
        )

        deleted_count = len(response.data) if response.data else 0

        # Log this admin action
        logger = get_activity_logger(db)
        logger.log_activity(
            user_email=admin_email,
            action_type="DELETE",
            action_description=f"Deleted activity logs older than {days_old} days",
            entity_type="admin",
            metadata={"days_old": days_old, "deleted_count": deleted_count},
        )

        return {
            "message": f"Deleted {deleted_count} old activity logs",
            "deleted_count": deleted_count,
            "cutoff_date": cutoff_date.isoformat(),
        }

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error deleting old activity logs: {str(e)}"
        )


@router.put("/update-product-price/{product_id}", dependencies=[Depends(verify_permission("manage_pricing"))])
def update_product_price(
    product_id: int,
    price_data: dict,
    admin_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Update the default price for a product
    Only accessible by admin users
    """
    try:
        standard_rate = price_data.get("standard_rate")
        rate_gujarat = price_data.get("rate_gujarat")
        rate_maharashtra = price_data.get("rate_maharashtra")
        rate_mp = price_data.get("rate_mp")
        
        update_data = {}
        if standard_rate is not None:
            update_data["standard_rate"] = standard_rate
        if rate_gujarat is not None:
             update_data["rate_gujarat"] = rate_gujarat
        if rate_maharashtra is not None:
             update_data["rate_maharashtra"] = rate_maharashtra
        if "custom_rates" in price_data:
             update_data["custom_rates"] = price_data["custom_rates"]

        if not update_data:
             raise HTTPException(
                status_code=400, detail="At least one price field is required"
             )

        # Fetch current state before update for diff logging
        current_res = db.table("products").select("*").eq("product_id", product_id).execute()
        current_product = current_res.data[0] if current_res.data else None

        # Update the product price
        response = (
            db.table("products")
            .eq("product_id", product_id)
            .update(update_data)
            .execute()
        )

        if not response.data or len(response.data) == 0:
            raise HTTPException(status_code=404, detail="Product not found")

        product = response.data[0]

        # Log this admin action
        logger = get_activity_logger(db)
        if current_product:
            logger.log_update_with_diff(
                user_email=admin_email,
                entity_type="product",
                entity_name=product.get("product_name", "Unknown"),
                entity_id=product_id,
                before=current_product,
                after={**current_product, **update_data},
                extra_metadata={"new_rates": update_data},
            )
        else:
            logger.log_activity(
                user_email=admin_email,
                action_type="UPDATE",
                action_description=f"Updated price for product '{product.get('product_name', 'Unknown')}'",
                entity_type="product",
                entity_id=product_id,
                entity_name=product.get("product_name"),
                metadata={"new_rates": update_data},
            )

        return {
            "message": "Product price updated successfully",
            "data": product,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error updating product price: {str(e)}"
        )


@router.post("/update-product-prices-bulk", dependencies=[Depends(verify_permission("manage_pricing"))])
def update_product_prices_bulk(
    bulk_data: dict,
    admin_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Update multiple product prices at once
    Only accessible by admin users
    """
    try:
        updates = bulk_data.get("updates", [])
        
        if not updates:
            raise HTTPException(
                status_code=400, detail="No updates provided"
            )

        updated_count = 0
        errors = []

        for update in updates:
            product_id = update.get("product_id")
            
            update_data = {}
            if "standard_rate" in update: update_data["standard_rate"] = update["standard_rate"]
            if "rate_gujarat" in update: update_data["rate_gujarat"] = update["rate_gujarat"]
            if "rate_maharashtra" in update: update_data["rate_maharashtra"] = update["rate_maharashtra"]
            if "rate_mp" in update: update_data["rate_mp"] = update["rate_mp"]

            if "custom_rates" in update: update_data["custom_rates"] = update["custom_rates"]

            if product_id is None or not update_data:
                errors.append(f"Invalid update data: {update}")
                continue

            try:
                response = (
                    db.table("products")
                    .eq("product_id", product_id)
                    .update(update_data)
                    .execute()
                )

                if response.data and len(response.data) > 0:
                    updated_count += 1
                else:
                    errors.append(f"Product {product_id} not found")

            except Exception as e:
                errors.append(f"Error updating product {product_id}: {str(e)}")

        # Log this admin action
        logger = get_activity_logger(db)
        logger.log_activity(
            user_email=admin_email,
            action_type="UPDATE",
            action_description=f"Bulk updated prices for {updated_count} products",
            entity_type="product",
            metadata={
                "updated_count": updated_count,
                "total_requested": len(updates),
                "errors": errors if errors else None,
            },
        )

        return {
            "message": f"Successfully updated {updated_count} product prices",
            "updated_count": updated_count,
            "total_requested": len(updates),
            "errors": errors if errors else None,
        }

    except HTTPException:
        raise
        raise HTTPException(
            status_code=500, detail=f"Error updating product prices: {str(e)}"
        )


@router.post("/users", dependencies=[Depends(verify_permission("create_user"))])
def create_user(
    user: UserCreate,
    admin_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Create a new user with a specific role.
    Only accessible by users with 'create_user' permission.
    Cannot create users with the 'admin' role.
    """
    try:
        # Normalize role key
        normalized_role = user.role.lower().replace(" ", "_")

        # Block creation of admin accounts
        if normalized_role == "admin":
            raise HTTPException(
                status_code=400,
                detail="Cannot create users with the 'admin' role."
            )

        # Use the official supabase-py client (has .auth.admin) — NOT our custom REST client
        from supabase_db import get_supabase_admin
        supabase_admin = get_supabase_admin()

        # Create user in Supabase Auth using the Admin API
        result = supabase_admin.auth.admin.create_user({
            "email": user.email,
            "password": user.password,
            "email_confirm": True,
            "user_metadata": {"role": user.role}
        })

        if not result or not result.user:
            raise HTTPException(status_code=500, detail="Failed to create user in Supabase Auth")

        # Display name: use provided name, fall back to email
        display_name = (user.name or "").strip() or user.email

        # Register in app_users table (source of truth for RBAC)
        try:
            db.table("app_users").insert({
                "email": user.email,
                "name": display_name,
                "role": normalized_role,
                "is_active": True,
            }).execute()
        except Exception as app_users_err:
            print(f"[WARN] Could not insert into app_users: {app_users_err}")

        # Log activity
        logger = get_activity_logger(db)
        logger.log_activity(
            user_email=admin_email or "system",
            action_type="CREATE_USER",
            action_description=f"Created new user {user.email} ({display_name}) with role {normalized_role}",
            entity_type="user",
            entity_id=None,
            metadata={"new_user_email": user.email, "name": display_name, "role": normalized_role}
        )

        return {"message": "User created successfully", "user": {"email": user.email, "name": display_name, "role": normalized_role}}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# User Management — Activate / Deactivate / Edit / Password / Role
# ─────────────────────────────────────────────────────────────────────────────

@router.patch("/users/{target_email}/status", dependencies=[Depends(verify_permission("manage_users"))])
def set_user_status(
    target_email: str,
    body: dict,
    admin_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Activate or deactivate a user account.
    Requires 'manage_users' permission. Cannot deactivate yourself.
    """
    try:
        if target_email == admin_email:
            raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")

        is_active = body.get("is_active")
        if is_active is None:
            raise HTTPException(status_code=400, detail="'is_active' field is required.")

        response = db.table("app_users").eq("email", target_email).update({"is_active": is_active}).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="User not found.")

        # Evict target user's permission cache — their next request re-fetches from DB
        clear_user_permission_cache(target_email)

        action_word = "Activated" if is_active else "Deactivated"
        logger = get_activity_logger(db)
        logger.log_activity(
            user_email=admin_email or "system",
            action_type="UPDATE",
            action_description=f"{action_word} user account: {target_email}",
            entity_type="user",
            entity_name=target_email,
            metadata={"action": "activate" if is_active else "deactivate", "target_email": target_email}
        )

        return {"message": f"User account {action_word.lower()} successfully."}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating user status: {str(e)}")


@router.patch("/users/{target_email}/profile", dependencies=[Depends(verify_permission("manage_users"))])
def update_user_profile(
    target_email: str,
    body: dict,
    admin_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Update a user's display name.
    Requires 'manage_users' permission.
    """
    try:
        name = (body.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="'name' field is required and cannot be empty.")

        response = db.table("app_users").eq("email", target_email).update({"name": name}).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="User not found.")

        logger = get_activity_logger(db)
        logger.log_activity(
            user_email=admin_email or "system",
            action_type="UPDATE",
            action_description=f"Updated display name for user {target_email}",
            entity_type="user",
            entity_name=target_email,
            metadata={"field": "name", "new_name": name, "target_email": target_email}
        )

        return {"message": "User name updated successfully."}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating user profile: {str(e)}")


@router.patch("/users/{target_email}/password", dependencies=[Depends(verify_permission("manage_users"))])
def reset_user_password(
    target_email: str,
    body: dict,
    admin_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Reset a user's password directly via Supabase Auth Admin API.
    Requires 'manage_users' permission.
    """
    try:
        new_password = (body.get("new_password") or "").strip()
        if len(new_password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

        supabase_admin = get_supabase_admin()

        # Find the Supabase Auth UID by iterating pages of users
        auth_uid = None
        page = 1
        while True:
            page_result = supabase_admin.auth.admin.list_users(page=page, per_page=1000)
            users_list = page_result if isinstance(page_result, list) else getattr(page_result, "users", [])
            if not users_list:
                break
            for u in users_list:
                if getattr(u, "email", None) == target_email:
                    auth_uid = str(u.id)
                    break
            if auth_uid or len(users_list) < 1000:
                break
            page += 1

        if not auth_uid:
            raise HTTPException(status_code=404, detail=f"User '{target_email}' not found in Supabase Auth.")

        supabase_admin.auth.admin.update_user_by_id(auth_uid, {"password": new_password})

        logger = get_activity_logger(db)
        logger.log_activity(
            user_email=admin_email or "system",
            action_type="UPDATE",
            action_description=f"Reset password for user {target_email}",
            entity_type="user",
            entity_name=target_email,
            metadata={"action": "password_reset", "target_email": target_email}
        )

        return {"message": "Password reset successfully."}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error resetting password: {str(e)}")


@router.patch("/users/{target_email}/role", dependencies=[Depends(verify_permission("manage_users"))])
def update_user_role(
    target_email: str,
    body: dict,
    admin_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Change a user's role. Cannot assign 'admin' or 'developer' roles.
    Requires 'manage_users' permission. Cache-invalidates the target user.
    """
    try:
        new_role = (body.get("role") or "").strip().lower().replace(" ", "_")
        if not new_role:
            raise HTTPException(status_code=400, detail="'role' field is required.")

        if new_role in ("admin", "developer"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot assign the '{new_role}' role via user management."
            )

        # Verify target role exists in DB
        role_res = db.table("roles").select("role_key").eq("role_key", new_role).execute()
        if not role_res.data:
            raise HTTPException(status_code=400, detail=f"Role '{new_role}' does not exist.")

        # Get current role for the activity log
        current_res = db.table("app_users").select("role").eq("email", target_email).execute()
        if not current_res.data:
            raise HTTPException(status_code=404, detail="User not found.")
        old_role = current_res.data[0].get("role", "unknown")

        db.table("app_users").eq("email", target_email).update({"role": new_role}).execute()

        # Invalidate the user's permission cache — their next API call re-fetches
        clear_user_permission_cache(target_email)

        logger = get_activity_logger(db)
        logger.log_activity(
            user_email=admin_email or "system",
            action_type="UPDATE",
            action_description=f"Changed role for {target_email}: {old_role} → {new_role}",
            entity_type="user",
            entity_name=target_email,
            metadata={"old_role": old_role, "new_role": new_role, "target_email": target_email}
        )

        return {"message": f"User role updated to '{new_role}' successfully."}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating user role: {str(e)}")


@router.get("/user-sessions", dependencies=[Depends(verify_permission("view_activity_logs"))])
def get_all_user_sessions(
    date: Optional[str] = None,
    db: SupabaseClient = Depends(get_db),
):
    """Get total session time for all users for a specific date (defaults to today IST)"""
    try:
        if not date:
            ist_now = datetime.utcnow() + timedelta(hours=5, minutes=30)
            date = ist_now.strftime("%Y-%m-%d")
        
        response = (
            db.table("user_sessions")
            .select("user_email, total_seconds")
            .eq("session_date", date)
            .order("total_seconds", desc=True)
            .execute()
        )
        return {"data": response.data or [], "date": date}
    except Exception as e:
        error_msg = str(e).lower()
        if "relation" in error_msg and "does not exist" in error_msg:
             return {"data": [], "date": date, "error": "Table user_sessions does not exist yet."}
        raise HTTPException(status_code=500, detail=f"Error fetching user sessions: {str(e)}")


@router.get("/user-sessions/history", dependencies=[Depends(verify_permission("view_activity_logs"))])
def get_user_session_history(
    email: str,
    db: SupabaseClient = Depends(get_db),
):
    """Get historical session times for a specific user to render contribution calendar"""
    try:
        response = (
            db.table("user_sessions")
            .select("session_date, total_seconds")
            .eq("user_email", email)
            .order("session_date", desc=True)
            .execute()
        )
        return {"data": response.data or [], "user_email": email}
    except Exception as e:
        error_msg = str(e).lower()
        if "relation" in error_msg and "does not exist" in error_msg:
             return {"data": [], "user_email": email, "error": "Table user_sessions does not exist yet."}
        raise HTTPException(status_code=500, detail=f"Error fetching user session history: {str(e)}")
