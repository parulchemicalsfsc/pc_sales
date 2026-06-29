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
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Query, UploadFile, File, Form
from fastapi.responses import HTMLResponse
from supabase_db import SupabaseClient, get_db
from rbac_utils import verify_permission
from jinja2 import Environment, FileSystemLoader
from num2words import num2words
import requests as _requests

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
    return incoming.strip() == registered.strip()


def _get_lead_owners(db: SupabaseClient, lead_id: str) -> list[str]:
    try:
        res = db.table("lead_owners").select("user_email").eq("lead_id", lead_id).execute()
        return [row["user_email"] for row in (res.data or [])]
    except Exception as e:
        logger.warning(f"Failed to fetch owners for lead {lead_id}: {e}")
        return []


def _is_lead_owner(db: SupabaseClient, lead_id: str, email: str) -> bool:
    try:
        res = db.table("lead_owners").select("user_email").eq("lead_id", lead_id).eq("user_email", email).execute()
        return len(res.data or []) > 0
    except Exception as e:
        logger.warning(f"Failed to check owner for lead {lead_id}: {e}")
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
        "source_website": source_website,
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
        if logged_by != "system":
            try:
                db.table("lead_owners").insert({"lead_id": lead_id, "user_email": logged_by}).execute()
            except Exception as owner_err:
                logger.error(f"Failed to insert lead owner for {lead_id}: {owner_err}")
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


# ─── RFQ INTAKE (with optional file attachment) ───────────────────────────────

_ALLOWED_EXTENSIONS = {".pdf", ".dwg", ".dxf", ".step", ".stp", ".png", ".jpg", ".jpeg"}
_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def _upload_to_storage(
    file_bytes: bytes,
    filename: str,
    lead_id: str,
    supabase_url: str,
    supabase_key: str,
) -> str:
    """Upload a file to the rfq-attachments Supabase Storage bucket and return the public URL."""
    safe_filename = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
    path = f"{lead_id}/{safe_filename}"
    url = f"{supabase_url}/storage/v1/object/rfq-attachments/{path}"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/octet-stream",
        "x-upsert": "true",
    }
    resp = _requests.post(url, data=file_bytes, headers=headers)
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=500, detail=f"File upload failed: {resp.text}")
    public_url = f"{supabase_url}/storage/v1/object/public/rfq-attachments/{path}"
    return public_url


def _delete_from_storage(attachment_url: str, supabase_url: str, supabase_key: str):
    """Delete a file from Supabase Storage by its public URL."""
    try:
        # Extract the path after "/public/rfq-attachments/"
        marker = "/object/public/rfq-attachments/"
        if marker in attachment_url:
            path = attachment_url.split(marker, 1)[1]
            del_url = f"{supabase_url}/storage/v1/object/rfq-attachments/{path}"
            headers = {
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
            }
            _requests.delete(del_url, headers=headers)
    except Exception as e:
        logger.warning(f"[LEADS] Failed to delete storage object: {e}")


@router.post("/intake/rfq")
async def intake_rfq(
    request: Request,
    source_website: str = Form(...),
    full_name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    company_name: str = Form(...),
    product_name: str = Form(...),
    quantity: int = Form(...),
    material: str = Form(default=""),
    target_delivery: str = Form(default=""),
    message: str = Form(default=""),
    rate_per_unit: float = Form(default=0.0),
    shipping: float = Form(default=0.0),
    intent: str = Form(default="rfq"),
    street_address: str = Form(default=""),
    city: str = Form(default=""),
    province: str = Form(default=""),
    postal_code: str = Form(default=""),
    attachment: UploadFile = File(default=None),
    db: SupabaseClient = Depends(get_db),
):
    """
    Public endpoint for product websites to submit detailed RFQ enquiries.
    Accepts multipart/form-data with optional file attachment.
    Creates a Lead and pre-fills a draft Quotation automatically.
    """
    logged_by = _verify_intake_key(request, db)

    # Validate required fields
    source_website = source_website.strip()
    full_name = full_name.strip()
    email = email.strip()
    phone = phone.strip()
    company_name = company_name.strip()
    product_name = product_name.strip()

    if not source_website:
        raise HTTPException(status_code=400, detail="source_website is required")
    if not full_name:
        raise HTTPException(status_code=400, detail="full_name is required")
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    if not phone:
        raise HTTPException(status_code=400, detail="phone is required")
    if not company_name:
        raise HTTPException(status_code=400, detail="company_name is required")
    if not product_name:
        raise HTTPException(status_code=400, detail="product_name is required")

    # Validate source
    try:
        active_sources = db.table("lead_sources").select("*").eq("is_active", True).execute().data or []
    except Exception as e:
        logger.error(f"Failed to fetch active sources: {e}")
        active_sources = []

    matched_source = None
    for src in active_sources:
        if _is_name_match(source_website, src["name"]):
            matched_source = src
            break

    if not matched_source:
        raise HTTPException(
            status_code=400,
            detail="Submissions are only accepted from registered websites. Please contact the administrator."
        )

    source_name = matched_source["name"]
    prefix = matched_source["prefix"]
    lead_id = _generate_lead_id(db, prefix)

    # Validate and upload attachment (if provided)
    attachment_url = None
    attachment_name = None
    if attachment and attachment.filename:
        ext = os.path.splitext(attachment.filename)[1].lower()
        if ext not in _ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type '{ext}' is not allowed. Allowed: {', '.join(_ALLOWED_EXTENSIONS)}"
            )
        file_bytes = await attachment.read()
        if len(file_bytes) > _MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File size exceeds the 10MB limit.")

        supabase_url = os.getenv("SUPABASE_URL", "")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY", "")
        attachment_url = _upload_to_storage(file_bytes, attachment.filename, lead_id, supabase_url, supabase_key)
        attachment_name = attachment.filename

    # Build merged product description
    material_clean = (material or "").strip()
    merged_description = product_name
    if material_clean:
        merged_description = f"{product_name} (Material: {material_clean})"

    # Handle Address mapping
    address_line_1 = company_name
    address_line_2 = ""
    
    if street_address or city or province or postal_code:
        address_line_1 = street_address.strip() or company_name
        address_line_2 = ", ".join([p for p in [city, province, postal_code] if p.strip()])

    final_message = (message or "").strip()
    if intent.lower() == "purchase":
        final_message = f"[PURCHASE INTENT] {final_message}".strip()

    # Create lead record
    lead_data = {
        "lead_id": lead_id,
        "source_website": source_name,
        "full_name": full_name,
        "email": email,
        "phone": phone,
        "company_name": company_name,
        "product_interest": merged_description,
        "message": final_message or None,
        "rfq_quantity": quantity,
        "rfq_material": material_clean or None,
        "rfq_delivery": (target_delivery or "").strip() or None,
        "attachment_url": attachment_url,
        "attachment_name": attachment_name,
        "status": "Unassigned",
    }

    if logged_by != "system":
        lead_data["assigned_to"] = logged_by
        lead_data["status"] = "Assigned"

    try:
        db.table("leads").insert(lead_data).execute()
        if logged_by != "system":
            try:
                db.table("lead_owners").insert({"lead_id": lead_id, "user_email": logged_by}).execute()
            except Exception as owner_err:
                logger.error(f"Failed to insert lead owner for {lead_id}: {owner_err}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create lead: {e}")

    # Pre-populate a draft Quotation
    try:
        is_vibgyor = source_name.lower().strip() in ["vibgyor maple", "vibgyor_maple"]
        product_desc = "Grasshawk KLAW™ Professional Mole Trap" if is_vibgyor else merged_description
        
        amount = quantity * rate_per_unit
        items_total = amount
        transportation_charge = shipping

        if is_vibgyor:
            cgst_percent = 13
            sgst_percent = 0
        else:
            cgst_percent = 9
            sgst_percent = 9
            
        cgst_amount = round((items_total + transportation_charge) * cgst_percent / 100, 2)
        sgst_amount = round((items_total + transportation_charge) * sgst_percent / 100, 2)
        total_gst_amount = cgst_amount + sgst_amount
        grand_total = items_total + transportation_charge + total_gst_amount

        draft_data = {
            "lead_id": lead_id,
            "is_draft": True,
            "name": full_name,
            "email": email,
            "address_line_1": address_line_1,
            "address_line_2": address_line_2,
            "address_line_3": "",
            "delivery_requirement": (target_delivery or "").strip() or None,
            "notes": final_message or None,
            "payment_terms": "50% Advance, 50% on Dispatch",
            "items": [
                {
                    "po_sr_no": "1",
                    "description": product_desc,
                    "hsn_code": "",
                    "packages": "",
                    "quantity": quantity,
                    "rate_per_unit": rate_per_unit,
                    "amount": amount,
                }
            ],
            "items_total": items_total,
            "transportation_charge": transportation_charge,
            "grand_total": grand_total,
            "cgst_percent": cgst_percent,
            "cgst_amount": cgst_amount,
            "sgst_percent": sgst_percent,
            "sgst_amount": sgst_amount,
            "total_gst_amount": total_gst_amount,
            "loose_count": quantity,
            "attachment_url": attachment_url,
            "attachment_name": attachment_name,
            "updated_at": datetime.utcnow().isoformat(),
        }
        db.table("quotations").insert(draft_data).execute()
    except Exception as e:
        logger.warning(f"[LEADS] Failed to create draft quotation for {lead_id}: {e}")

    activity_message = f"RFQ Lead received from {source_name}"
    if intent.lower() == "purchase":
        activity_message = f"Purchase Intent Lead received from {source_name}"
            
    if attachment_name:
        activity_message += f" (with attachment: {attachment_name})"

    _log_lead_activity(
        db, lead_id, "Assignment",
        activity_message,
        logged_by="system", is_auto=True,
    )
    _notify_lead_managers(
        db,
        title=f"New RFQ Lead: {full_name}",
        message=f"New RFQ enquiry from {full_name} ({company_name}) via {source_name}. "
                f"Product: {merged_description}, Qty: {quantity}.",
        action_url="/leads",
    )

    logger.info(f"[LEADS] New RFQ lead created: {lead_id}")
    return {"lead_id": lead_id, "status": lead_data["status"], "message": "RFQ Lead created successfully"}


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
            owner_res = db.table("lead_owners").select("lead_id").eq("user_email", assigned_to).execute()
            matching_ids = [row["lead_id"] for row in (owner_res.data or [])]
            if not matching_ids:
                return {"leads": [], "total": 0, "limit": limit, "offset": offset}
            query = query.in_("lead_id", matching_ids)
        if source:
            query = query.eq("source_website", source)
        if date_from:
            query = query.gte("created_at", date_from)
        if date_to:
            query = query.lte("created_at", date_to)

        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
        res = query.execute()
        leads = res.data or []

        # Populate owners for each lead
        if leads:
            lead_ids = [l["lead_id"] for l in leads]
            owners_res = db.table("lead_owners").select("lead_id, user_email").in_("lead_id", lead_ids).execute()
            owners_by_lead = {}
            for row in (owners_res.data or []):
                lid = row["lead_id"]
                email = row["user_email"]
                owners_by_lead.setdefault(lid, []).append(email)
            for lead in leads:
                lead_owners = owners_by_lead.get(lead["lead_id"], [])
                lead["assigned_to"] = ", ".join(lead_owners) if lead_owners else None

        count_q = db.table("leads").select("lead_id", count="exact")
        if status:
            count_q = count_q.eq("status", status)
        if assigned_to:
            owner_res = db.table("lead_owners").select("lead_id").eq("user_email", assigned_to).execute()
            matching_ids = [row["lead_id"] for row in (owner_res.data or [])]
            count_q = count_q.in_("lead_id", matching_ids) if matching_ids else count_q.eq("lead_id", "none")
        if source:
            count_q = count_q.eq("source_website", source)
        count_res = count_q.execute()
        total = count_res.count or len(count_res.data or [])

        return {"leads": leads, "total": total, "limit": limit, "offset": offset}
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
            owner_res = db.table("lead_owners").select("lead_id").eq("user_email", user_email).execute()
            matching_ids = [row["lead_id"] for row in (owner_res.data or [])]
            if not matching_ids:
                return {
                    "total": 0, "unassigned": 0, "assigned": 0, "in_progress": 0,
                    "follow_up": 0, "converted": 0, "rejected": 0, "overdue": 0,
                    "converted_this_month": 0, "by_source": {}, "by_status": {}
                }
            leads_res = db.table("leads").select("*").in_("lead_id", matching_ids).execute()
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
        owner_res = db.table("lead_owners").select("lead_id").eq("user_email", user_email).execute()
        matching_ids = [row["lead_id"] for row in (owner_res.data or [])]
        if not matching_ids:
            return {"leads": [], "total": 0}

        query = db.table("leads").select("*").in_("lead_id", matching_ids)
        if status:
            query = query.eq("status", status)
        res = query.order("created_at", desc=True).execute()

        leads = res.data or []
        
        # Populate owners for backward compatibility
        if leads:
            lead_ids = [l["lead_id"] for l in leads]
            owners_res = db.table("lead_owners").select("lead_id, user_email").in_("lead_id", lead_ids).execute()
            owners_by_lead = {}
            for row in (owners_res.data or []):
                lid = row["lead_id"]
                email = row["user_email"]
                owners_by_lead.setdefault(lid, []).append(email)
            for lead in leads:
                lead_owners = owners_by_lead.get(lead["lead_id"], [])
                lead["assigned_to"] = ", ".join(lead_owners) if lead_owners else None

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
            err_msg = str(e)
            if "duplicate key" in err_msg or "already exists" in err_msg or "409 Client Error: Conflict" in err_msg:
                raise HTTPException(status_code=400, detail="A source with this Name or Prefix already exists. Please make sure the Name and the 2-letter Prefix are unique.")
            raise HTTPException(status_code=500, detail=f"Failed to update lead source: {e}")
    else:
        # Check prefix uniqueness
        source_data["prefix"] = prefix
        try:
            db.table("lead_sources").insert(source_data).execute()
            return {"message": "Lead source created successfully"}
        except Exception as e:
            err_msg = str(e)
            # PostgREST 409 Conflict indicates unique constraint violation (duplicate name or prefix)
            if "duplicate key" in err_msg or "already exists" in err_msg or "409 Client Error: Conflict" in err_msg:
                raise HTTPException(status_code=400, detail="A source with this Name or Prefix already exists. Please make sure the Name and the 2-letter Prefix are unique.")
            
            # Optionally try to parse the JSON for more detailed info
            if hasattr(e, "response") and e.response is not None:
                try:
                    err_json = e.response.json()
                    if err_json.get("code") == "23505": # Postgres unique_violation
                        raise HTTPException(status_code=400, detail="A source with this Name or Prefix already exists. Please make sure the Name and the 2-letter Prefix are unique.")
                except Exception:
                    pass

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
        if not _is_lead_owner(db, lead_id, user_email):
            raise HTTPException(status_code=404, detail="Lead not found or not assigned to you")
        lead = _get_lead_or_404(db, lead_id)
        owners = _get_lead_owners(db, lead_id)
        lead["assigned_to"] = ", ".join(owners) if owners else None
        return lead
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
        assigned_val = payload.get("assigned_to")
        note = payload.get("note", "").strip()
        if not assigned_val:
            raise HTTPException(status_code=400, detail="assigned_to is required")

        if isinstance(assigned_val, str):
            assigned_emails = [e.strip() for e in assigned_val.split(",") if e.strip()]
        elif isinstance(assigned_val, list):
            assigned_emails = [str(e).strip() for e in assigned_val if str(e).strip()]
        else:
            raise HTTPException(status_code=400, detail="assigned_to must be a string or list of emails")

        if not assigned_emails:
            raise HTTPException(status_code=400, detail="At least one owner email is required")

        lead = _get_lead_or_404(db, lead_id)
        old_owners = _get_lead_owners(db, lead_id)
        is_reassign = set(old_owners) != set(assigned_emails)

        # Update junction table
        db.table("lead_owners").eq("lead_id", lead_id).delete().execute()
        insert_rows = [{"lead_id": lead_id, "user_email": email} for email in assigned_emails]
        db.table("lead_owners").insert(insert_rows).execute()

        # Update legacy column
        db.table("leads").eq("lead_id", lead_id).update({
            "assigned_to": ", ".join(assigned_emails),
            "status": "Assigned",
            "updated_at": datetime.utcnow().isoformat(),
        }).execute()

        owner_names = []
        for email in assigned_emails:
            owner_names.append(_get_user_name(db, email))
        owner_names_str = ", ".join(owner_names)
        manager_name = _get_user_name(db, user_email)

        action = "Reassigned" if is_reassign else "Assigned"
        _log_lead_activity(
            db, lead_id, "Assignment",
            f"{action} to {owner_names_str} by {manager_name}",
            logged_by=user_email, is_auto=True,
        )
        _log_lead_activity(
            db, lead_id, "Status Change",
            f"Status changed from {lead.get('status', 'Unassigned')} to Assigned",
            logged_by=user_email, is_auto=True,
        )
        if note:
            _log_lead_activity(db, lead_id, "Manager Note", note, logged_by=user_email)

        for email in assigned_emails:
            _notify_user(
                db, email,
                title=f"Lead {action}: {lead_id}",
                message=f"Lead from {lead.get('full_name')} ({lead.get('company_name', 'N/A')}) has been "
                        f"{'reassigned' if is_reassign else 'assigned'} to you."
                        + (f" Manager note: {note}" if note else ""),
                action_url="/lead-workspace",
            )
            
        for email in old_owners:
            if email not in assigned_emails:
                _notify_user(
                    db, email,
                    title=f"Lead Reassigned: {lead_id}",
                    message=f"Lead from {lead.get('full_name')} has been reassigned to {owner_names_str}.",
                    action_url="/lead-workspace",
                )

        act_logger = get_activity_logger(db)
        act_logger.log_activity(
            user_email=user_email,
            action_type="UPDATE",
            action_description=f"{action} lead {lead_id} to {owner_names_str}",
            entity_type="lead",
            entity_name=lead_id,
            metadata={"lead_id": lead_id, "assigned_to": assigned_emails},
        )

        return {"message": f"Lead {action.lower()} successfully to {owner_names_str}"}
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

        owners = _get_lead_owners(db, lead_id)
        for owner in owners:
            _notify_user(
                db, owner,
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
        if not _is_lead_owner(db, lead_id, user_email):
            raise HTTPException(status_code=404, detail="Lead not found or not assigned to you")
        lead_res = db.table("leads").select("*").eq("lead_id", lead_id).execute()
        lead = lead_res.data[0] if lead_res.data else {}

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
        if not _is_lead_owner(db, lead_id, user_email):
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
        if not _is_lead_owner(db, lead_id, user_email):
            raise HTTPException(status_code=404, detail="Lead not found or not assigned to you")
        lead_res = db.table("leads").select("*").eq("lead_id", lead_id).execute()
        lead = lead_res.data[0] if lead_res.data else {}

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
    """Get the current draft quotation for a lead."""
    try:
        res = db.table("quotations").select("*").eq("lead_id", lead_id).eq("is_draft", True).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching quotation draft: {e}")

@router.get("/{lead_id}/quotations/history")
def get_quotation_history(
    lead_id: str,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Get all committed versions for a lead, sorted newest to oldest."""
    try:
        res = db.table("quotations").select("*").eq("lead_id", lead_id).eq("is_draft", False).order("version", desc=True).execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching quotation history: {e}")

@router.put("/{lead_id}/quotation", dependencies=[Depends(verify_permission("work_leads"))])
def upsert_quotation(
    lead_id: str,
    payload: dict,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Upsert a draft quotation for a lead. Does not increment version."""
    try:
        # Verify lead exists
        lead_res = db.table("leads").select("lead_id").eq("lead_id", lead_id).execute()
        if not lead_res.data:
            raise HTTPException(status_code=404, detail="Lead not found")

        allowed = {
            "name", "email", "address_line_1", "address_line_2", "address_line_3", "quotation_no", "quotation_date", "buyer_order_no", 
            "buyer_order_date", "lr_despatched_through", "destination", "supplier_code", 
            "payment_terms", "items", "items_total", "grand_total", "cgst_percent", 
            "cgst_amount", "sgst_percent", "sgst_amount", "total_gst_amount", "loose_count", 
            "gst_note", "penalty_late_delivery", "delivery_requirement", "packing_forwarding", 
            "freight_charges", "transportation_charge", "notes", "customer_gst_no"
        }
        update_data = {k: v for k, v in payload.items() if k in allowed}
        update_data["lead_id"] = lead_id
        update_data["updated_at"] = datetime.utcnow().isoformat()
        update_data["is_draft"] = True

        # Check if draft exists
        existing = db.table("quotations").select("id").eq("lead_id", lead_id).eq("is_draft", True).execute()
        if existing.data:
            res = db.table("quotations").eq("id", existing.data[0]["id"]).update(update_data).execute()
        else:
            res = db.table("quotations").insert(update_data).execute()

        # Log activity
        total = update_data.get('grand_total') or 0
        _log_lead_activity(
            db, lead_id, "Quotation Draft", f"Saved quotation draft (Grand Total: ₹{total})",
            logged_by=user_email, is_auto=True,
        )

        return res.data[0] if res.data else {}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving quotation draft: {e}")

@router.post("/{lead_id}/quotation/commit", dependencies=[Depends(verify_permission("work_leads"))])
def commit_quotation(
    lead_id: str,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Commit the current draft into a version, and spawn a new draft."""
    try:
        # Get current draft
        draft_res = db.table("quotations").select("*").eq("lead_id", lead_id).eq("is_draft", True).execute()
        if not draft_res.data:
            raise HTTPException(status_code=404, detail="No active draft found to commit.")
        
        draft = draft_res.data[0]
        draft_id = draft["id"]
        
        # Calculate next version
        history_res = db.table("quotations").select("version").eq("lead_id", lead_id).eq("is_draft", False).order("version", desc=True).limit(1).execute()
        next_version = 1
        if history_res.data and history_res.data[0].get("version"):
            next_version = int(history_res.data[0]["version"]) + 1
            
        quote_version_id = f"{lead_id}/{next_version:03d}"
        
        # 1. Update draft to be locked version
        lock_data = {
            "is_draft": False,
            "version": next_version,
            "quote_version_id": quote_version_id,
            "updated_at": datetime.utcnow().isoformat()
        }
        locked_res = db.table("quotations").eq("id", draft_id).update(lock_data).execute()
        if not locked_res.data:
            raise HTTPException(status_code=500, detail="Failed to lock version.")
            
        locked_quote = locked_res.data[0]
        
        # 2. Spawn new draft based on this locked version (so next edits start from here)
        new_draft = {**draft}
        for k in ["id", "version", "quote_version_id", "created_at", "updated_at"]:
            new_draft.pop(k, None)
            
        new_draft["is_draft"] = True
        db.table("quotations").insert(new_draft).execute()
        
        # Log activity
        total = locked_quote.get('grand_total') or 0
        _log_lead_activity(
            db, lead_id, "Quotation Finalized", f"Created Version {quote_version_id} (Grand Total: ₹{total})",
            logged_by=user_email, is_auto=True,
        )
        
        return locked_quote

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error committing quotation: {e}")
        raise HTTPException(status_code=500, detail=f"Error committing quotation: {e}")


@router.post("/{lead_id}/quotation/attachment", dependencies=[Depends(verify_permission("work_leads"))])
async def upload_quotation_attachment(
    lead_id: str,
    file: UploadFile = File(...),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Upload or replace the attachment on the current draft quotation."""
    try:
        # Validate file
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in _ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type '{ext}' is not allowed. Allowed: {', '.join(_ALLOWED_EXTENSIONS)}"
            )
        file_bytes = await file.read()
        if len(file_bytes) > _MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File size exceeds the 10MB limit.")

        # Get current draft
        existing = db.table("quotations").select("id, attachment_url").eq("lead_id", lead_id).eq("is_draft", True).execute()
        if not existing.data:
            # Fetch lead details to populate basic quotation draft fields
            lead = _get_lead_or_404(db, lead_id)
            is_vibgyor = lead.get("source_website", "").lower().strip() in ["vibgyor maple", "vibgyor_maple"]
            product_desc = "Grasshawk KLAW™ Professional Mole Trap" if is_vibgyor else (lead.get("product_interest") or "")
            draft_data = {
                "lead_id": lead_id,
                "is_draft": True,
                "name": lead.get("full_name") or "",
                "email": lead.get("email") or "",
                "address_line_1": lead.get("company_name") or "",
                "address_line_2": "",
                "address_line_3": "",
                "delivery_requirement": lead.get("rfq_delivery") or None,
                "notes": lead.get("message") or None,
                "payment_terms": "50% Advance, 50% on Dispatch",
                "items": [
                    {
                        "po_sr_no": "1",
                        "description": product_desc,
                        "hsn_code": "",
                        "packages": "",
                        "quantity": lead.get("rfq_quantity") or 1,
                        "rate_per_unit": 0,
                        "amount": 0,
                    }
                ],
                "items_total": 0,
                "grand_total": 0,
                "cgst_percent": 9,
                "cgst_amount": 0,
                "sgst_percent": 9,
                "sgst_amount": 0,
                "total_gst_amount": 0,
                "loose_count": lead.get("rfq_quantity") or 1,
                "attachment_url": None,
                "attachment_name": None,
                "updated_at": datetime.utcnow().isoformat(),
            }
            insert_res = db.table("quotations").insert(draft_data).execute()
            if not insert_res.data:
                raise HTTPException(status_code=500, detail="Failed to create draft quotation.")
            draft = insert_res.data[0]
        else:
            draft = existing.data[0]

        # Delete old attachment if any
        supabase_url = os.getenv("SUPABASE_URL", "")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY", "")
        if draft.get("attachment_url"):
            _delete_from_storage(draft["attachment_url"], supabase_url, supabase_key)

        # Upload new file
        new_url = _upload_to_storage(file_bytes, file.filename, lead_id, supabase_url, supabase_key)
        new_name = file.filename

        # Update draft
        updated = db.table("quotations").eq("id", draft["id"]).update({
            "attachment_url": new_url,
            "attachment_name": new_name,
            "updated_at": datetime.utcnow().isoformat(),
        }).execute()

        # Also update lead record
        db.table("leads").eq("lead_id", lead_id).update({
            "attachment_url": new_url,
            "attachment_name": new_name,
            "updated_at": datetime.utcnow().isoformat(),
        }).execute()

        _log_lead_activity(
            db, lead_id, "Note",
            f"Attachment uploaded: {new_name}",
            logged_by=user_email or "system", is_auto=True,
        )

        return {"message": "Attachment uploaded", "attachment_url": new_url, "attachment_name": new_name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading attachment: {e}")


@router.delete("/{lead_id}/quotation/attachment", dependencies=[Depends(verify_permission("work_leads"))])
def delete_quotation_attachment(
    lead_id: str,
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    db: SupabaseClient = Depends(get_db),
):
    """Remove the attachment from the current draft quotation."""
    try:
        existing = db.table("quotations").select("id, attachment_url, attachment_name").eq("lead_id", lead_id).eq("is_draft", True).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="No active draft found for this lead.")
        draft = existing.data[0]

        if not draft.get("attachment_url"):
            return {"message": "No attachment to delete."}

        supabase_url = os.getenv("SUPABASE_URL", "")
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY", "")
        _delete_from_storage(draft["attachment_url"], supabase_url, supabase_key)

        db.table("quotations").eq("id", draft["id"]).update({
            "attachment_url": None,
            "attachment_name": None,
            "updated_at": datetime.utcnow().isoformat(),
        }).execute()

        # Also update lead record
        db.table("leads").eq("lead_id", lead_id).update({
            "attachment_url": None,
            "attachment_name": None,
            "updated_at": datetime.utcnow().isoformat(),
        }).execute()

        _log_lead_activity(
            db, lead_id, "Note",
            f"Attachment removed: {draft.get('attachment_name', 'file')}",
            logged_by=user_email or "system", is_auto=True,
        )

        return {"message": "Attachment deleted successfully."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting attachment: {e}")

@router.get("/{lead_id}/quotation/html")
def get_quotation_html(
    lead_id: str,
    quote_version_id: Optional[str] = Query(None),
    db: SupabaseClient = Depends(get_db),
):
    """Generate HTML quotation using Jinja2 templates."""
    try:
        lead_res = db.table("leads").select("*").eq("lead_id", lead_id).execute()
        if not lead_res.data:
            raise HTTPException(status_code=404, detail="Lead not found")
        lead = lead_res.data[0]
        
        if quote_version_id:
            quote_res = db.table("quotations").select("*").eq("quote_version_id", quote_version_id).execute()
        else:
            # Fallback to latest drafted or committed if no version specified
            # Usually we wouldn't reach here if we strict generate only for committed.
            # But let's fetch draft or max version.
            quote_res = db.table("quotations").select("*").eq("lead_id", lead_id).eq("is_draft", False).order("version", desc=True).limit(1).execute()
            if not quote_res.data:
                quote_res = db.table("quotations").select("*").eq("lead_id", lead_id).eq("is_draft", True).execute()
            
        if not quote_res.data:
            raise HTTPException(status_code=404, detail="Quotation not found")
        quote = quote_res.data[0]

        # Template data
        data = {**quote}
        data["lead"] = lead
        data["quote_items"] = data.get("items") or []
        
        # Helper function for currency conversion
        def in_words(amount):
            try:
                words = num2words(int(round(float(amount))), lang='en_IN')
                return f"Rs. {words.upper()} ONLY."
            except:
                return "Rs. ZERO ONLY."

        data["in_words"] = in_words

        env = Environment(loader=FileSystemLoader("data"))
        source_website = lead.get("source_website", "").lower()
        if source_website in ["psi", "press stamping industries", "press_stamping_industries"]:
            template = env.get_template("psi_quotation.html")
        elif source_website in ["vibgyor maple", "vibgyor_maple"]:
            template = env.get_template("vibgyor_quotation.html")
        else:
            template = env.get_template("parulquote.html")
            
        html_content = template.render(data=data)
        return HTMLResponse(content=html_content)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating quotation HTML: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating quotation HTML: {e}")
