"""
Tally Data Router
-----------------
Endpoints:
  POST /api/tally/ingest               → Machine-to-machine: receive vouchers from TallyConnector
  POST /api/tally/reconcile/cleanup    → Machine-to-machine: soft-delete vouchers removed from Tally
  GET  /api/tally/vouchers             → Paginated + filtered voucher list (requires view_tally_data)
  GET  /api/tally/stats                → Summary stats for the Tally Data page header

Authentication:
  - Ingest/cleanup endpoints: X-API-Key header validated against TALLY_API_KEY env var
  - Read endpoints: standard RBAC via x-user-email header (view_tally_data permission)
"""

import os
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from supabase_db import SupabaseClient, get_db
from rbac_utils import verify_permission

router = APIRouter()

_TALLY_API_KEY = os.getenv("TALLY_API_KEY", "")


# ─── Auth helper ──────────────────────────────────────────────────────────────

def _verify_api_key(x_api_key: Optional[str] = Header(None, alias="x-api-key")) -> None:
    """Validates the X-API-Key header for machine-to-machine endpoints."""
    if not _TALLY_API_KEY:
        raise HTTPException(status_code=500, detail="TALLY_API_KEY is not configured on the server.")
    if not x_api_key or x_api_key != _TALLY_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")


# ─── Pydantic models ──────────────────────────────────────────────────────────

class VoucherPayload(BaseModel):
    voucher_id:    str
    voucher_no:    Optional[str] = None
    voucher_type:  Optional[str] = None
    date:          Optional[str] = None
    customer_name: Optional[str] = None
    particulars:   Optional[str] = None
    debit:         Optional[float] = 0.0
    credit:        Optional[float] = 0.0
    narration:     Optional[str] = None
    items_summary: Optional[str] = None
    extra_fields:  Optional[dict] = {}


class IngestRequest(BaseModel):
    vouchers:          List[VoucherPayload]
    connector_version: Optional[str] = None


class CleanupRequest(BaseModel):
    active_voucher_ids: List[str]


# ─── Ingest endpoint ──────────────────────────────────────────────────────────

@router.post("/ingest")
def ingest_vouchers(
    payload: IngestRequest,
    db: SupabaseClient = Depends(get_db),
    _: None = Depends(_verify_api_key),
):
    """
    Upserts a batch of vouchers sent by the TallyConnector EXE.
    Idempotent: same voucher_id always overwrites (no duplicates possible).
    Never re-activates a soft-deleted voucher — if it was deleted in Tally,
    it stays soft-deleted here unless reconcile explicitly revives it.
    """
    if not payload.vouchers:
        return {"upserted": 0, "message": "Empty batch — nothing to do."}

    connector_version = payload.connector_version
    synced_at = datetime.utcnow().isoformat()
    upserted = 0

    for v in payload.vouchers:
        if not v.voucher_id:
            continue

        row = {
            "voucher_id":        v.voucher_id,
            "voucher_no":        v.voucher_no or "",
            "voucher_type":      v.voucher_type or "",
            "date":              v.date or "",
            "customer_name":     v.customer_name or "",
            "particulars":       v.particulars or "",
            "debit":             v.debit or 0.0,
            "credit":            v.credit or 0.0,
            "narration":         v.narration or "",
            "items_summary":     v.items_summary or "",
            "extra_fields":      v.extra_fields or {},
            "synced_at":         synced_at,
            "connector_version": connector_version,
            # Never un-delete via ingest — use reconcile for that
        }

        try:
            # Upsert on voucher_id; ignore is_deleted column so soft-deletes are preserved
            db.table("tally_vouchers").upsert(
                row,
                on_conflict="voucher_id",
                ignore_duplicates=False,
            ).execute()
            upserted += 1
        except Exception as e:
            # Log and continue — don't fail the entire batch for one bad row
            print(f"[tally_data] Upsert failed for voucher_id={v.voucher_id}: {e}")

    return {"upserted": upserted, "total_received": len(payload.vouchers)}


# ─── Reconcile cleanup endpoint ───────────────────────────────────────────────

@router.post("/reconcile/cleanup")
def reconcile_cleanup(
    payload: CleanupRequest,
    db: SupabaseClient = Depends(get_db),
    _: None = Depends(_verify_api_key),
):
    """
    Soft-deletes any voucher in the DB whose voucher_id is NOT in the provided active list.
    Called at the end of a Reconcile cycle from the TallyConnector.
    Only affects non-deleted rows (is_deleted = false).
    """
    active_ids = list(set(payload.active_voucher_ids))  # deduplicate

    if not active_ids:
        return {"soft_deleted": 0, "message": "Empty active list — no cleanup performed."}

    deleted_at = datetime.utcnow().isoformat()
    soft_deleted = 0

    try:
        # Fetch all currently active voucher IDs in the DB
        result = (
            db.table("tally_vouchers")
            .select("id, voucher_id")
            .eq("is_deleted", False)
            .execute()
        )
        db_active = result.data or []

        # Find IDs that are in DB but not in Tally's current list
        active_set = set(active_ids)
        stale = [row for row in db_active if row["voucher_id"] not in active_set]

        # Soft-delete stale rows in batches of 200 IDs
        stale_ids = [row["id"] for row in stale]
        batch_size = 200
        for i in range(0, len(stale_ids), batch_size):
            batch = stale_ids[i:i + batch_size]
            db.table("tally_vouchers").update({
                "is_deleted": True,
                "deleted_at": deleted_at,
            }).in_("id", batch).execute()
            soft_deleted += len(batch)

    except Exception as e:
        print(f"[tally_data] Reconcile cleanup error: {e}")
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {e}")

    return {
        "soft_deleted": soft_deleted,
        "active_ids_received": len(active_ids),
        "db_active_before_cleanup": len(db_active) if 'db_active' in locals() else 0,
    }


# ─── Read endpoints (RBAC-protected) ─────────────────────────────────────────

@router.get("/vouchers")
def list_vouchers(
    page:         int   = Query(1, ge=1),
    page_size:    int   = Query(50, ge=1, le=200),
    voucher_type: Optional[str] = Query(None),
    customer:     Optional[str] = Query(None),
    search:       Optional[str] = Query(None),
    date_from:    Optional[str] = Query(None),
    date_to:      Optional[str] = Query(None),
    db: SupabaseClient = Depends(get_db),
    user_email: str = Depends(verify_permission("view_tally_data")),
):
    """
    Returns paginated, filtered Tally vouchers.
    Only returns non-deleted records (is_deleted = false).
    """
    try:
        query = (
            db.table("tally_vouchers")
            .select("*", count="exact")
            .eq("is_deleted", False)
        )

        if voucher_type:
            query = query.eq("voucher_type", voucher_type)
        if customer:
            query = query.eq("customer_name", customer)
        if date_from:
            query = query.gte("date", date_from)
        if date_to:
            query = query.lte("date", date_to)
        if search:
            # Supabase ilike for case-insensitive search across key text columns
            query = query.or_(
                f"voucher_no.ilike.%{search}%,"
                f"customer_name.ilike.%{search}%,"
                f"narration.ilike.%{search}%,"
                f"particulars.ilike.%{search}%"
            )

        # Pagination
        offset = (page - 1) * page_size
        query = query.order("date", desc=True).range(offset, offset + page_size - 1)

        result = query.execute()
        total = result.count if result.count is not None else len(result.data)

        return {
            "data":      result.data or [],
            "total":     total,
            "page":      page,
            "page_size": page_size,
            "pages":     (total + page_size - 1) // page_size if total > 0 else 1,
        }

    except Exception as e:
        print(f"[tally_data] list_vouchers error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
def get_stats(
    db: SupabaseClient = Depends(get_db),
    user_email: str = Depends(verify_permission("view_tally_data")),
):
    """
    Returns summary stats for the Tally Data page header:
    total active vouchers, soft-deleted count, and last synced timestamp.
    """
    try:
        active_result = (
            db.table("tally_vouchers")
            .select("id", count="exact")
            .eq("is_deleted", False)
            .execute()
        )
        deleted_result = (
            db.table("tally_vouchers")
            .select("id", count="exact")
            .eq("is_deleted", True)
            .execute()
        )
        last_sync_result = (
            db.table("tally_vouchers")
            .select("synced_at")
            .eq("is_deleted", False)
            .order("synced_at", desc=True)
            .limit(1)
            .execute()
        )

        last_synced = None
        if last_sync_result.data:
            last_synced = last_sync_result.data[0].get("synced_at")

        return {
            "total_active":   active_result.count or 0,
            "total_deleted":  deleted_result.count or 0,
            "last_synced_at": last_synced,
        }

    except Exception as e:
        print(f"[tally_data] get_stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/filter-options")
def get_filter_options(
    db: SupabaseClient = Depends(get_db),
    user_email: str = Depends(verify_permission("view_tally_data")),
):
    """Returns distinct voucher types and customers for dropdown filters."""
    try:
        res = db.table("tally_vouchers").select("voucher_type, customer_name").eq("is_deleted", False).execute()
        rows = res.data or []
        types = sorted(list({r.get("voucher_type") for r in rows if r.get("voucher_type")}))
        customers = sorted(list({r.get("customer_name") for r in rows if r.get("customer_name")}))
        return {
            "voucher_types": types,
            "customers": customers,
        }
    except Exception as e:
        print(f"[tally_data] filter_options error: {e}")
        return {"voucher_types": [], "customers": []}
