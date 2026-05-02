"""
RBAC Router
-----------
Endpoints:
  GET  /api/rbac/my-permissions           → returns calling user's permissions (used by frontend on login)
  GET  /api/rbac/roles                    → list all roles (admin only)
  GET  /api/rbac/permissions              → list all permissions grouped by module (admin only)
  GET  /api/rbac/roles/{role_id}/permissions → permission IDs for a role (admin only)
  PUT  /api/rbac/roles/{role_id}/permissions → replace role's permissions (admin only)
  POST /api/rbac/roles                    → create a new role (admin only)
  DELETE /api/rbac/roles/{role_id}        → delete a non-system role (admin only)
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException
from supabase_db import SupabaseClient, get_db
from rbac_utils import get_user_permissions, clear_user_permission_cache, verify_admin_role

router = APIRouter()


# ─── User-facing ──────────────────────────────────────────────────────────────

@router.get("/my-permissions")
def get_my_permissions(
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """
    Single login endpoint — returns everything the frontend needs in one call:
      - is_active  : whether the account is allowed to log in
      - role       : the user's role key
      - permissions: full permission set

    Replaces the old two-call pattern (check-status + my-permissions).
    Clears stale cache so permissions are always fresh at login.
    """
    if not user_email:
        raise HTTPException(status_code=401, detail="Missing x-user-email header.")

    # ── Single query: get role + active status together ───────────────────────
    user_res = db.table("app_users").select("role, is_active").eq("email", user_email).execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="User not found in app_users.")

    user_row = user_res.data[0]
    is_active = user_row.get("is_active", True)
    role_key = user_row.get("role", "unknown")

    if not is_active:
        raise HTTPException(status_code=403, detail="ACCOUNT_DEACTIVATED")

    # ── Fetch permissions (uses permission_keys[] fast path if migration ran) ─
    clear_user_permission_cache(user_email)
    permissions = get_user_permissions(user_email, db)

    return {
        "email": user_email,
        "role": role_key,
        "is_active": is_active,
        "permissions": sorted(list(permissions)),
    }


# ─── Admin: Roles ─────────────────────────────────────────────────────────────

@router.get("/roles")
def get_all_roles(
    admin_email: str = Depends(verify_admin_role()),
    db: SupabaseClient = Depends(get_db),
):
    """List all roles with their permission counts."""
    roles_res = db.table("roles").select("*").order("role_id").execute()
    rp_res = db.table("role_permissions").select("role_id").execute()

    # Count permissions per role
    counts: dict = {}
    for rp in (rp_res.data or []):
        rid = rp["role_id"]
        counts[rid] = counts.get(rid, 0) + 1

    result = []
    for role in (roles_res.data or []):
        result.append({**role, "permission_count": counts.get(role["role_id"], 0)})

    return result


@router.post("/roles")
def create_role(
    body: dict,
    admin_email: str = Depends(verify_admin_role()),
    db: SupabaseClient = Depends(get_db),
):
    """Create a new custom role."""
    display_name = (body.get("display_name") or "").strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="display_name is required.")

    role_key = display_name.lower().replace(" ", "_")

    # Check uniqueness
    existing = db.table("roles").select("role_id").eq("role_key", role_key).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail=f"Role '{role_key}' already exists.")

    res = db.table("roles").insert({
        "role_key": role_key,
        "display_name": display_name,
        "description": body.get("description", ""),
        "is_system": False,
    }).execute()

    return {"message": "Role created.", "role": res.data[0] if res.data else None}


@router.delete("/roles/{role_id}")
def delete_role(
    role_id: int,
    admin_email: str = Depends(verify_admin_role()),
    db: SupabaseClient = Depends(get_db),
):
    """Delete a non-system role."""
    role_res = db.table("roles").select("*").eq("role_id", role_id).execute()
    if not role_res.data:
        raise HTTPException(status_code=404, detail="Role not found.")

    role = role_res.data[0]
    if role.get("is_system"):
        raise HTTPException(status_code=400, detail="Cannot delete a system role.")

    db.table("roles").eq("role_id", role_id).delete().execute()
    clear_user_permission_cache()  # Invalidate all caches
    return {"message": f"Role '{role['display_name']}' deleted."}


# ─── Admin: Permissions ───────────────────────────────────────────────────────

@router.get("/permissions")
def get_all_permissions(
    admin_email: str = Depends(verify_admin_role()),
    db: SupabaseClient = Depends(get_db),
):
    """List all permissions, ordered by module then name."""
    res = db.table("permissions").select("*").order("module").order("permission_id").execute()
    return res.data or []


@router.get("/roles/{role_id}/permissions")
def get_role_permission_ids(
    role_id: int,
    admin_email: str = Depends(verify_admin_role()),
    db: SupabaseClient = Depends(get_db),
):
    """Return the list of permission_ids assigned to a role."""
    res = db.table("role_permissions").select("permission_id").eq("role_id", role_id).execute()
    return [rp["permission_id"] for rp in (res.data or [])]


@router.put("/roles/{role_id}/permissions")
def update_role_permissions(
    role_id: int,
    permission_ids: List[int],
    admin_email: str = Depends(verify_admin_role()),
    db: SupabaseClient = Depends(get_db),
):
    """
    Replace all permissions for a role.
    Automatically invalidates the entire permission cache so every user
    gets fresh permissions on their next API request.
    """
    role_res = db.table("roles").select("role_key, display_name").eq("role_id", role_id).execute()
    if not role_res.data:
        raise HTTPException(status_code=404, detail="Role not found.")

    role_key = role_res.data[0]["role_key"]
    if role_key == "admin" and len(permission_ids) == 0:
        raise HTTPException(status_code=400, detail="Cannot strip all permissions from admin role.")

    # Replace permissions
    db.table("role_permissions").eq("role_id", role_id).delete().execute()
    if permission_ids:
        inserts = [{"role_id": role_id, "permission_id": pid} for pid in permission_ids]
        db.table("role_permissions").insert(inserts).execute()

    # Invalidate ALL cached permissions — next request will re-fetch from DB
    clear_user_permission_cache()

    return {"message": f"Permissions updated for '{role_res.data[0]['display_name']}'."}
