"""
Lead Management Router
Handles lead intake from product websites, management by Lead Manager,
and lead working by Lead Owners (Sales Executives).
No emails in v1.
"""
import os
import logging
from datetime import date, datetime
import re
from typing import Optional

from activity_logger import get_activity_logger
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from supabase_db import SupabaseClient, get_db
from rbac_utils import verify_permission

logger = logging.getLogger(__name__)
router = APIRouter()

LEAD_INTAKE_KEY = os.getenv("LEAD_INTAKE_KEY", "test-lead-key-change-me")

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _verify_intake_key(request: Request, db: SupabaseClient):
    # Check if this is a manual addition by a logged-in user with work_leads permission
    user_email = request.headers.get("x-user-email")
    if user_email:
        from rbac_utils import get_user_permissions
        permissions = get_user_permissions(user_email, db)
        if "work_leads" in permissions:
            return user_email
        else:
            raise HTTPException(
                status_code=403,
                detail="Access denied. Missing permission: 'work_leads'."
            )

    key = request.headers.get("X-API-Key") or request.headers.get("x-api-key")
    if not key or key != LEAD_INTAKE_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return "system"


def verify_lead_access(
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    if not user_email:
        raise HTTPException(status_code=401, detail="Authentication required. Missing x-user-email header.")
    from rbac_utils import get_user_permissions
    permissions = get_user_permissions(user_email, db)
    if "work_leads" not in permissions and "manage_leads" not in permissions:
        raise HTTPException(status_code=403, detail="Access denied. Missing required leads permissions.")
    return user_email


SOURCE_PREFIX_MAP = {
    "website_a": "WA",
    "website_b": "WB",
    "website_c": "WC",
    "parul_chemicals": "PC",
    "psi": "PS",
    "press stamping industries": "PS",
    "press_stamping_industries": "PS",
}

def _get_prefix_for_source(source_website: str) -> str:
    # 1. Generate a 2-letter prefix automatically
    clean_name = re.sub(r'[^a-zA-Z0-9\s_]', '', source_website).strip()
    words = re.split(r'[\s_]+', clean_name)
    words = [w for w in words if w]
    
    if not words:
        prefix = "LD"
    elif len(words) == 1:
        prefix = words[0][:2].upper().ljust(2, 'X')
    else:
        prefix = (words[0][0] + words[1][0]).upper()
        
    # Check if there is a hardcoded override
    return SOURCE_PREFIX_MAP.get(source_website.lower(), prefix)


def _generate_lead_id(db: SupabaseClient, prefix: str) -> str:
    # Count existing leads with this specific prefix to ensure uniqueness
    res = db.table("leads").select("lead_id").like("lead_id", f"{prefix}-%").execute()
    n = len(res.data or []) + 1
    return f"{prefix}-{n:04d}"


def _log_lead_activity(
    db: SupabaseClient,
    lead_id: str,
    activity_type: str,
    summary: str,
    logged_by: str,
    is_auto: bool = False,
    outcome: str = None,
    next_action: str = None,
    follow_up_date: str = None,
):
    try:
        data = {
            "lead_id": lead_id,
            "activity_type": activity_type,
            "summary": summary,
            "logged_by": logged_by,
            "is_auto": is_auto,
        }
        if outcome:
            data["outcome"] = outcome
        if next_action:
            data["next_action"] = next_action
        if follow_up_date:
            data["follow_up_date"] = follow_up_date
        db.table("lead_activities").insert(data).execute()
    except Exception as e:
        logger.warning(f"[LEADS] Failed to log activity for {lead_id}: {e}")


def _notify_lead_managers(db: SupabaseClient, title: str, message: str, action_url: str):
    try:
        managers = db.table("app_users").select("email").eq("role", "lead_manager").execute()
        for mgr in (managers.data or []):
            db.table("notifications").insert({
                "user_email": mgr["email"],
                "title": title,
                "message": message,
                "notification_type": "info",
                "entity_type": "lead",
                "action_url": action_url,
                "is_read": False,
            }).execute()
    except Exception as e:
        logger.warning(f"[LEADS] Failed to notify lead managers: {e}")


def _notify_user(db: SupabaseClient, user_email: str, title: str, message: str, action_url: str):
    try:
        db.table("notifications").insert({
            "user_email": user_email,
            "title": title,
            "message": message,
            "notification_type": "info",
            "entity_type": "lead",
            "action_url": action_url,
            "is_read": False,
        }).execute()
    except Exception as e:
        logger.warning(f"[LEADS] Failed to notify {user_email}: {e}")


def _get_lead_or_404(db: SupabaseClient, lead_id: str):
    res = db.table("leads").select("*").eq("lead_id", lead_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail=f"Lead {lead_id} not found")
    return res.data[0]


def _get_user_name(db: SupabaseClient, email: str) -> str:
    res = db.table("app_users").select("name").eq("email", email).execute()
    return res.data[0].get("name", email) if res.data else email


# ─── INTAKE ───────────────────────────────────────────────────────────────────

from urllib.parse import urlparse
import re

def _extract_domain(url: str) -> str:
    url = url.strip().lower()
    if not url.startswith(("http://", "https://")):
        url = "http://" + url
    try:
        parsed = urlparse(url)
        domain = parsed.netloc or parsed.path
        if domain.startswith("www."):
            domain = domain[4:]
        return domain.split(":")[0]
    except Exception:
        return url

def _normalize_name(name: str) -> str:
    return re.sub(r'[^a-z0-9]', '', name.lower())


def _is_name_match(incoming: str, registered: str) -> bool:
    norm_in = _normalize_name(incoming)
    norm_reg = _normalize_name(registered)
    if norm_in == norm_reg:
        return True
    # Support common abbreviations/overrides
    if norm_in == "psi" and "pressstamping" in norm_reg:
        return True
    if norm_in == "pcsales" and "parulchemical" in norm_reg:
        return True
    return False


@router.post("/intake")
def intake_lead(request: Request, payload: dict, db: SupabaseClient = Depends(get_db)):
    """
    Public endpoint for product websites to submit leads,
    or manual intake for users with work_leads.
    """
    logged_by = _verify_intake_key(request, db)

    incoming_source = str(payload.get("source_website", "")).strip()
    if not incoming_source:
        raise HTTPException(status_code=400, detail="source_website is required")

    full_name = str(payload.get("full_name", "")).strip()
    if not full_name:
        raise HTTPException(status_code=400, detail="full_name is required")

    email = str(payload.get("email", "")).strip()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")

    phone = str(payload.get("phone", "")).strip()
    if not phone:
        raise HTTPException(status_code=400, detail="phone is required")

    company_name = str(payload.get("company_name", "")).strip()
    if not company_name:
        raise HTTPException(status_code=400, detail="company_name is required")

    product_interest = str(payload.get("product_interest", "")).strip()
    if not product_interest:
        raise HTTPException(status_code=400, detail="product_interest is required")

    # Fetch active lead sources from Supabase
    try:
        active_sources = db.table("lead_sources").select("*").eq("is_active", True).execute().data or []
    except Exception as e:
        logger.error(f"Failed to fetch active sources: {e}")
        active_sources = []

    matched_source = None
    for src in active_sources:
        if _is_name_match(incoming_source, src["name"]):
            matched_source = src
            break

    if not matched_source:
        raise HTTPException(
            status_code=400,
            detail="Submissions are only accepted from registered websites. Please contact the administrator."
        )

    # Use official name and prefix for logging and ID generation
    source_website = matched_source["name"]
    prefix = matched_source["prefix"]
    lead_id = _generate_lead_id(db, prefix)

    lead_data = {
        "lead_id": lead_id,
        "source_id": payload.get("source_id"),
        "source_website": incoming_source,
        "full_name": full_name,
        "email": email,
        "phone": phone,
        "country": payload.get("country"),
        "company_name": company_name,
        "product_interest": product_interest,
        "message": payload.get("message"),
        "status": "Unassigned",
    }

    if logged_by != "system":
        lead_data["assigned_to"] = logged_by
        lead_data["status"] = "Assigned"

    try:
        db.table("leads").insert(lead_data).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create lead: {e}")

    if logged_by == "system":
        _log_lead_activity(
            db, lead_id, "Assignment",
            f"Lead received from {source_website}",
            logged_by="system", is_auto=True,
        )
        _notify_lead_managers(
            db,
            title=f"New Lead: {full_name}",
            message=f"New enquiry from {full_name} ({payload.get('company_name', 'N/A')}) via {source_website}. "
                    f"Product: {payload.get('product_interest', 'N/A')}",
            action_url="/leads",
        )
    else:
        user_name = _get_user_name(db, logged_by)
        _log_lead_activity(
            db, lead_id, "Assignment",
            f"Lead created manually by {user_name}",
            logged_by=logged_by, is_auto=True,
        )
        _log_lead_activity(
            db, lead_id, "Status Change",
            f"Status changed from Unassigned to Assigned (automatically assigned to creator)",
            logged_by=logged_by, is_auto=True,
        )
        _notify_lead_managers(
            db,
            title=f"New Lead (Manual): {full_name}",
            message=f"New manual lead created by {user_name} for {full_name} ({payload.get('company_name', 'N/A')}).",
            action_url="/leads",
        )

    logger.info(f"[LEADS] New lead created: {lead_id} (manual: {logged_by != 'system'})")
    return {"lead_id": lead_id, "status": lead_data["status"], "message": "Lead created successfully"}


# ─── LEAD MANAGER ENDPOINTS ───────────────────────────────────────────────────

@router.get("/", dependencies=[Depends(verify_permission("view_all_leads"))])
def get_all_leads(
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    source: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Get all leads with optional filters. Lead Manager only."""
    try:
        query = db.table("leads").select("*")
        if status:
            query = query.eq("status", status)
        if assigned_to:
            query = query.eq("assigned_to", assigned_to)
        if source:
            query = query.eq("source_website", source)
        if date_from:
            query = query.gte("created_at", date_from)
        if date_to:
            query = query.lte("created_at", date_to)

        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
        res = query.execute()

        count_q = db.table("leads").select("lead_id", count="exact")
        if status:
            count_q = count_q.eq("status", status)
        if assigned_to:
            count_q = count_q.eq("assigned_to", assigned_to)
        if source:
            count_q = count_q.eq("source_website", source)
        count_res = count_q.execute()
        total = count_res.count or len(count_res.data or [])

        return {"leads": res.data or [], "total": total, "limit": limit, "offset": offset}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching leads: {e}")


@router.get("/stats/pipeline", dependencies=[Depends(verify_permission("view_lead_dashboard"))])
def get_pipeline_stats(
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Pipeline KPI stats. Scoped by role — owner sees their own, manager sees all."""
    try:
        user_res = db.table("app_users").select("role").eq("email", user_email).execute()
        user_role = user_res.data[0].get("role", "staff") if user_res.data else "staff"

        if user_role == "lead_owner":
            leads_res = db.table("leads").select("*").eq("assigned_to", user_email).execute()
        else:
            leads_res = db.table("leads").select("*").execute()

        leads = leads_res.data or []
        today = date.today().isoformat()
        current_month = datetime.now().strftime("%Y-%m")

        stats = {
            "total": len(leads),
            "unassigned": sum(1 for l in leads if l.get("status") == "Unassigned"),
            "assigned": sum(1 for l in leads if l.get("status") == "Assigned"),
            "in_progress": sum(1 for l in leads if l.get("status") == "In Progress"),
            "follow_up": sum(1 for l in leads if l.get("status") == "Follow-up"),
            "converted": sum(1 for l in leads if l.get("status") == "Converted"),
            "rejected": sum(1 for l in leads if l.get("status") == "Rejected"),
            "overdue": sum(
                1 for l in leads
                if l.get("follow_up_date")
                and str(l.get("follow_up_date", ""))[:10] < today
                and l.get("status") not in ("Converted", "Rejected")
            ),
            "converted_this_month": sum(
                1 for l in leads
                if l.get("status") == "Converted"
                and str(l.get("updated_at", "")).startswith(current_month)
            ),
            "by_source": {},
            "by_status": {},
        }

        for l in leads:
            src = l.get("source_website", "unknown")
            stats["by_source"][src] = stats["by_source"].get(src, 0) + 1
            st = l.get("status", "Unknown")
            stats["by_status"][st] = stats["by_status"].get(st, 0) + 1

        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching stats: {e}")


@router.get("/my", dependencies=[Depends(verify_permission("work_leads"))])
def get_my_leads(
    status: Optional[str] = None,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Get leads assigned to the current user. Lead Owner only."""
    try:
        query = db.table("leads").select("*").eq("assigned_to", user_email)
        if status:
            query = query.eq("status", status)
        res = query.order("created_at", desc=True).execute()

        leads = res.data or []
        today = date.today().isoformat()

        def sort_key(l):
            fd = str(l.get("follow_up_date") or "")[:10]
            if fd and fd < today:
                return (0, fd)
            return (1, fd or "9999")

        leads.sort(key=sort_key)
        return {"leads": leads, "total": len(leads)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching leads: {e}")


# ─── LEAD SOURCES ENDPOINTS ───────────────────────────────────────────────────

@router.get("/sources", dependencies=[Depends(verify_lead_access)])
def get_lead_sources(db: SupabaseClient = Depends(get_db)):
    """Fetch all configured lead sources."""
    try:
        res = db.table("lead_sources").select("*").order("name").execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching lead sources: {e}")


@router.post("/sources", dependencies=[Depends(verify_permission("manage_leads"))])
def save_lead_source(payload: dict, db: SupabaseClient = Depends(get_db)):
    """Create or update a lead source. Lead Manager only."""
    name = str(payload.get("name", "")).strip()
    website_url = str(payload.get("website_url", "")).strip() or "N/A"
    prefix = str(payload.get("prefix", "")).strip().upper()
    bg_color = str(payload.get("bg_color", "#e3f2fd")).strip()
    text_color = str(payload.get("text_color", "#0d47a1")).strip()
    
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if len(prefix) != 2:
        raise HTTPException(status_code=400, detail="Prefix must be exactly 2 characters")
    if not prefix.isalnum():
        raise HTTPException(status_code=400, detail="Prefix must contain alphanumeric characters only")

    source_data = {
        "name": name,
        "website_url": website_url,
        "bg_color": bg_color,
        "text_color": text_color,
        "is_active": bool(payload.get("is_active", True))
    }
    
    source_id = payload.get("id")
    if source_id:
        # Prefix is unique and immutable
        try:
            db.table("lead_sources").eq("id", source_id).update(source_data).execute()
            return {"message": "Lead source updated successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to update lead source: {e}")
    else:
        # Check prefix uniqueness
        source_data["prefix"] = prefix
        try:
            db.table("lead_sources").insert(source_data).execute()
            return {"message": "Lead source created successfully"}
        except Exception as e:
            err_msg = str(e)
            if "duplicate key" in err_msg or "already exists" in err_msg:
                raise HTTPException(status_code=400, detail="A source with this Name, URL, or Prefix already exists.")
            raise HTTPException(status_code=500, detail=f"Failed to create lead source: {e}")


@router.delete("/sources/{source_id}", dependencies=[Depends(verify_permission("manage_leads"))])
def delete_lead_source(source_id: int, db: SupabaseClient = Depends(get_db)):
    """Delete a lead source. Lead Manager only."""
    try:
        db.table("lead_sources").eq("id", source_id).delete().execute()
        return {"message": "Lead source deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete lead source: {e}")


@router.get("/{lead_id}/activities")
def get_lead_activities(
    lead_id: str,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Get full activity timeline for a lead. Accessible to both roles."""
    if not user_email:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        res = (
            db.table("lead_activities")
            .select("*")
            .eq("lead_id", lead_id)
            .order("logged_at", desc=False)
            .execute()
        )
        return {"activities": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching activities: {e}")


@router.get("/{lead_id}", dependencies=[Depends(verify_permission("view_all_leads"))])
def get_lead(
    lead_id: str,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Get full lead detail. Lead Manager only."""
    try:
        return _get_lead_or_404(db, lead_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching lead: {e}")


@router.get("/{lead_id}/detail", dependencies=[Depends(verify_permission("work_leads"))])
def get_lead_detail_owner(
    lead_id: str,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Get lead detail for Lead Owner — restricted to their own leads."""
    try:
        res = db.table("leads").select("*").eq("lead_id", lead_id).eq("assigned_to", user_email).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Lead not found or not assigned to you")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching lead: {e}")


@router.post("/{lead_id}/assign", dependencies=[Depends(verify_permission("manage_leads"))])
def assign_lead(
    lead_id: str,
    payload: dict,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Assign or reassign a lead. Lead Manager only."""
    try:
        assigned_to = payload.get("assigned_to", "").strip()
        note = payload.get("note", "").strip()
        if not assigned_to:
            raise HTTPException(status_code=400, detail="assigned_to is required")

        lead = _get_lead_or_404(db, lead_id)
        old_owner = lead.get("assigned_to")
        is_reassign = bool(old_owner and old_owner != assigned_to)

        owner_name = _get_user_name(db, assigned_to)
        manager_name = _get_user_name(db, user_email)

        db.table("leads").eq("lead_id", lead_id).update({
            "assigned_to": assigned_to,
            "status": "Assigned",
            "updated_at": datetime.utcnow().isoformat(),
        }).execute()

        action = "Reassigned" if is_reassign else "Assigned"
        _log_lead_activity(
            db, lead_id, "Assignment",
            f"{action} to {owner_name} by {manager_name}",
            logged_by=user_email, is_auto=True,
        )
        _log_lead_activity(
            db, lead_id, "Status Change",
            f"Status changed from {lead.get('status', 'Unassigned')} to Assigned",
            logged_by=user_email, is_auto=True,
        )
        if note:
            _log_lead_activity(db, lead_id, "Manager Note", note, logged_by=user_email)

        _notify_user(
            db, assigned_to,
            title=f"Lead {action}: {lead_id}",
            message=f"Lead from {lead.get('full_name')} ({lead.get('company_name', 'N/A')}) has been "
                    f"{'reassigned' if is_reassign else 'assigned'} to you."
                    + (f" Manager note: {note}" if note else ""),
            action_url="/lead-workspace",
        )
        if is_reassign and old_owner:
            _notify_user(
                db, old_owner,
                title=f"Lead Reassigned: {lead_id}",
                message=f"Lead from {lead.get('full_name')} has been reassigned to {owner_name}.",
                action_url="/lead-workspace",
            )

        act_logger = get_activity_logger(db)
        act_logger.log_activity(
            user_email=user_email,
            action_type="UPDATE",
            action_description=f"{action} lead {lead_id} to {owner_name}",
            entity_type="lead",
            entity_name=lead_id,
            metadata={"lead_id": lead_id, "assigned_to": assigned_to},
        )

        return {"message": f"Lead {action.lower()} successfully to {owner_name}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error assigning lead: {e}")


@router.post("/{lead_id}/comment", dependencies=[Depends(verify_permission("manage_leads"))])
def manager_comment(
    lead_id: str,
    payload: dict,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Leave a manager note on a lead."""
    try:
        text = str(payload.get("text", "")).strip()
        if not text:
            raise HTTPException(status_code=400, detail="Note text is required")

        lead = _get_lead_or_404(db, lead_id)
        _log_lead_activity(db, lead_id, "Manager Note", text, logged_by=user_email)
        db.table("leads").eq("lead_id", lead_id).update({
            "updated_at": datetime.utcnow().isoformat()
        }).execute()

        if lead.get("assigned_to"):
            _notify_user(
                db, lead["assigned_to"],
                title=f"Manager Note on {lead_id}",
                message=f"Your manager left a note: {text[:120]}{'...' if len(text) > 120 else ''}",
                action_url="/lead-workspace",
            )

        return {"message": "Manager note added"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding comment: {e}")


@router.delete("/{lead_id}", dependencies=[Depends(verify_permission("manage_leads"))])
def delete_lead(
    lead_id: str,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Delete a lead. Lead Manager only."""
    try:
        # Check if lead exists
        lead = _get_lead_or_404(db, lead_id)
        
        # 1. Delete associated quotations
        db.table("quotations").eq("lead_id", lead_id).delete().execute()
        
        # 2. Delete associated lead activities
        db.table("lead_activities").eq("lead_id", lead_id).delete().execute()
        
        # 3. Delete the lead
        db.table("leads").eq("lead_id", lead_id).delete().execute()
        
        # Log this admin activity
        act_logger = get_activity_logger(db)
        act_logger.log_activity(
            user_email=user_email,
            action_type="DELETE",
            action_description=f"Deleted lead {lead_id} (Name: {lead.get('full_name')})",
            entity_type="lead",
            entity_name=lead_id,
            metadata={"lead_id": lead_id, "full_name": lead.get("full_name")},
        )
        
        return {"message": f"Lead {lead_id} and all associated records deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting lead: {e}")


# ─── LEAD OWNER ENDPOINTS ─────────────────────────────────────────────────────

@router.patch("/{lead_id}", dependencies=[Depends(verify_permission("work_leads"))])
def update_lead(
    lead_id: str,
    payload: dict,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Update lead details. Lead Owner only — scoped to their own leads."""
    try:
        lead_res = db.table("leads").select("*").eq("lead_id", lead_id).eq("assigned_to", user_email).execute()
        if not lead_res.data:
            raise HTTPException(status_code=404, detail="Lead not found or not assigned to you")
        lead = lead_res.data[0]

        allowed = {"phone", "company_name", "status", "follow_up_date", "product_interest"}
        update_data = {k: v for k, v in payload.items() if k in allowed}
        update_data["updated_at"] = datetime.utcnow().isoformat()

        if "status" in update_data and update_data["status"] != lead.get("status"):
            _log_lead_activity(
                db, lead_id, "Status Change",
                f"Status changed from {lead.get('status')} to {update_data['status']}",
                logged_by=user_email, is_auto=True,
            )

        db.table("leads").eq("lead_id", lead_id).update(update_data).execute()
        return {"message": "Lead updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating lead: {e}")


@router.post("/{lead_id}/activities", dependencies=[Depends(verify_permission("work_leads"))])
def log_activity(
    lead_id: str,
    payload: dict,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Log an activity (Call/Email/Meeting/Note). Lead Owner only."""
    try:
        lead_res = db.table("leads").select("lead_id").eq("lead_id", lead_id).eq("assigned_to", user_email).execute()
        if not lead_res.data:
            raise HTTPException(status_code=404, detail="Lead not found or not assigned to you")

        activity_type = payload.get("activity_type", "")
        valid_types = {"Call", "Email", "Meeting", "Note"}
        if activity_type not in valid_types:
            raise HTTPException(status_code=400, detail=f"activity_type must be one of {valid_types}")

        _log_lead_activity(
            db, lead_id, activity_type,
            summary=payload.get("summary", ""),
            logged_by=user_email,
            outcome=payload.get("outcome"),
            next_action=payload.get("next_action"),
            follow_up_date=payload.get("follow_up_date"),
        )

        update_data: dict = {"updated_at": datetime.utcnow().isoformat()}
        if payload.get("follow_up_date"):
            update_data["follow_up_date"] = payload["follow_up_date"]
        db.table("leads").eq("lead_id", lead_id).update(update_data).execute()

        act_logger = get_activity_logger(db)
        act_logger.log_activity(
            user_email=user_email,
            action_type="CREATE",
            action_description=f"Logged {activity_type} activity on lead {lead_id}",
            entity_type="lead",
            entity_name=lead_id,
            metadata={"lead_id": lead_id, "activity_type": activity_type},
        )

        return {"message": "Activity logged"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error logging activity: {e}")


@router.post("/{lead_id}/close", dependencies=[Depends(verify_permission("work_leads"))])
def close_lead(
    lead_id: str,
    payload: dict,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Close a lead as Converted or Rejected. Lead Owner only."""
    try:
        lead_res = db.table("leads").select("*").eq("lead_id", lead_id).eq("assigned_to", user_email).execute()
        if not lead_res.data:
            raise HTTPException(status_code=404, detail="Lead not found or not assigned to you")
        lead = lead_res.data[0]

        closure_type = payload.get("closure_type", "")
        if closure_type not in ("Converted", "Rejected"):
            raise HTTPException(status_code=400, detail="closure_type must be 'Converted' or 'Rejected'")

        if closure_type == "Rejected" and not payload.get("rejection_reason"):
            raise HTTPException(status_code=400, detail="rejection_reason is required when rejecting a lead")

        update_data = {
            "status": closure_type,
            "closure_type": closure_type,
            "rejection_reason": payload.get("rejection_reason"),
            "conversion_notes": payload.get("conversion_notes"),
            "updated_at": datetime.utcnow().isoformat(),
        }
        db.table("leads").eq("lead_id", lead_id).update(update_data).execute()

        summary = (
            f"Lead converted. Notes: {payload.get('conversion_notes', 'N/A')}"
            if closure_type == "Converted"
            else f"Lead rejected. Reason: {payload.get('rejection_reason')}"
        )
        _log_lead_activity(
            db, lead_id, "Status Change", summary,
            logged_by=user_email, is_auto=True,
        )

        owner_name = _get_user_name(db, user_email)
        _notify_lead_managers(
            db,
            title=f"Lead {closure_type}: {lead_id}",
            message=f"Lead {lead_id} ({lead.get('full_name')}) has been marked as {closure_type} by {owner_name}.",
            action_url="/leads",
        )

        act_logger = get_activity_logger(db)
        act_logger.log_activity(
            user_email=user_email,
            action_type="UPDATE",
            action_description=f"Closed lead {lead_id} as {closure_type}",
            entity_type="lead",
            entity_name=lead_id,
            metadata={"lead_id": lead_id, "closure_type": closure_type},
        )

        return {"message": f"Lead closed as {closure_type}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error closing lead: {e}")


@router.get("/owners/list", dependencies=[Depends(verify_permission("manage_leads"))])
def get_lead_owners(
    db: SupabaseClient = Depends(get_db),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Get all users who have the 'work_leads' permission for the assign dropdown."""
    try:
        # 1. Find all roles that have 'work_leads' permission
        roles_res = db.table("roles").select("role_key, permission_keys").execute()
        valid_roles = [
            r["role_key"] for r in (roles_res.data or [])
            if r.get("permission_keys") and "work_leads" in r["permission_keys"]
        ]
        
        if not valid_roles:
            return {"owners": []}
            
        # 2. Get active users with those roles
        res = db.table("app_users").select("email, name").in_("role", valid_roles).eq("is_active", True).execute()
        return {"owners": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching lead owners: {e}")


# ─── QUOTATIONS ───────────────────────────────────────────────────────────────

@router.get("/{lead_id}/quotation")
def get_quotation(
    lead_id: str,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Get the current quotation for a lead."""
    try:
        res = db.table("quotations").select("*").eq("lead_id", lead_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching quotation: {e}")


@router.put("/{lead_id}/quotation", dependencies=[Depends(verify_permission("work_leads"))])
def upsert_quotation(
    lead_id: str,
    payload: dict,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Upsert a quotation for a lead. Logs an activity."""
    try:
        # Verify lead exists
        lead_res = db.table("leads").select("lead_id").eq("lead_id", lead_id).execute()
        if not lead_res.data:
            raise HTTPException(status_code=404, detail="Lead not found")

        allowed = {"quantity", "material", "unit_price", "total_value", "delivery_time", "payment_terms", "notes"}
        update_data = {k: v for k, v in payload.items() if k in allowed}
        update_data["lead_id"] = lead_id
        update_data["updated_at"] = datetime.utcnow().isoformat()

        # Check if exists
        existing = db.table("quotations").select("id").eq("lead_id", lead_id).execute()
        if existing.data:
            res = db.table("quotations").eq("lead_id", lead_id).update(update_data).execute()
        else:
            res = db.table("quotations").insert(update_data).execute()

        # Log activity
        qty = update_data.get('quantity') or 0
        price = update_data.get('unit_price') or 0
        total = update_data.get('total_value') or 0
        summary = f"Generated quotation for {qty} units at ₹{price} (Total: ₹{total})"
        
        _log_lead_activity(
            db, lead_id, "Quotation", summary,
            logged_by=user_email, is_auto=True,
        )

        return res.data[0] if res.data else {}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error upserting quotation: {e}")
