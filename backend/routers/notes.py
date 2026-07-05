"""
Credit/Debit Notes Router
--------------------------
Endpoints:
  GET  /api/notes/              → list all notes (paginated)
  GET  /api/notes/sale/{sale_id} → notes for a specific sale
  POST /api/notes/              → create a new note
  PATCH /api/notes/{note_id}/void → void a note (admin/manager only)

IMPORTANT: The parameterless GET / is registered BEFORE the parameterized
GET /{note_id} variant to prevent FastAPI's top-to-bottom route resolution
from accidentally matching "" as a note_id.
"""

from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from models import NoteCreate
from supabase_db import SupabaseClient, get_supabase
from rbac_utils import verify_permission
from activity_logger import get_activity_logger

# Import shared balance utility (defined in balance_utils.py)
from routers.balance_utils import calculate_remaining_balance

router = APIRouter()


# ─── LIST ALL (must be registered before any /{param} routes) ─────────────────

@router.get("/", dependencies=[Depends(verify_permission("view_payments"))])
def list_notes(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    note_type: Optional[str] = Query(None, description="Filter by 'credit' or 'debit'"),
    status: Optional[str] = Query(None, description="Filter by 'active' or 'void'"),
    requires_pickup: Optional[bool] = Query(None, description="Filter by physical pickup requirement"),
    db: SupabaseClient = Depends(get_supabase),
):
    """List all credit/debit notes (paginated). Useful for finance summaries."""
    try:
        q = db.table("credit_debit_notes").select("*").order("created_at", desc=True)
        if note_type:
            q = q.eq("note_type", note_type)
        if status:
            q = q.eq("status", status)
        if requires_pickup is not None:
            q = q.eq("requires_pickup", requires_pickup)
        q = q.limit(limit).offset(skip)
        response = q.execute()
        return response.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching notes: {str(e)}")


# ─── GET NOTES FOR A SPECIFIC SALE ────────────────────────────────────────────

@router.get("/sale/{sale_id}", dependencies=[Depends(verify_permission("view_payments"))])
def get_notes_for_sale(sale_id: int, db: SupabaseClient = Depends(get_supabase)):
    """Fetch all credit/debit notes associated with a specific sale."""
    try:
        response = (
            db.table("credit_debit_notes")
            .select("*")
            .eq("sale_id", sale_id)
            .order("created_at", desc=True)
            .execute()
        )
        return response.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching notes for sale: {str(e)}")


# ─── GET SALE ITEMS (for Credit Note return dialog) ──────────────────────────

@router.get("/sale/{sale_id}/items", dependencies=[Depends(verify_permission("view_payments"))])
def get_sale_items_for_return(sale_id: int, db: SupabaseClient = Depends(get_supabase)):
    """
    Return the line items of a sale enriched with already-returned quantities.
    Used to pre-populate the Credit Note return dialog with correct stepper maximums.

    Each item includes:
      original_qty         — quantity in the original sale
      already_returned_qty — sum of return_qty for this product across active credit notes on this sale
      available_to_return_qty — original_qty - already_returned_qty  (stepper max)
      rate                 — sale-time rate (NOT current product rate)
    """
    try:
        # Fetch sale basic info
        sale_resp = db.table("sales").select(
            "sale_id, invoice_no, sale_date, customer_id, distributor_id, doctor_id, shopkeeper_id, buyer_type, total_amount"
        ).eq("sale_id", sale_id).execute()
        if not sale_resp.data:
            raise HTTPException(status_code=404, detail=f"Sale {sale_id} not found")
        sale = sale_resp.data[0]

        # Fetch original sale items (rate here is the sale-time rate — authoritative)
        items_resp = db.table("sale_items").select(
            "sale_item_id, sale_id, product_id, quantity, rate, amount"
        ).eq("sale_id", sale_id).execute()
        items = items_resp.data or []

        # Enrich with product names
        if items:
            product_ids = [i["product_id"] for i in items if i.get("product_id")]
            prod_resp = db.table("products").select("product_id, product_name").in_("product_id", product_ids).execute()
            prod_map = {p["product_id"]: p["product_name"] for p in (prod_resp.data or [])}
            for item in items:
                item["product_name"] = prod_map.get(item["product_id"], "Unknown Product")

        # ── Already-returned quantities per product from previous active credit notes ──
        # Sum return_qty from return_items JSONB across all active credit notes on this sale
        already_returned: dict[int, int] = {}
        try:
            prev_notes_resp = (
                db.table("credit_debit_notes")
                .select("return_items")
                .eq("sale_id", sale_id)
                .eq("note_type", "credit")
                .eq("status", "active")
                .execute()
            )
            for prev_note in (prev_notes_resp.data or []):
                prev_return_items = prev_note.get("return_items") or []
                for ri in prev_return_items:
                    pid = int(ri.get("product_id", 0))
                    rqty = int(ri.get("return_qty", 0))
                    already_returned[pid] = already_returned.get(pid, 0) + rqty
        except Exception as e:
            print(f"[get_sale_items_for_return] Warning: could not sum previous returns: {e}")

        # Attach already_returned_qty and available_to_return_qty to each item
        for item in items:
            pid = item["product_id"]
            orig_qty = int(item["quantity"])
            returned = already_returned.get(pid, 0)
            available = max(0, orig_qty - returned)
            item["already_returned_qty"] = returned
            item["available_to_return_qty"] = available

        # Resolve customer name
        buyer_type = sale.get("buyer_type") or "customer"
        customer_name = "Unknown"
        try:
            if buyer_type in ("mantri", "distributor") and sale.get("distributor_id"):
                r = db.table("distributors").select("name, mantri_name").eq("distributor_id", sale["distributor_id"]).execute()
                if r.data: customer_name = r.data[0].get("mantri_name") or r.data[0].get("name") or "Unknown"
            elif buyer_type == "doctor" and sale.get("doctor_id"):
                r = db.table("doctors").select("name").eq("doctor_id", sale["doctor_id"]).execute()
                if r.data: customer_name = r.data[0].get("name") or "Unknown"
            elif buyer_type == "shopkeeper" and sale.get("shopkeeper_id"):
                r = db.table("shopkeepers").select("name").eq("shopkeeper_id", sale["shopkeeper_id"]).execute()
                if r.data: customer_name = r.data[0].get("name") or "Unknown"
            else:
                r = db.table("customers").select("name").eq("customer_id", sale["customer_id"]).execute()
                if r.data: customer_name = r.data[0].get("name") or "Unknown"
        except Exception:
            pass

        return {
            "sale": {**sale, "customer_name": customer_name},
            "items": items,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching sale items: {str(e)}")


# ─── CREATE NOTE ──────────────────────────────────────────────────────────────

@router.post("/", dependencies=[Depends(verify_permission("record_payment"))])
def create_note(
    note: NoteCreate,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """
    Create a new Credit or Debit Note for a sale.
    - Triggers recalculation of the sale's payment_status after creation.
    """
    try:
        # Validate note_type
        if note.note_type not in ("credit", "debit"):
            raise HTTPException(status_code=400, detail="note_type must be 'credit' or 'debit'")

        # Validate amount
        if note.amount <= 0:
            raise HTTPException(status_code=400, detail="amount must be greater than 0")

        # Validate reason
        if not note.reason or not note.reason.strip():
            raise HTTPException(status_code=400, detail="reason is required")

        # Verify sale exists
        sale_check = db.table("sales").select("sale_id, total_amount, invoice_no").eq("sale_id", note.sale_id).execute()
        if not sale_check.data:
            raise HTTPException(status_code=404, detail=f"Sale {note.sale_id} not found")

        sale = sale_check.data[0]
        sale_invoice_no = sale.get("invoice_no")

        note_data = {
            "note_type": note.note_type,
            "sale_id": note.sale_id,
            "invoice_no": sale_invoice_no,
            "amount": float(note.amount),
            "reason": note.reason.strip(),
            "issue_date": note.issue_date,
            "status": "active",
            "adjust_inventory": note.adjust_inventory,
            "requires_pickup": note.requires_pickup,
            "pickup_items": note.pickup_items if note.requires_pickup else None,
            "pickup_status": "pending_pickup" if note.requires_pickup else None,
            # TODO: When inventory tracking is implemented, check adjust_inventory flag
            # here and call the inventory adjustment service accordingly.
        }

        # ── For Credit Notes with return items: validate + override pickup fields ──
        if note.note_type == "credit" and note.return_items:
            # 1. Validate at least 1 item is being returned
            total_return_qty = sum(int(ri.get("return_qty", 0)) for ri in note.return_items)
            if total_return_qty < 1:
                raise HTTPException(status_code=400, detail="At least 1 item must be returned for a credit note")

            # 2. Validate per-item: return_qty must not exceed available_to_return_qty
            orig_items_resp = db.table("sale_items").select("product_id, quantity").eq("sale_id", note.sale_id).execute()
            orig_qty_map = {i["product_id"]: int(i["quantity"]) for i in (orig_items_resp.data or [])}

            # Sum already-returned quantities from previous active credit notes
            prev_returned: dict = {}
            prev_notes_resp = (
                db.table("credit_debit_notes")
                .select("return_items")
                .eq("sale_id", note.sale_id)
                .eq("note_type", "credit")
                .eq("status", "active")
                .execute()
            )
            for pn in (prev_notes_resp.data or []):
                for ri in (pn.get("return_items") or []):
                    pid = int(ri.get("product_id", 0))
                    prev_returned[pid] = prev_returned.get(pid, 0) + int(ri.get("return_qty", 0))

            for ri in note.return_items:
                pid = int(ri.get("product_id", 0))
                rqty = int(ri.get("return_qty", 0))
                if rqty <= 0:
                    continue
                orig_qty = orig_qty_map.get(pid, 0)
                already = prev_returned.get(pid, 0)
                available = max(0, orig_qty - already)
                if rqty > available:
                    pname = ri.get("product_name", f"Product #{pid}")
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot return {rqty} of '{pname}': only {available} available (original: {orig_qty}, already returned: {already})"
                    )

            # 3. Auto-build pickup_items description + store snapshot
            pickup_desc_parts = [
                f"{int(ri['return_qty'])}x {ri.get('product_name', 'Item')}"
                for ri in note.return_items
                if int(ri.get("return_qty", 0)) > 0
            ]
            auto_pickup_text = ", ".join(pickup_desc_parts)

            note_data["requires_pickup"] = True
            note_data["pickup_items"] = auto_pickup_text
            note_data["pickup_status"] = "pending_pickup"
            note_data["return_items"] = note.return_items  # Snapshot with sale-time rates


        insert_response = db.table("credit_debit_notes").insert(note_data).execute()
        if not insert_response.data:
            raise HTTPException(status_code=500, detail="Failed to create note")

        created_note = insert_response.data[0]

        # Recalculate sale payment status
        calculate_remaining_balance(note.sale_id, db)

        # ── If this is a DEBIT note: auto-create a linked Sale (payment NOT recorded) ──
        created_debit_sale = None
        if note.note_type == "debit":
            try:
                # Inherit buyer FK columns and original invoice_no from the original sale
                orig_sale_resp = db.table("sales").select(
                    "invoice_no, customer_id, distributor_id, doctor_id, shopkeeper_id, buyer_type"
                ).eq("sale_id", note.sale_id).execute()
                orig_sale = orig_sale_resp.data[0] if orig_sale_resp.data else {}
                orig_invoice_no = orig_sale.get("invoice_no") or f"SALE{note.sale_id}"

                # Resolve invoice number: use provided or auto-generate based on original sale
                if note.debit_invoice_no and note.debit_invoice_no.strip():
                    debit_invoice_no = note.debit_invoice_no.strip()
                else:
                    # Count existing debit notes for this sale to determine prefix
                    debits_resp = db.table("credit_debit_notes").select("note_id").eq("sale_id", note.sale_id).eq("note_type", "debit").execute()
                    debits_count = len(debits_resp.data or [])
                    # debits_count includes the one we just created
                    if debits_count <= 1:
                        prefix = "DR"
                    else:
                        prefix = f"DR{debits_count}"
                    debit_invoice_no = f"{prefix}{orig_invoice_no}"

                debit_sale_data = {
                    "invoice_no": debit_invoice_no,
                    "sale_date": note.issue_date,
                    "total_amount": float(note.amount),
                    "total_liters": 0,
                    "payment_status": "Pending",   # Payment NOT recorded — must be added manually like any other sale
                    "notes": f"Auto-created for Debit Note #{created_note.get('note_id')} — {note.reason}",
                    "buyer_type": orig_sale.get("buyer_type") or "customer",
                    "customer_id": orig_sale.get("customer_id"),
                    "distributor_id": orig_sale.get("distributor_id"),
                    "doctor_id": orig_sale.get("doctor_id"),
                    "shopkeeper_id": orig_sale.get("shopkeeper_id"),
                }

                debit_sale_resp = db.table("sales").insert(debit_sale_data).execute()
                if debit_sale_resp.data:
                    created_debit_sale = debit_sale_resp.data[0]

                    # Update the note with the debit sale's invoice number
                    db.table("credit_debit_notes").eq("note_id", created_note["note_id"]).update(
                        {"invoice_no": debit_invoice_no}
                    ).execute()
                    created_note["invoice_no"] = debit_invoice_no

            except Exception as debit_sale_err:
                # Non-fatal: the note itself was created; log and continue
                print(f"[create_note] Warning: could not auto-create debit sale: {debit_sale_err}")


        # Log activity
        if user_email:
            try:
                act_logger = get_activity_logger(db)
                act_logger.log_create(
                    user_email=user_email,
                    entity_type="credit_debit_note",
                    entity_name=f"{note.note_type.capitalize()} Note #{created_note.get('note_id')} for Sale #{note.sale_id}",
                    entity_id=created_note.get("note_id"),
                    new_state=created_note,
                    metadata={"amount": float(note.amount), "note_type": note.note_type, "sale_id": note.sale_id},
                )
            except Exception:
                pass

        response_body = {
            "message": f"{note.note_type.capitalize()} note created successfully",
            "note": created_note,
        }
        if created_debit_sale:
            response_body["debit_sale"] = created_debit_sale
            response_body["message"] += f". A new sale (Invoice: {created_debit_sale.get('invoice_no')}) and payment have been automatically recorded."

        return response_body

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating note: {str(e)}")


# ─── VOID NOTE ────────────────────────────────────────────────────────────────

@router.patch("/{note_id}/void", dependencies=[Depends(verify_permission("manage_notes"))])
def void_note(
    note_id: int,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """
    Void a credit/debit note.
    Restricted to users with 'manage_notes' permission (admin / manager).
    Notes are never hard-deleted — voiding preserves the audit trail.
    """
    try:
        # Fetch the note
        note_response = db.table("credit_debit_notes").select("*").eq("note_id", note_id).execute()
        if not note_response.data:
            raise HTTPException(status_code=404, detail=f"Note {note_id} not found")

        current_note = note_response.data[0]

        if current_note.get("status") == "void":
            raise HTTPException(status_code=400, detail="Note is already voided")

        # Void the note (updated_at handled by DB trigger)
        void_response = (
            db.table("credit_debit_notes")
            .eq("note_id", note_id)
            .update({"status": "void"})
            .execute()
        )

        if not void_response.data:
            raise HTTPException(status_code=500, detail="Failed to void note")

        voided_note = void_response.data[0]
        sale_id = current_note.get("sale_id")

        # Recalculate sale payment status now that this note is inactive
        if sale_id:
            calculate_remaining_balance(sale_id, db)

        # Log activity
        if user_email:
            try:
                act_logger = get_activity_logger(db)
                act_logger.log_update_with_diff(
                    user_email=user_email,
                    entity_type="credit_debit_note",
                    entity_name=f"Note #{note_id} (voided)",
                    entity_id=note_id,
                    before=current_note,
                    after=voided_note,
                )
            except Exception:
                pass

        return {
            "message": f"Note #{note_id} has been voided",
            "note": voided_note,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error voiding note: {str(e)}")

# ─── UPDATE PICKUP STATUS ─────────────────────────────────────────────────────

from pydantic import BaseModel
class PickupStatusUpdate(BaseModel):
    pickup_status: str
    pickup_date: Optional[str] = None
    returned_date: Optional[str] = None

@router.patch("/{note_id}/pickup_status", dependencies=[Depends(verify_permission("manage_notes"))])
def update_pickup_status(
    note_id: int,
    status_update: PickupStatusUpdate,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """
    Update the reverse logistics / pickup status of a return note.
    Valid statuses: 'pending_pickup', 'out_for_pickup', 'picked_up', 'returned_to_company', 'cancelled'.
    """
    try:
        valid_statuses = {"pending_pickup", "out_for_pickup", "picked_up", "returned_to_company", "cancelled"}
        if status_update.pickup_status not in valid_statuses:
            raise HTTPException(status_code=400, detail="Invalid pickup_status")

        # Fetch the note
        note_response = db.table("credit_debit_notes").select("*").eq("note_id", note_id).execute()
        if not note_response.data:
            raise HTTPException(status_code=404, detail=f"Note {note_id} not found")

        current_note = note_response.data[0]
        if not current_note.get("requires_pickup"):
            raise HTTPException(status_code=400, detail="This note does not require physical pickup")

        update_data = {"pickup_status": status_update.pickup_status}
        if status_update.pickup_date:
            update_data["pickup_date"] = status_update.pickup_date
        if status_update.returned_date:
            update_data["returned_date"] = status_update.returned_date

        update_response = (
            db.table("credit_debit_notes")
            .eq("note_id", note_id)
            .update(update_data)
            .execute()
        )

        if not update_response.data:
            raise HTTPException(status_code=500, detail="Failed to update pickup status")

        # Log activity
        if user_email:
            try:
                act_logger = get_activity_logger(db)
                act_logger.log_update_with_diff(
                    user_email=user_email,
                    entity_type="credit_debit_note",
                    entity_name=f"Note #{note_id} (pickup updated)",
                    entity_id=note_id,
                    before=current_note,
                    after=update_response.data[0],
                )
            except Exception:
                pass

        return {
            "message": f"Note #{note_id} pickup status updated to {status_update.pickup_status}",
            "note": update_response.data[0],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating pickup status: {str(e)}")

