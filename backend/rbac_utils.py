"""
RBAC Utility: Supabase Token Verification + In-Memory Permission Cache + FastAPI Dependencies
-----------------------------------------------------------------------------------------------
Security features:
  1. Cryptographic JWT verification using SUPABASE_JWT_SECRET (HS256).
  2. Live Supabase Auth API verification fallback via GET /auth/v1/user.
  3. Strict token claim identity enforcement: client x-user-email cannot spoof identity.
  4. Active user verification: deactivated accounts (is_active=False) denied immediately.
  5. In-memory verified token cache with bounded TTL for high throughput.
  6. Backward compatibility for legacy endpoints without compromising recruitment module.
"""
import hashlib
import logging
import os
import time
from typing import Dict, Optional, Set

import jwt
import requests
from fastapi import Depends, Header, HTTPException, status
from supabase_db import SupabaseClient, get_db

logger = logging.getLogger(__name__)

# ─── Configuration ────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY", "")

# ─── Token & Permission Caches ────────────────────────────────────────────────
# { "<token_hash>": { "email": "...", "sub": "...", "expires_at": float } }
_VERIFIED_TOKEN_CACHE: Dict[str, Dict] = {}
TOKEN_CACHE_MAX_TTL = 300  # 5 minutes max cache per verified token

# { "email@x.com": { "permissions": {"create_sale", ...}, "expires_at": float } }
_PERMISSION_CACHE: Dict[str, Dict] = {}
CACHE_TTL_SECONDS = 600  # 10 minutes per user

RECRUITMENT_PERMISSIONS = {"view_recruitment", "manage_recruitment"}


def clear_token_cache() -> None:
    """Clear cached verified tokens."""
    global _VERIFIED_TOKEN_CACHE
    _VERIFIED_TOKEN_CACHE.clear()


def clear_user_permission_cache(email: Optional[str] = None) -> None:
    """
    Clear cached permissions and tokens.
    - If email given: clear just that user.
    - If email is None: clear everyone.
    """
    global _PERMISSION_CACHE, _VERIFIED_TOKEN_CACHE
    if email:
        _PERMISSION_CACHE.pop(email.strip().lower(), None)
    else:
        _PERMISSION_CACHE.clear()
        _VERIFIED_TOKEN_CACHE.clear()


def verify_supabase_token(token: str) -> dict:
    """
    Verify a Supabase JWT access token.
    Returns a dict with token claims (contains 'email' and 'sub').
    Raises HTTPException(401) if token is invalid, expired, or forged.
    """
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing or empty.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    clean_token = token.strip()
    now = time.time()
    token_hash = hashlib.sha256(clean_token.encode("utf-8")).hexdigest()

    # 1. Check in-memory verified token cache
    cached = _VERIFIED_TOKEN_CACHE.get(token_hash)
    if cached and now < cached["expires_at"]:
        return cached

    # Check SUPABASE_JWT_SECRET dynamically to support runtime env changes and test fixtures
    jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "").strip()

    claims = None

    # Strategy A: Cryptographic local verification using JWT secret (if configured)
    if jwt_secret:
        try:
            payload = jwt.decode(
                clean_token,
                jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
                options={"require": ["exp"]},
            )
            email = payload.get("email")
            if not email:
                user_meta = payload.get("user_metadata", {})
                email = user_meta.get("email") if isinstance(user_meta, dict) else None

            if not email:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication token is missing required email claim.",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            claims = {
                "email": email.lower().strip(),
                "sub": payload.get("sub"),
                "exp": payload.get("exp"),
            }
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token has expired.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except jwt.InvalidSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token signature (forged or tampered token).",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except jwt.InvalidTokenError as ite:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid authentication token: {str(ite)}",
                headers={"WWW-Authenticate": "Bearer"},
            )
    else:
        # Strategy B: Supabase Auth API verification via GET /auth/v1/user
        supabase_url = os.getenv("SUPABASE_URL", SUPABASE_URL).rstrip("/")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY", SUPABASE_KEY)

        if not supabase_url:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Supabase URL not configured on server.",
            )

        try:
            auth_url = f"{supabase_url}/auth/v1/user"
            resp = requests.get(
                auth_url,
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {clean_token}",
                },
                timeout=5.0,
            )
            if resp.status_code == 200:
                user_data = resp.json()
                email = user_data.get("email")
                if not email:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Supabase user profile is missing an email address.",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                try:
                    unverified = jwt.decode(clean_token, options={"verify_signature": False})
                    exp = unverified.get("exp", now + 3600)
                except Exception:
                    exp = now + 3600

                claims = {
                    "email": email.lower().strip(),
                    "sub": user_data.get("id"),
                    "exp": exp,
                }
            else:
                err_detail = "Invalid or expired Supabase authentication token."
                try:
                    err_json = resp.json()
                    err_detail = err_json.get("msg") or err_json.get("message") or err_detail
                except Exception:
                    pass
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Supabase token verification failed: {err_detail}",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        except HTTPException:
            raise
        except Exception as net_err:
            logger.error(f"[AUTH] Error contacting Supabase auth service: {net_err}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Failed to verify token with Supabase auth service.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # Cache the verified claims
    token_exp = claims.get("exp", now + TOKEN_CACHE_MAX_TTL)
    cache_ttl = max(10, min(token_exp - now, TOKEN_CACHE_MAX_TTL))
    _VERIFIED_TOKEN_CACHE[token_hash] = {
        "email": claims["email"],
        "sub": claims.get("sub"),
        "expires_at": now + cache_ttl,
    }

    return _VERIFIED_TOKEN_CACHE[token_hash]


def authenticate_request(
    authorization: Optional[str],
    user_email_header: Optional[str],
    require_token: bool = False,
) -> str:
    """
    Authenticate an incoming request and return the trusted user email.

    Rules:
      1. If Authorization: Bearer <token> is present, it MUST be verified.
         Identity is derived exclusively from the verified token claims.
         Any client-supplied x-user-email header is discarded.
      2. If Authorization header is invalid or token is forged/expired,
         immediately raise 401 Unauthorized.
      3. If Authorization header is missing:
         - If require_token is True: raise 401 Unauthorized.
         - If require_token is False: allow legacy x-user-email with a security warning.
    """
    token = None
    if authorization:
        auth_parts = authorization.strip().split()
        if len(auth_parts) == 2 and auth_parts[0].lower() == "bearer":
            token = auth_parts[1].strip()
        elif len(auth_parts) == 1 and not auth_parts[0].lower().startswith("bearer"):
            token = auth_parts[0].strip()

    if token:
        # A token was provided: verify it securely.
        verified_claims = verify_supabase_token(token)
        verified_email = verified_claims["email"]

        # If client also passed an x-user-email that doesn't match the token, log security warning
        if user_email_header and user_email_header.strip().lower() != verified_email:
            logger.warning(
                f"[AUTH SECURITY] Client attempted x-user-email spoofing! "
                f"Header: '{user_email_header}', Verified Token Email: '{verified_email}'. "
                f"Identity derived strictly from verified token claims."
            )
        return verified_email

    # No token provided
    if require_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Missing Bearer token in Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Legacy fallback for un-migrated modules
    if user_email_header and user_email_header.strip():
        clean_email = user_email_header.strip().lower()
        logger.warning(
            f"[AUTH COMPATIBILITY] Request authenticated via legacy x-user-email ('{clean_email}') "
            f"without Bearer JWT. Migrate client to Supabase access token."
        )
        return clean_email

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Missing Authorization or x-user-email header.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_user_permissions(email: str, db: SupabaseClient) -> Set[str]:
    """
    Fetch the user's permissions. Returns a Python set of permission_key strings.

    Cache hit  → instant (no DB).
    Cache miss → optimized 2-query path using permission_keys[] on the roles row.
                 Falls back to junction table walk if permission_keys is absent.
    """
    clean_email = email.strip().lower()
    now = time.time()

    # 1. Cache hit?
    cached = _PERMISSION_CACHE.get(clean_email)
    if cached and now < cached["expires_at"]:
        return cached["permissions"]

    # 2. Cache miss — fetch from DB
    try:
        # ── Query 1: resolve user's role_key and verify active status ─────────
        user_res = db.table("app_users").select("role, is_active").eq("email", clean_email).execute()
        if not user_res.data:
            logger.warning(f"[RBAC] Unknown user in app_users: {clean_email}")
            return set()

        user_row = user_res.data[0]
        if not user_row.get("is_active", True):
            logger.warning(f"[RBAC] Inactive user account: {clean_email}")
            return set()

        role_key = user_row.get("role", "staff")

        # ── Query 2: pull role row (permission_keys[] + role_id for fallback) ─
        role_res = (
            db.table("roles")
            .select("role_id, permission_keys")
            .eq("role_key", role_key)
            .execute()
        )
        if not role_res.data:
            logger.warning(f"[RBAC] Unknown role: {role_key}")
            return set()

        role_row = role_res.data[0]
        role_id = role_row["role_id"]
        perm_keys_array = role_row.get("permission_keys") or []

        if perm_keys_array:
            # ── Fast path: direct array, no further queries ──────────────────
            perms: Set[str] = set(perm_keys_array)
        else:
            # ── Fallback: junction table walk (role_permissions + permissions) ─
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
        _PERMISSION_CACHE[clean_email] = {"permissions": perms, "expires_at": now + CACHE_TTL_SECONDS}
        return perms

    except Exception as exc:
        logger.error(f"[RBAC ERROR] Could not fetch permissions for {clean_email}: {exc}")
        return set()


# ─── FastAPI Dependency Factories ─────────────────────────────────────────────

def verify_permission(required_permission: str, require_token: Optional[bool] = None):
    """
    Dependency generator for protecting individual endpoints with RBAC and secure token verification.

    For recruitment permissions (view_recruitment, manage_recruitment), require_token defaults to True.
    For legacy permissions, require_token defaults to False to prevent breaking un-migrated modules.
    """
    if require_token is None:
        require_token = (required_permission in RECRUITMENT_PERMISSIONS)

    def checker(
        authorization: Optional[str] = Header(None, alias="authorization"),
        user_email: Optional[str] = Header(None, alias="x-user-email"),
        db: SupabaseClient = Depends(get_db),
    ) -> str:
        # 1. Resolve trusted identity from verified token or legacy fallback
        authenticated_email = authenticate_request(
            authorization=authorization,
            user_email_header=user_email,
            require_token=require_token,
        )

        # 2. Verify user exists in app_users and is active
        try:
            user_res = db.table("app_users").select("role, is_active").eq("email", authenticated_email).execute()
        except Exception as db_err:
            logger.error(f"[RBAC ERROR] Failed to query app_users for {authenticated_email}: {db_err}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error verifying user account.",
            )

        if not user_res.data:
            logger.warning(f"[RBAC] User not found in app_users: {authenticated_email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. User '{authenticated_email}' not found in registered app users.",
            )

        user_data = user_res.data[0]
        if not user_data.get("is_active", True):
            logger.warning(f"[RBAC] Inactive user account attempted access: {authenticated_email}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. User account is deactivated (ACCOUNT_DEACTIVATED).",
            )

        # 3. Check RBAC permissions
        permissions = get_user_permissions(authenticated_email, db)
        if required_permission not in permissions:
            logger.warning(
                f"[RBAC] Access denied for {authenticated_email}. "
                f"Missing permission '{required_permission}'. User permissions: {permissions}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Missing permission: '{required_permission}'.",
            )

        return authenticated_email

    return checker


def verify_admin_role(require_token: bool = False):
    """
    Dependency for admin-only endpoints.
    Replaces the old hardcoded verify_admin("admin@gmail.com").
    Passes if user has 'manage_roles' OR 'manage_users' permission.
    """
    def checker(
        authorization: Optional[str] = Header(None, alias="authorization"),
        user_email: Optional[str] = Header(None, alias="x-user-email"),
        db: SupabaseClient = Depends(get_db),
    ) -> str:
        authenticated_email = authenticate_request(
            authorization=authorization,
            user_email_header=user_email,
            require_token=require_token,
        )

        try:
            user_res = db.table("app_users").select("role, is_active").eq("email", authenticated_email).execute()
        except Exception as db_err:
            logger.error(f"[RBAC ERROR] Failed to query app_users for {authenticated_email}: {db_err}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error verifying user account.",
            )

        if not user_res.data:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not found in app_users.")

        user_data = user_res.data[0]
        if not user_data.get("is_active", True):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="ACCOUNT_DEACTIVATED")

        permissions = get_user_permissions(authenticated_email, db)
        if "manage_roles" not in permissions and "manage_users" not in permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required.")
        return authenticated_email

    return checker
