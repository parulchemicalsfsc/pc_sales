"""
Telecaller Orders Router
Handles pending orders from telecallers that require sales manager approval.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, Header, HTTPException
import pytz

from models import TelecallerOrderCreate, TelecallerOrderApprove, TelecallerOrderReject
from pydantic import BaseModel
from supabase_db import SupabaseClient, get_supabase
from rbac_utils import verify_permission
from activity_logger import ActivityLogger

from routers.notifications import create_notification_helper

router = APIRouter()
logger = logging.getLogger("telecaller_orders")


def _fetch_all(db, table, select="*", order_col=None, order_desc=False):
    all_rows = []
    batch = 1000
    offset = 0
    while True:
        q = db.table(table).select(select).range(offset, offset + batch - 1)
        if order_col:
            q = q.order(order_col, desc=order_desc)
        resp = q.execute()
        if not resp.data:
            break
        all_rows.extend(resp.data)
        if len(resp.data) < batch:
            break
        offset += batch
    return all_rows


@router.post("/", dependencies=[Depends(verify_permission("view_calling_list"))])
def create_telecaller_order(
    order: TelecallerOrderCreate,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Telecaller submits a pending order for manager approval."""
    try:
        if user_email:
            user_email = user_email.strip()
        if not user_email:
            raise HTTPException(status_code=401, detail="User email required")

        products_json = json.dumps([p.dict() for p in order.products])

        if order.confirmation_date:
            try:
                datetime.fromisoformat(order.confirmation_date)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid confirmation_date format")

        data = {
            "telecaller_email": user_email,
            "customer_type": order.customer_type,
            "customer_id": order.customer_id,
            "customer_name": order.customer_name,
            "customer_mobile": order.customer_mobile,
            "customer_village": order.customer_village,
            "products_json": products_json,
            "confirmation_date": order.confirmation_date,
            "status": "unconfirmed",
            "notes": order.notes,
        }

        result = db.table("telecaller_orders").insert(data).execute()
        if not result.data:
            raise HTTPException(status_code=400, detail="Failed to create telecaller order")

        created = result.data[0]

        created = result.data[0]

        return {"message": "Order submitted for confirmation", "order": created}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating telecaller order: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating telecaller order: {str(e)}")


@router.get("/", dependencies=[Depends(verify_permission("view_sales"))])
def get_telecaller_orders(
    status: Optional[str] = None,
    db: SupabaseClient = Depends(get_supabase),
):
    """Get all telecaller orders, optionally filtered by status."""
    try:
        q = db.table("telecaller_orders").select("*").order("created_at", desc=True)
        if status:
            q = q.eq("status", status)
        resp = q.execute()

        orders = resp.data or []

        telecaller_emails = list(set(o.get("telecaller_email", "") for o in orders if o.get("telecaller_email")))

        name_map = {}
        if telecaller_emails:
            try:
                users = _fetch_all(db, "app_users", "email, name")
                name_map = {u["email"]: u.get("name", u["email"]) for u in users if u.get("email")}
            except Exception:
                pass

        ids_by_type = {
            "Sabhasad": set(),
            "Mantri": set(),
            "Doctor": set(),
            "Shopkeeper": set()
        }
        for o in orders:
            ctype = o.get("customer_type")
            cid = o.get("customer_id")
            if ctype in ids_by_type and cid:
                ids_by_type[ctype].add(cid)
                
        locations_map = {}
        try:
            if ids_by_type["Sabhasad"]:
                res = db.table("customers").select("customer_id, state, district, taluka, village").in_("customer_id", list(ids_by_type["Sabhasad"])).execute()
                for r in (res.data or []):
                    locations_map[("Sabhasad", r["customer_id"])] = r
            if ids_by_type["Mantri"]:
                res = db.table("distributors").select("distributor_id, state, district, taluka, village").in_("distributor_id", list(ids_by_type["Mantri"])).execute()
                for r in (res.data or []):
                    locations_map[("Mantri", r["distributor_id"])] = r
            if ids_by_type["Doctor"]:
                res = db.table("doctors").select("doctor_id, state, district, taluka, village").in_("doctor_id", list(ids_by_type["Doctor"])).execute()
                for r in (res.data or []):
                    locations_map[("Doctor", r["doctor_id"])] = r
            if ids_by_type["Shopkeeper"]:
                res = db.table("shopkeepers").select("shopkeeper_id, state, district, taluka, village").in_("shopkeeper_id", list(ids_by_type["Shopkeeper"])).execute()
                for r in (res.data or []):
                    locations_map[("Shopkeeper", r["shopkeeper_id"])] = r
        except Exception as e:
            logger.error(f"Error fetching locations for orders: {e}")

        for o in orders:
            o["telecaller_name"] = name_map.get(o.get("telecaller_email", ""), o.get("telecaller_email", "Unknown"))
            loc = locations_map.get((o.get("customer_type"), o.get("customer_id")), {})
            o["customer_state"] = loc.get("state")
            o["customer_district"] = loc.get("district")
            o["customer_taluka"] = loc.get("taluka")
            if not o.get("customer_village"):
                o["customer_village"] = loc.get("village")

        return orders
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching telecaller orders: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching telecaller orders: {str(e)}")


@router.post("/{order_id}/telecaller-confirm", dependencies=[Depends(verify_permission("view_calling_list"))])
def telecaller_confirm_order(
    order_id: int,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Telecaller confirms the order, sending it to the Sales Manager."""
    try:
        order_resp = db.table("telecaller_orders").select("*").eq("order_id", order_id).execute()
        if not order_resp.data:
            raise HTTPException(status_code=404, detail="Order not found")
            
        order = order_resp.data[0]
        if order.get("status") != "unconfirmed":
            raise HTTPException(status_code=400, detail=f"Order is already {order.get('status')}")

        db.table("telecaller_orders").eq("order_id", order_id).update({
            "status": "pending",
            "updated_at": datetime.now().isoformat(),
        }).execute()

        try:
            users = _fetch_all(db, "app_users", "email, role")
            sm_emails = [u["email"] for u in users if u.get("role") == "sales_manager"]
            for sm_email in sm_emails:
                create_notification_helper(
                    db,
                    title="New Telecaller Order Pending",
                    message=f"{order.get('telecaller_email')} submitted an order for {order.get('customer_name')}",
                    notification_type="info",
                    user_email=sm_email,
                    entity_type="telecaller_order",
                    entity_id=order_id,
                )
        except Exception as n_err:
            logger.warning(f"Failed to send notification: {n_err}")
        
        return {"message": "Order confirmed and sent to Sales Manager"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error confirming telecaller order {order_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error confirming order: {str(e)}")


@router.get("/pending", dependencies=[Depends(verify_permission("view_sales"))])
def get_pending_telecaller_orders(db: SupabaseClient = Depends(get_supabase)):
    """Get only pending telecaller orders (convenience endpoint)."""
    return get_telecaller_orders(status="pending", db=db)


class BulkMarkApprovedRequest(BaseModel):
    order_ids: List[int]
    sale_id: Optional[int] = None

@router.post("/bulk-mark-approved", dependencies=[Depends(verify_permission("manage_telecaller_orders"))])
def bulk_mark_approved(
    body: BulkMarkApprovedRequest,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Mark multiple telecaller orders as approved (used when merging into a single sale)."""
    try:
        if user_email:
            user_email = user_email.strip()

        if not body.order_ids:
            return {"message": "No orders to approve"}

        data = {
            "status": "approved",
            "approved_by": user_email,
            "updated_at": datetime.now().isoformat()
        }
        if body.sale_id is not None:
            data["sale_id"] = body.sale_id

        # Update all orders in one go using in_
        res = db.table("telecaller_orders").update(data).in_("order_id", body.order_ids).execute()
        
        return {"message": f"{len(body.order_ids)} orders marked as approved", "updated": len(res.data) if res.data else 0}
    except Exception as e:
        logger.error(f"Error in bulk mark approved: {e}")
        raise HTTPException(status_code=500, detail=f"Error approving orders: {str(e)}")


@router.post("/{order_id}/approve", dependencies=[Depends(verify_permission("manage_telecaller_orders"))])
def approve_telecaller_order(
    order_id: int,
    body: TelecallerOrderApprove,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Approve a telecaller order — creates a real sale in the sales table."""
    try:
        if user_email:
            user_email = user_email.strip()

        order_resp = db.table("telecaller_orders").select("*").eq("order_id", order_id).execute()
        if not order_resp.data:
            raise HTTPException(status_code=404, detail="Order not found")

        order = order_resp.data[0]
        if order.get("status") != "pending":
            raise HTTPException(status_code=400, detail=f"Order is already {order.get('status')}")

        products_json = order.get("products_json", "[]")
        if isinstance(products_json, str):
            products = json.loads(products_json)
        else:
            products = products_json

        if not products:
            raise HTTPException(status_code=400, detail="Order has no products")

        customer_type = order.get("customer_type", "mantri")
        items_data = []
        total_amount = 0.0
        total_liters = 0.0

        products_resp = db.table("products").select("product_id, capacity_ltr").execute()
        products_dict = {p["product_id"]: p for p in (products_resp.data or [])}

        for p in products:
            pid = p.get("product_id")
            qty = p.get("quantity", 0)
            rate = p.get("rate", 0)
            amount = p.get("amount", 0)
            if not pid or qty <= 0 or rate <= 0:
                continue
            items_data.append({"product_id": pid, "quantity": qty, "rate": rate, "amount": amount})
            total_amount += amount
            cap = (products_dict.get(pid, {}).get("capacity_ltr") or 0)
            total_liters += cap * qty

        if not items_data:
            raise HTTPException(status_code=400, detail="No valid items in order")

        try:
            invoice_no = db.rpc("get_next_invoice_no", {})
            if not invoice_no or not isinstance(invoice_no, str):
                raise ValueError(f"Unexpected RPC response: {invoice_no!r}")
        except Exception as rpc_err:
            logger.error(f"RPC get_next_invoice_no failed: {rpc_err}")
            raise HTTPException(status_code=500, detail="Could not generate invoice number")

        sale_data = {
            "invoice_no": invoice_no,
            "sale_date": datetime.now().strftime("%Y-%m-%d"),
            "total_amount": total_amount,
            "total_liters": total_liters,
            "payment_status": "Pending",
            "notes": order.get("notes") or None,
            "buyer_type": customer_type,
            "sale_stage": "confirmed",
        }

        if customer_type in ("mantri", "distributor"):
            sale_data["distributor_id"] = order.get("customer_id")
            sale_data["customer_id"] = None
            sale_data["doctor_id"] = None
            sale_data["shopkeeper_id"] = None
        elif customer_type == "doctor":
            sale_data["doctor_id"] = order.get("customer_id")
            sale_data["customer_id"] = None
            sale_data["distributor_id"] = None
            sale_data["shopkeeper_id"] = None
        elif customer_type == "shopkeeper":
            sale_data["shopkeeper_id"] = order.get("customer_id")
            sale_data["customer_id"] = None
            sale_data["distributor_id"] = None
            sale_data["doctor_id"] = None
        else:
            sale_data["customer_id"] = order.get("customer_id")
            sale_data["distributor_id"] = None
            sale_data["doctor_id"] = None
            sale_data["shopkeeper_id"] = None

        sale_resp = db.table("sales").insert(sale_data).execute()
        if not sale_resp.data:
            raise HTTPException(status_code=500, detail="Failed to create sale")

        created_sale = sale_resp.data[0]
        sale_id = created_sale.get("sale_id")
        invoice_no = created_sale.get("invoice_no", invoice_no)

        sale_items_rows = []
        for item in items_data:
            row = {
                "sale_id": sale_id,
                "product_id": item["product_id"],
                "quantity": item["quantity"],
                "rate": item["rate"],
                "amount": item["amount"],
            }
            if customer_type not in ("mantri", "distributor") and order.get("customer_id"):
                row["customer_id"] = order["customer_id"]
            sale_items_rows.append(row)

        if sale_items_rows:
            db.table("sale_items").insert(sale_items_rows).execute()

        db.table("telecaller_orders").eq("order_id", order_id).update({
            "status": "approved",
            "sale_id": sale_id,
            "approved_by": user_email,
            "updated_at": datetime.now().isoformat(),
        }).execute()

        logger_instance = ActivityLogger(db)
        logger_instance.log_update_with_diff(
            user_email=user_email,
            entity_type="telecaller_order",
            entity_name=f"Order {order_id}",
            entity_id=order_id,
            extra_metadata={"details": f"Approved order (Invoice: {invoice_no})"},
            before={"status": "pending"},
            after={"status": "approved", "sale_id": sale_id, "invoice_no": invoice_no}
        )

        try:
            create_notification_helper(
                db,
                title="Order Approved",
                message=f"Your order for {order.get('customer_name')} has been approved (Invoice: {invoice_no})",
                notification_type="success",
                user_email=order.get("telecaller_email"),
                entity_type="telecaller_order",
                entity_id=order_id,
            )
        except Exception as n_err:
            logger.warning(f"Failed to send approval notification: {n_err}")

        return {
            "message": "Order approved and sale created",
            "sale_id": sale_id,
            "invoice_no": invoice_no,
            "total_amount": total_amount,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving telecaller order {order_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error approving order: {str(e)}")


@router.post("/{order_id}/reject", dependencies=[Depends(verify_permission("manage_telecaller_orders"))])
def reject_telecaller_order(
    order_id: int,
    body: TelecallerOrderReject,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Reject a telecaller order."""
    try:
        if user_email:
            user_email = user_email.strip()

        order_resp = db.table("telecaller_orders").select("*").eq("order_id", order_id).execute()
        if not order_resp.data:
            raise HTTPException(status_code=404, detail="Order not found")

        order = order_resp.data[0]
        if order.get("status") != "pending":
            raise HTTPException(status_code=400, detail=f"Order is already {order.get('status')}")

        db.table("telecaller_orders").eq("order_id", order_id).update({
            "status": "rejected",
            "rejected_reason": body.reason,
            "approved_by": user_email,
            "updated_at": datetime.now().isoformat(),
        }).execute()

        logger_instance = ActivityLogger(db)
        logger_instance.log_update_with_diff(
            user_email=user_email,
            entity_type="telecaller_order",
            entity_name=f"Order {order_id}",
            entity_id=order_id,
            extra_metadata={"details": f"Rejected order. Reason: {body.reason}"},
            before={"status": "pending"},
            after={"status": "rejected", "rejected_reason": body.reason}
        )

        try:
            create_notification_helper(
                db,
                title="Order Rejected",
                message=f"Your order for {order.get('customer_name')} was rejected. Reason: {body.reason}",
                notification_type="warning",
                user_email=order.get("telecaller_email"),
                entity_type="telecaller_order",
                entity_id=order_id,
            )
        except Exception as n_err:
            logger.warning(f"Failed to send rejection notification: {n_err}")

        return {"message": "Order rejected", "reason": body.reason}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting telecaller order {order_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error rejecting order: {str(e)}")


@router.get("/my-confirmation-calls", dependencies=[Depends(verify_permission("view_calling_list"))])
def get_my_confirmation_calls(
    date: Optional[str] = None,
    db: SupabaseClient = Depends(get_supabase),
    user_email: str = Header(..., alias="x-user-email"),
):
    """Get pending telecaller orders for the logged-in user scheduled for a specific date (defaults to today IST)."""
    try:
        if user_email:
            user_email = user_email.strip()
        if not user_email:
            raise HTTPException(status_code=401, detail="User email required")

        IST = pytz.timezone("Asia/Kolkata")
        if not date:
            today_ist = datetime.now(IST)
        else:
            today_ist = IST.localize(datetime.strptime(date, "%Y-%m-%d"))

        start_ist = today_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        end_ist = start_ist + timedelta(days=1)

        start_utc = start_ist.astimezone(pytz.utc).isoformat()
        end_utc = end_ist.astimezone(pytz.utc).isoformat()

        q = db.table("telecaller_orders").select("*") \
            .eq("telecaller_email", user_email) \
            .eq("status", "unconfirmed") \
            .order("created_at", desc=True)

        if date:
            q = q.gte("confirmation_date", start_utc).lt("confirmation_date", end_utc)
            
        resp = q.execute()
        orders = resp.data or []

        # Parse products_json so the frontend doesn't have to
        for o in orders:
            pj = o.get("products_json")
            if isinstance(pj, str):
                try:
                    o["products"] = json.loads(pj)
                except Exception:
                    o["products"] = []
            elif isinstance(pj, list):
                o["products"] = pj
            else:
                o["products"] = o.get("products") or []

        return orders
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching confirmation calls: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching confirmation calls: {str(e)}")


@router.get("/{order_id}", dependencies=[Depends(verify_permission("view_sales"))])
def get_telecaller_order(order_id: int, db: SupabaseClient = Depends(get_supabase)):
    """Get a single telecaller order by ID."""
    try:
        resp = db.table("telecaller_orders").select("*").eq("order_id", order_id).execute()
        if not resp.data:
            raise HTTPException(status_code=404, detail="Order not found")
        return resp.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching order: {str(e)}")

