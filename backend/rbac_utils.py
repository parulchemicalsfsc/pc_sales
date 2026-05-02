"""
RBAC Utility: In-Memory Permission Cache + FastAPI Dependencies
---------------------------------------------------------------
Two-layer performance strategy:
  Layer 1: Frontend loads permissions once at login → stores in React context.
  Layer 2: Backend checks in-memory dict (zero DB) → only refreshes every 10 min.

Optimized resolution (cache miss path):
  - Primary  : 2 queries — app_users (role_key) + roles (permission_keys[])
  - Fallback : 3 queries via junction table — used only if permission_keys is empty

Cache invalidation: calling clear_user_permission_cache() when roles change
ensures users get fresh permissions on their next request.
"""
import time
from typing import Optional, Set, Dict
from fastapi import HTTPException, Depends, Header
from supabase_db import SupabaseClient, get_db

# ─── In-memory cache ──────────────────────────────────────────────────────────
# { "email@x.com": { "permissions": {"create_sale", ...}, "expires_at": 1234.0 } }
_PERMISSION_CACHE: Dict[str, Dict] = {}
CACHE_TTL_SECONDS = 600  # 10 minutes per user


def clear_user_permission_cache(email: Optional[str] = None) -> None:
    """
    Clear cached permissions.
    - If email given: clear just that user (useful for targeted invalidation).
    - If email is None: clear EVERYONE (called when a role's permissions change).
    """
    global _PERMISSION_CACHE
    if email:
        _PERMISSION_CACHE.pop(email, None)
    else:
        _PERMISSION_CACHE.clear()


def get_user_permissions(email: str, db: SupabaseClient) -> Set[str]:
    """
    Fetch the user's permissions. Returns a Python set of permission_key strings.

    Cache hit  → instant (no DB).
    Cache miss → optimized 2-query path using permission_keys[] on the roles row.
                 Falls back to junction table walk if permission_keys is absent.
    """
    now = time.time()

    # 1. Cache hit?
    cached = _PERMISSION_CACHE.get(email)
    if cached and now < cached["expires_at"]:
        return cached["permissions"]

    # 2. Cache miss — fetch from DB
    try:
        # ── Query 1: resolve user's role_key ────────────────────────────────
        user_res = db.table("app_users").select("role").eq("email", email).execute()
        if not user_res.data:
            print(f"[RBAC] Unknown user: {email}")
            return set()

        role_key = user_res.data[0].get("role", "staff")

        # ── Query 2: pull role row (permission_keys[] + role_id for fallback) ─
        role_res = (
            db.table("roles")
            .select("role_id, permission_keys")
            .eq("role_key", role_key)
            .execute()
        )
        if not role_res.data:
            print(f"[RBAC] Unknown role: {role_key}")
            return set()

        role_row = role_res.data[0]
        role_id = role_row["role_id"]
        perm_keys_array = role_row.get("permission_keys") or []

        if perm_keys_array:
            # ── Fast path: direct array, no further queries ──────────────────
            perms: Set[str] = set(perm_keys_array)
            print(f"[RBAC] Fast-path: {len(perms)} perms for {email} (role={role_key})")
        else:
            # ── Fallback: junction table walk (role_permissions + permissions) ─
            print(f"[RBAC] Fallback junction-table path for role={role_key}")
            rp_res = (
                db.table("role_permissions")
                .select("permission_id")
                .eq("role_id", role_id)
                .execute()
            )
            if not rp_res.data:
                perms = set()
            else:
                perm_ids = [rp["permission_id"] for rp in rp_res.data]
                p_res = (
                    db.table("permissions")
                    .select("permission_key")
                    .in_("permission_id", perm_ids)
                    .execute()
                )
                perms = {p["permission_key"] for p in (p_res.data or [])}

        # 3. Store in cache
        _PERMISSION_CACHE[email] = {"permissions": perms, "expires_at": now + CACHE_TTL_SECONDS}
        print(f"[RBAC] Cached {len(perms)} permissions for {email} (role={role_key})")
        return perms

    except Exception as exc:
        print(f"[RBAC ERROR] Could not fetch permissions for {email}: {exc}")
        return set()


# ─── FastAPI Dependency Factories ─────────────────────────────────────────────

def verify_permission(required_permission: str):
    """
    Dependency generator for protecting individual endpoints.

    Usage:
        @router.post("/", dependencies=[Depends(verify_permission("create_sale"))])
        def create_sale(...): ...
    """
    def checker(
        user_email: Optional[str] = Header(None, alias="x-user-email"),
        db: SupabaseClient = Depends(get_db),
    ) -> str:
        if not user_email:
            raise HTTPException(status_code=401, detail="Authentication required. Missing x-user-email header.")
        permissions = get_user_permissions(user_email, db)
        if required_permission not in permissions:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Missing permission: '{required_permission}'.",
            )
        return user_email

    return checker


def verify_admin_role():
    """
    Dependency for admin-only endpoints.
    Replaces the old hardcoded verify_admin("admin@gmail.com").
    Passes if user has 'manage_roles' OR 'manage_users' permission.
    """
    def checker(
        user_email: Optional[str] = Header(None, alias="x-user-email"),
        db: SupabaseClient = Depends(get_db),
    ) -> str:
        if not user_email:
            raise HTTPException(status_code=401, detail="Authentication required.")
        permissions = get_user_permissions(user_email, db)
        if "manage_roles" not in permissions and "manage_users" not in permissions:
            raise HTTPException(status_code=403, detail="Admin privileges required.")
        return user_email

    return checker
