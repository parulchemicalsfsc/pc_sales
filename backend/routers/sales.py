from datetime import datetime, timedelta
import json
from typing import Optional

from activity_logger import get_activity_logger
from fastapi import APIRouter, Depends, Header, HTTPException
from models import SaleCreate
from supabase_db import SupabaseClient, get_supabase
from rbac_utils import verify_permission

from routers.notifications import create_notification_helper

router = APIRouter()


# Invoice number generation has been moved entirely to the database.
# A BEFORE INSERT trigger on the `sales` table calls the PostgreSQL function
# `generate_fsc_invoice_no()` which is atomic and race-condition-safe.
# See: database/migrations/invoice_no_trigger.sql


@router.get("/", dependencies=[Depends(verify_permission("view_sales"))])
def get_sales(db: SupabaseClient = Depends(get_supabase)):
    """Get all sales with customer/distributor information"""
    try:
        # Helper to paginate past Supabase's 1000-row server cap
        def fetch_all(table, select="*", order_col=None, order_desc=False):
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

        sales = fetch_all("sales", "*", order_col="created_at", order_desc=True)
        if not sales:
            return []

        # ── Diagnostic: show actual columns present in the sales table ──
        if sales:
            actual_cols = set(sales[0].keys())
            for expected_col in ("buyer_type", "distributor_id", "doctor_id", "shopkeeper_id"):
                if expected_col not in actual_cols:
                    print(f"[GET /sales] ⚠️  Column '{expected_col}' MISSING from sales table. "
                          f"Run database/migrations/add_doctor_shopkeeper_buyer_type.sql in Supabase.")
            print(f"[GET /sales] Actual sales columns: {sorted(actual_cols)}")

        # Fetch ALL customers, distributors, doctors, shopkeepers via pagination
        customers_list = fetch_all("customers", "customer_id, name, village, mobile")
        customers_dict = {c["customer_id"]: c for c in customers_list}

        distributors_list = fetch_all("distributors")
        distributors_dict = {d["distributor_id"]: d for d in distributors_list}

        # Fetch doctors and shopkeepers (graceful fallback if table missing)
        # NOTE: doctors/shopkeepers tables use 'mantri_mobile', not 'mobile'
        try:
            doctors_list = fetch_all("doctors", "doctor_id, name, village, mantri_mobile")
            doctors_dict = {d["doctor_id"]: d for d in doctors_list}
        except Exception as e:
            print(f"[GET /sales] ⚠️  Could not fetch doctors: {e}")
            doctors_dict = {}

        try:
            shopkeepers_list = fetch_all("shopkeepers", "shopkeeper_id, name, village, mantri_mobile")
            shopkeepers_dict = {s["shopkeeper_id"]: s for s in shopkeepers_list}
        except Exception as e:
            print(f"[GET /sales] ⚠️  Could not fetch shopkeepers: {e}")
            shopkeepers_dict = {}

        print(f"[GET /sales] Loaded {len(sales)} sales, {len(customers_dict)} customers, "
              f"{len(distributors_dict)} distributors, {len(doctors_dict)} doctors, "
              f"{len(shopkeepers_dict)} shopkeepers")

        result = []
        for sale in sales:
            # Infer buyer_type if column is missing from DB or NULL
            raw_buyer_type = sale.get("buyer_type")
            if not raw_buyer_type:
                # Fallback: guess from which FK column is set
                if sale.get("doctor_id"):
                    raw_buyer_type = "doctor"
                elif sale.get("shopkeeper_id"):
                    raw_buyer_type = "shopkeeper"
                elif sale.get("distributor_id"):
                    raw_buyer_type = "distributor"
                else:
                    raw_buyer_type = "customer"
            buyer_type = raw_buyer_type
            if buyer_type == "mantri" and sale.get("distributor_id"):
                # Mantri: name stored in mantri_name field on the distributor row
                entity = distributors_dict.get(sale["distributor_id"], {})
                resolved_name = entity.get("mantri_name") or entity.get("name", "")
                if not resolved_name:
                    print(f"[GET /sales] WARNING: Blank name for mantri sale {sale.get('sale_id')} / dist_id={sale['distributor_id']}")
                result.append({
                    **sale,
                    "customer_name": resolved_name,
                    "village": entity.get("village", ""),
                    "mobile": entity.get("mantri_mobile") or entity.get("mobile") or "",
                })
            elif buyer_type == "distributor" and sale.get("distributor_id"):
                entity = distributors_dict.get(sale["distributor_id"], {})
                mobile = entity.get("mantri_mobile") or entity.get("mobile") or entity.get("contact_mobile") or ""
                result.append({
                    **sale,
                    "customer_name": entity.get("name", ""),
                    "village": entity.get("village", ""),
                    "mobile": mobile,
                })
            elif buyer_type == "doctor" and sale.get("doctor_id"):
                entity = doctors_dict.get(sale["doctor_id"], {})
                result.append({
                    **sale,
                    "customer_name": entity.get("name", ""),
                    "village": entity.get("village", ""),
                    "mobile": entity.get("mantri_mobile", ""),
                })
            elif buyer_type == "shopkeeper" and sale.get("shopkeeper_id"):
                entity = shopkeepers_dict.get(sale["shopkeeper_id"], {})
                result.append({
                    **sale,
                    "customer_name": entity.get("name", ""),
                    "village": entity.get("village", ""),
                    "mobile": entity.get("mantri_mobile", ""),
                })
            else:
                entity = customers_dict.get(sale.get("customer_id"), {})
                result.append({
                    **sale,
                    "customer_name": entity.get("name", ""),
                    "village": entity.get("village", ""),
                    "mobile": entity.get("mobile", ""),
                })

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching sales: {str(e)}")



@router.get("/pending-payments", dependencies=[Depends(verify_permission("view_sales"))])
def sales_with_pending(db: SupabaseClient = Depends(get_supabase)):
    """Get sales with pending payments"""
    try:
        # Get all sales
        sales_response = (
            db.table("sales").select("*").order("sale_date", desc=True).limit(10000).execute()
        )

        if not sales_response.data:
            return []

        def fetch_all(table, select="*"):
            all_rows = []
            batch = 1000
            offset = 0
            while True:
                q = db.table(table).select(select).range(offset, offset + batch - 1)
                resp = q.execute()
                if not resp.data: break
                all_rows.extend(resp.data)
                if len(resp.data) < batch: break
                offset += batch
            return all_rows

        customers_list = fetch_all("customers", "customer_id, name, village")
        customers_dict = {c["customer_id"]: c for c in customers_list}
        
        distributors_list = fetch_all("distributors", "distributor_id, name, mantri_name, village")
        distributors_dict = {d["distributor_id"]: d for d in distributors_list}

        try:
            doctors_list = fetch_all("doctors", "doctor_id, name, village")
            doctors_dict = {d["doctor_id"]: d for d in doctors_list}
        except: doctors_dict = {}

        try:
            shopkeepers_list = fetch_all("shopkeepers", "shopkeeper_id, name, village")
            shopkeepers_dict = {s["shopkeeper_id"]: s for s in shopkeepers_list}
        except: shopkeepers_dict = {}

        # Get all products for summary
        products_response = db.table("products").select("product_id, product_name").limit(10000).execute()
        products_dict = {p["product_id"]: p["product_name"] for p in products_response.data} if products_response.data else {}
        print(f"DEBUG: Fetched {len(products_dict)} products")

        # Get all sale items
        items_response = db.table("sale_items").select("sale_id, product_id, quantity").limit(10000).execute()
        items_by_sale = {}
        if items_response.data:
            print(f"DEBUG: Fetched {len(items_response.data)} sale items")
            for item in items_response.data:
                sale_id = item.get("sale_id")
                prod_id = item.get("product_id")
                qty = item.get("quantity", 0)
                prod_name = products_dict.get(prod_id, "Unknown Product")
                
                if sale_id not in items_by_sale:
                    items_by_sale[sale_id] = []
                items_by_sale[sale_id].append(f"{qty}x {prod_name}")
            print(f"DEBUG: Mapped items for {len(items_by_sale)} sales")
        else:
            print("DEBUG: No sale items found")

        # Get all payments
        payments_response = db.table("payments").select("sale_id, amount").limit(10000).execute()

        # Calculate paid amounts per sale
        paid_by_sale = {}
        if payments_response.data:
            for payment in payments_response.data:
                sale_id = payment.get("sale_id")
                amount = payment.get("amount", 0)
                paid_by_sale[sale_id] = paid_by_sale.get(sale_id, 0) + amount

        # Build result with pending amounts
        result = []
        today = datetime.now().date()

        for sale in sales_response.data:
            sale_id = sale.get("sale_id")
            customer_id = sale.get("customer_id")
            total_amount = sale.get("total_amount", 0) or 0
            paid_amount = paid_by_sale.get(sale_id, 0)
            pending_amount = total_amount - paid_amount
            payment_terms_json = sale.get("payment_terms")
            
            # Skip if fully paid
            if pending_amount <= 0:
                continue

            # Check if payment is due based on terms
            is_due = True # Default to showing it
            
            if payment_terms_json:
                try:
                    terms = json.loads(payment_terms_json)
                    sale_date_str = sale.get("sale_date")
                    if sale_date_str:
                         sale_date = datetime.strptime(sale_date_str, "%Y-%m-%d").date()
                         
                         terms_type = terms.get("type")
                         
                         if terms_type == "after_days":
                             days = int(terms.get("days", 0))
                             due_date = sale_date + timedelta(days=days)
                             if today < due_date:
                                 is_due = False
                                 
                         elif terms_type == "emi":
                             # Calculate strict amount due today
                             strict_due_amount = 0
                             parts = terms.get("emiParts", [])
                             for part in parts:
                                 days = int(part.get("days", 0))
                                 percent = float(part.get("percentage", 0))
                                 part_due_date = sale_date + timedelta(days=days)
                                 
                                 if today >= part_due_date:
                                     strict_due_amount += (total_amount * percent / 100)
                             
                             # If we have paid enough to cover strict dues, hide it
                             if paid_amount >= strict_due_amount:
                                 is_due = False
                except Exception as e:
                    print(f"Error parsing payment terms for sale {sale_id}: {e}")
            
            buyer_type = sale.get("buyer_type")
            if not buyer_type:
                if sale.get("doctor_id"): buyer_type = "doctor"
                elif sale.get("shopkeeper_id"): buyer_type = "shopkeeper"
                elif sale.get("distributor_id"): buyer_type = "distributor"
                else: buyer_type = "customer"

            name, village = "Unknown", ""
            if buyer_type == "mantri" and sale.get("distributor_id"):
                entity = distributors_dict.get(sale["distributor_id"], {})
                name = entity.get("mantri_name") or entity.get("name") or "Unknown"
                village = entity.get("village") or ""
            elif buyer_type == "distributor" and sale.get("distributor_id"):
                entity = distributors_dict.get(sale["distributor_id"], {})
                name = entity.get("name") or "Unknown"
                village = entity.get("village") or ""
            elif buyer_type == "doctor" and sale.get("doctor_id"):
                entity = doctors_dict.get(sale["doctor_id"], {})
                name = entity.get("name") or "Unknown"
                village = entity.get("village") or ""
            elif buyer_type == "shopkeeper" and sale.get("shopkeeper_id"):
                entity = shopkeepers_dict.get(sale["shopkeeper_id"], {})
                name = entity.get("name") or "Unknown"
                village = entity.get("village") or ""
            else:
                entity = customers_dict.get(sale.get("customer_id"), {})
                name = entity.get("name") or "Unknown"
                village = entity.get("village") or ""

            result.append(
                    {
                        "sale_id": sale_id,
                        "invoice_no": sale.get("invoice_no"),
                        "sale_date": sale.get("sale_date"),
                        "customer_name": name,
                        "village": village,
                        "total_amount": total_amount,
                        "paid_amount": paid_amount,
                        "pending_amount": pending_amount,
                        "payment_status": sale.get("payment_status", "Pending"),
                        "payment_terms": payment_terms_json,
                        "items_summary": ", ".join(items_by_sale.get(sale_id, []))
                    }
                )

        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching pending payments: {str(e)}"
        )


@router.post("/", dependencies=[Depends(verify_permission("create_sale"))])
def create_sale(
    sale: SaleCreate,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Create a new sale with items and auto-convert related demos"""
    try:
        # Validate input: route to correct FK based on buyer_type
        buyer_type = sale.buyer_type or (
            "distributor" if sale.distributor_id else
            "doctor" if sale.doctor_id else
            "shopkeeper" if sale.shopkeeper_id else
            "customer"
        )
        is_distributor_sale = buyer_type in ("distributor", "mantri")
        is_doctor_sale = buyer_type == "doctor"
        is_shopkeeper_sale = buyer_type == "shopkeeper"

        if is_distributor_sale:
            if not sale.distributor_id:
                raise HTTPException(status_code=400, detail="distributor_id is required for Distributor/Mantri sales")
        elif is_doctor_sale:
            if not sale.doctor_id:
                raise HTTPException(status_code=400, detail="doctor_id is required for Doctor sales")
        elif is_shopkeeper_sale:
            if not sale.shopkeeper_id:
                raise HTTPException(status_code=400, detail="shopkeeper_id is required for Shopkeeper sales")
        else:
            if not sale.customer_id:
                raise HTTPException(status_code=400, detail="customer_id is required for Customer/Field Officer sales")

        if not sale.items or len(sale.items) == 0:
            raise HTTPException(status_code=400, detail="At least one item is required")

        # Calculate totals
        total_amount = 0
        total_liters = 0

        # Get products for calculating liters
        products_response = (
            db.table("products").select("product_id, capacity_ltr").execute()
        )
        products_dict = (
            {p["product_id"]: p for p in products_response.data}
            if products_response.data
            else {}
        )

        for item in sale.items:
            if not item.product_id or item.quantity <= 0 or item.rate <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="All items must have valid product_id, quantity, and rate",
                )

            total_amount += item.amount

            # Calculate liters
            product = products_dict.get(item.product_id, {})
            capacity = product.get("capacity_ltr", 0) or 0
            total_liters += capacity * item.quantity

        # ── Generate invoice number via RPC ──────────────────────────────────────
        # We call get_next_invoice_no() — a plain RETURNS TEXT Supabase RPC function
        # that uses pg_advisory_xact_lock for concurrency safety.
        invoice_no = ""
        if sale.invoice_no and sale.invoice_no.strip():
            # Caller explicitly provided an invoice number — use it directly
            invoice_no = sale.invoice_no.strip()
        else:
            # Auto-generate via RPC
            try:
                invoice_no = db.rpc("get_next_invoice_no", {})
                if not invoice_no or not isinstance(invoice_no, str):
                    raise ValueError(f"Unexpected RPC response: {invoice_no!r}")
                print(f"[create_sale] Generated invoice_no via RPC: {invoice_no}")
            except Exception as rpc_err:
                err_body = ""
                if hasattr(rpc_err, "response") and rpc_err.response is not None:
                    try:
                        err_body = rpc_err.response.text
                    except Exception:
                        pass
                err_str = f"{rpc_err}" + (f" | DB: {err_body}" if err_body else "")
                print(f"[create_sale] RPC get_next_invoice_no failed: {err_str}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Could not generate invoice number. Ensure get_next_invoice_no() function is installed in Supabase. Error: {err_str}",
                )

        # Build sale record with the generated/provided invoice_no
        sale_data: dict = {
            "invoice_no": invoice_no,
            "sale_date": sale.sale_date,
            "total_amount": total_amount,
            "total_liters": total_liters,
            "payment_status": "Pending",
            "notes": sale.notes or None,
            "payment_terms": sale.payment_terms or None,
            "buyer_type": buyer_type,
        }
        # Set only the relevant buyer FK — null out all others
        if is_distributor_sale:
            sale_data["distributor_id"] = sale.distributor_id
            sale_data["customer_id"] = None
            sale_data["doctor_id"] = None
            sale_data["shopkeeper_id"] = None
        elif is_doctor_sale:
            sale_data["doctor_id"] = sale.doctor_id
            sale_data["customer_id"] = None
            sale_data["distributor_id"] = None
            sale_data["shopkeeper_id"] = None
        elif is_shopkeeper_sale:
            sale_data["shopkeeper_id"] = sale.shopkeeper_id
            sale_data["customer_id"] = None
            sale_data["distributor_id"] = None
            sale_data["doctor_id"] = None
        else:
            sale_data["customer_id"] = sale.customer_id
            sale_data["distributor_id"] = None
            sale_data["doctor_id"] = None
            sale_data["shopkeeper_id"] = None

        try:
            sale_response = db.table("sales").insert(sale_data).execute()
        except Exception as insert_err:
            err_body = ""
            if hasattr(insert_err, "response") and insert_err.response is not None:
                try:
                    err_body = insert_err.response.text
                except Exception:
                    pass
            err_str = f"{insert_err}" + (f" | DB response: {err_body}" if err_body else "")
            print(f"[create_sale] INSERT failed: {err_str}")

            combined = err_str.lower() + err_body.lower()
            # 23503 = foreign key violation
            if "23503" in combined or "foreign key" in combined:
                buyer_label = f"Distributor ID: {sale.distributor_id}" if is_distributor_sale else f"Customer ID: {sale.customer_id}"
                raise HTTPException(
                    status_code=400,
                    detail=f"Selected buyer ({buyer_label}) does not exist. Please refresh and reselect.",
                )
            # 23505 = unique constraint violation (duplicate invoice_no)
            if "23505" in combined or "duplicate" in combined or "unique" in combined:
                raise HTTPException(
                    status_code=409,
                    detail=f"Invoice number '{invoice_no}' already exists. Please try again.",
                )
            raise HTTPException(status_code=500, detail=f"Error inserting sale: {err_str}")

        if not sale_response.data:
            raise HTTPException(status_code=400, detail="Failed to create sale")

        created_sale = sale_response.data[0]
        sale_id = created_sale.get("sale_id")
        invoice_no = created_sale.get("invoice_no", invoice_no)  # prefer DB generated value
        
        # Generate and store sale_code in MMyy#### format (optional - only if column exists)
        try:
            now = datetime.now()
            month_year_prefix = now.strftime("%m%y")  # e.g., "0126" for Jan 2026
            first_day = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            
            # Count sales created this month (including this one)
            count_response = (
                db.table("sales")
                .select("sale_id", count="exact")
                .gte("created_at", first_day.isoformat())
                .execute()
            )
            sequence = count_response.count if count_response.count else 1
            sale_code = f"{month_year_prefix}{sequence:04d}"
            
            # Update the sale with the generated sale_code
            db.table("sales").eq("sale_id", sale_id).update({"sale_code": sale_code}).execute()
            created_sale["sale_code"] = sale_code  # Add to response
        except Exception as e:
            # Column doesn't exist yet - skip sale_code generation
            print(f"Could not set sale_code: {e}")
            pass

        # Insert sale items
        sale_items_data = []
        for item in sale.items:
            item_row = {
                "sale_id": sale_id,
                "product_id": item.product_id,
                "quantity": item.quantity,
                "rate": item.rate,
                "amount": item.amount,
            }
            # Only set customer_id on items for Sabhasad sales
            if not is_distributor_sale and sale.customer_id:
                item_row["customer_id"] = sale.customer_id
            sale_items_data.append(item_row)

        if sale_items_data:
            items_response = db.table("sale_items").insert(sale_items_data).execute()

            if not items_response.data:
                # Rollback sale if items fail (manual cleanup)
                db.table("sales").eq("sale_id", sale_id).delete().execute()
                raise HTTPException(
                    status_code=400, detail="Failed to create sale items"
                )

        # Log activity
        if user_email:
            try:
                logger = get_activity_logger(db)
                # Resolve buyer name based on type
                if is_distributor_sale:
                    buyer_resp = db.table("distributors").select("name").eq("distributor_id", sale.distributor_id).execute()
                    buyer_name = buyer_resp.data[0].get("name") if buyer_resp.data else f"Distributor ID: {sale.distributor_id}"
                else:
                    buyer_resp = db.table("customers").select("name").eq("customer_id", sale.customer_id).execute()
                    buyer_name = buyer_resp.data[0].get("name") if buyer_resp.data else f"Customer ID: {sale.customer_id}"

                logger.log_create(
                    user_email=user_email,
                    entity_type="sale",
                    entity_name=f"{invoice_no} - {buyer_name}",
                    entity_id=sale_id,
                    new_state=created_sale,
                    metadata={
                        "invoice_no": invoice_no,
                        "buyer_type": buyer_type,
                        "buyer_id": sale.distributor_id if is_distributor_sale else sale.customer_id,
                        "total_amount": total_amount,
                        "items_count": len(sale_items_data),
                    },
                )
            except Exception as log_err:
                print(f"Warning: Failed to log activity: {str(log_err)}")

        # Auto-convert demos for this customer
        converted_demos = []
        try:
            # Check if this customer has any scheduled or pending demos
            demos_response = (
                db.table("demos")
                .select("demo_id, product_id, conversion_status, demo_date")
                .eq("customer_id", sale.customer_id)
                .in_("conversion_status", ["Scheduled", "Pending", "Follow-up"])
                .execute()
            )

            if demos_response.data:
                # Get product IDs from the sale items
                sale_product_ids = [item.product_id for item in sale.items]

                # Update matching demos to "Converted"
                for demo in demos_response.data:
                    demo_product_id = demo.get("product_id")
                    demo_id = demo.get("demo_id")

                    # If the demo product matches any product in the sale, mark as converted
                    if demo_product_id in sale_product_ids:
                        try:
                            update_response = (
                                db.table("demos")
                                .eq("demo_id", demo_id)
                                .update(
                                    {
                                        "conversion_status": "Converted",
                                        "notes": f"Auto-converted: Sale {invoice_no} created on {sale.sale_date}",
                                    }
                                )
                                .execute()
                            )

                            if update_response.data:
                                converted_demos.append(demo_id)
                        except Exception as demo_update_err:
                            print(
                                f"Warning: Failed to update demo {demo_id}: {str(demo_update_err)}"
                            )

                if converted_demos:
                    print(
                        f"Auto-converted {len(converted_demos)} demo(s) for customer {sale.customer_id}: {converted_demos}"
                    )

        except Exception as demo_err:
            print(f"Warning: Failed to auto-convert demos: {str(demo_err)}")

        # Handle Initial Payment
        if sale.paid_amount and sale.paid_amount > 0:
            try:
                payment_data = {
                    "sale_id": sale_id,
                    "payment_date": sale.sale_date,
                    "payment_method": sale.payment_method or "Cash",
                    "amount": sale.paid_amount,
                    "notes": f"Initial payment for invoice {invoice_no}"
                }
                
                # Insert payment
                db.table("payments").insert(payment_data).execute()
                
                # Update sale payment status
                new_status = "Pending"
                if sale.paid_amount >= total_amount:
                    new_status = "Paid"
                elif sale.paid_amount > 0:
                    new_status = "Partial"
                
                if new_status != "Pending":
                    db.table("sales").eq("sale_id", sale_id).update({"payment_status": new_status}).execute()
                    created_sale["payment_status"] = new_status
                
                # Log payment activity
                if user_email:
                    logger = get_activity_logger(db)
                    logger.log_create(
                        user_email=user_email,
                        entity_type="payment",
                        entity_name=f"₹{sale.paid_amount} for {invoice_no}",
                        entity_id=sale_id, # Linking to sale
                        new_state=payment_data,
                        metadata={
                            "amount": sale.paid_amount,
                            "invoice_no": invoice_no,
                            "type": "initial_payment"
                        }
                    )
            except Exception as pay_err:
                print(f"Error processing initial payment: {pay_err}")
                # Don't fail the whole sale creation for payment failure, but log it

        # Notification creation removed as per user request


        return {
            "message": "Sale created successfully",
            "sale": created_sale,
            "items_count": len(sale_items_data),
            "converted_demos": len(converted_demos),
            "demo_ids": converted_demos if converted_demos else [],
        }
    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        # Extract HTTP response body if available for better diagnostics
        err_body = ""
        if hasattr(e, "response") and e.response is not None:
            try:
                err_body = e.response.text
            except Exception:
                pass
        combined = (error_str + err_body).lower()
        if "duplicate" in combined or "unique" in combined or "23505" in combined:
            raise HTTPException(
                status_code=409,
                detail=f"A duplicate invoice number was detected. DB response: {err_body or error_str}",
            )
        raise HTTPException(status_code=500, detail=f"Error creating sale: {error_str}" + (f" | {err_body}" if err_body else ""))


@router.get("/{sale_id}", dependencies=[Depends(verify_permission("view_sales"))])
def get_sale(sale_id: int, db: SupabaseClient = Depends(get_supabase)):
    """Get a single sale with items"""
    try:
        # Get sale
        sale_response = db.table("sales").select("*").eq("sale_id", sale_id).execute()

        if not sale_response.data:
            raise HTTPException(status_code=404, detail="Sale not found")

        sale = sale_response.data[0]

        # Get sale items
        items_response = (
            db.table("sale_items").select("*").eq("sale_id", sale_id).execute()
        )

        # Get product details for items
        if items_response.data:
            products_response = (
                db.table("products").select("product_id, product_name").execute()
            )
            products_dict = (
                {p["product_id"]: p for p in products_response.data}
                if products_response.data
                else {}
            )

            for item in items_response.data:
                product = products_dict.get(item.get("product_id"), {})
                item["product_name"] = product.get("product_name")

        return {"sale": sale, "items": items_response.data or []}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching sale: {str(e)}")


@router.put("/{sale_id}", dependencies=[Depends(verify_permission("edit_sale"))])
def update_sale(
    sale_id: int, sale_data: dict, db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Update a sale with items"""
    try:
        # Fetch current record BEFORE updating so we can log the diff
        before_resp = db.table("sales").select("*").eq("sale_id", sale_id).execute()
        before_data = before_resp.data[0] if before_resp.data else {}

        # Sanitize payload
        clean_data = sale_data.copy()
        
        # Remove PK if present
        clean_data.pop("sale_id", None)

        # Extract fields that are NOT columns in the 'sales' table
        items_data = clean_data.pop("items", None)
        if isinstance(items_data, str):
            import json
            try:
                items_data = json.loads(items_data)
            except Exception:
                pass
                
        paid_amount = clean_data.pop("paid_amount", None)
        payment_method = clean_data.pop("payment_method", None)
            
        # Fix empty date strings causing SQL errors (e.g. "" -> None)
        date_fields = ["shipment_date", "dispatch_date", "delivery_date", "sale_date"]
        for field in date_fields:
            if field in clean_data and clean_data[field] == "":
                clean_data[field] = None

        # If items were provided, recalculate totals
        if items_data and len(items_data) > 0:
            total_amount = 0
            total_liters = 0

            # Get products for calculating liters
            products_response = (
                db.table("products").select("product_id, capacity_ltr").execute()
            )
            products_dict = (
                {p["product_id"]: p for p in products_response.data}
                if products_response.data
                else {}
            )

            for item in items_data:
                total_amount += item.get("amount", 0)
                product = products_dict.get(item.get("product_id"), {})
                capacity = product.get("capacity_ltr", 0) or 0
                total_liters += capacity * item.get("quantity", 0)

            clean_data["total_amount"] = total_amount
            clean_data["total_liters"] = total_liters

        # Update the sales record
        response = db.table("sales").eq("sale_id", sale_id).update(clean_data).execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Sale not found")

        updated_sale = response.data[0]

        # If items were provided, delete old items and insert new ones
        if items_data and len(items_data) > 0:
            # Delete existing sale items
            db.table("sale_items").eq("sale_id", sale_id).delete().execute()

            # Insert new sale items
            customer_id = updated_sale.get("customer_id")
            sale_items_to_insert = []
            for item in items_data:
                sale_items_to_insert.append({
                    "sale_id": sale_id,
                    "customer_id": customer_id,
                    "product_id": item.get("product_id"),
                    "quantity": item.get("quantity"),
                    "rate": item.get("rate"),
                    "amount": item.get("amount"),
                })

            if sale_items_to_insert:
                db.table("sale_items").insert(sale_items_to_insert).execute()

        return {"message": "Sale updated successfully", "sale": updated_sale}
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        if hasattr(e, "response") and e.response is not None:
             try:
                 error_msg += f" | Supabase Error: {e.response.text}"
             except:
                 pass
        
        print(f"Error updating sale {sale_id}: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Error updating sale: {error_msg}")
    finally:
        if user_email:
            try:
                # Fetch updated record for the diff
                after_resp = db.table("sales").select("*").eq("sale_id", sale_id).execute()
                after_data = after_resp.data[0] if after_resp.data else {}
                logger = get_activity_logger(db)
                logger.log_update_with_diff(
                    user_email=user_email,
                    entity_type="sale",
                    entity_name=f"Sale #{sale_id}",
                    entity_id=sale_id,
                    before=before_data,
                    after=after_data,
                    skip_fields=["sale_id", "created_at", "invoice_no"],
                )
            except Exception:
                pass


@router.delete("/{sale_id}", dependencies=[Depends(verify_permission("delete_sale"))])
def delete_sale(sale_id: int, db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Delete a sale and its items"""
    try:
        # Fetch sale data before delete for diff logging
        check_response = db.table("sales").select("*").eq("sale_id", sale_id).execute()
        if not check_response.data:
            raise HTTPException(status_code=404, detail="Sale not found")
        
        old_sale = check_response.data[0]

        # Delete sale items first
        db.table("sale_items").eq("sale_id", sale_id).delete().execute()

        # Delete sale
        response = db.table("sales").eq("sale_id", sale_id).delete().execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Sale not found")

        if user_email:
            try:
                logger = get_activity_logger(db)
                logger.log_delete(
                    user_email=user_email,
                    entity_type="sale",
                    entity_name=f"Sale #{sale_id}",
                    entity_id=sale_id,
                    old_state=old_sale,
                )
            except Exception:
                pass

        return {"message": "Sale deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting sale: {str(e)}")


@router.get("/{sale_id}/invoice-pdf", dependencies=[Depends(verify_permission("download_invoice"))])
def get_invoice_pdf(
    sale_id: int,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Generate and download invoice PDF for a sale"""
    try:
        from fastapi.responses import StreamingResponse
        from reports import ReportGenerator
        import io

        # Get sale data
        sale_response = db.table("sales").select("*").eq("sale_id", sale_id).execute()

        if not sale_response.data:
            raise HTTPException(status_code=404, detail="Sale not found")

        sale = sale_response.data[0]

        # Get customer data
        customer_response = (
            db.table("customers")
            .select("*")
            .eq("customer_id", sale["customer_id"])
            .execute()
        )

        if not customer_response.data:
            raise HTTPException(status_code=404, detail="Customer not found")

        customer = customer_response.data[0]

        # Get sale items with product names
        items_response = (
            db.table("sale_items").select("*").eq("sale_id", sale_id).execute()
        )

        if not items_response.data:
            raise HTTPException(status_code=404, detail="No items found for this sale")

        # Get product details for items
        products_response = (
            db.table("products").select("product_id, product_name").execute()
        )
        products_dict = (
            {p["product_id"]: p for p in products_response.data}
            if products_response.data
            else {}
        )

        # Enrich items with product names
        items = []
        for item in items_response.data:
            product = products_dict.get(item.get("product_id"), {})
            items.append(
                {
                    **item,
                    "product_name": product.get("product_name", "Unknown Product"),
                }
            )

        # Generate PDF
        report_generator = ReportGenerator("Sales Management System")
        pdf_bytes = report_generator.generate_invoice_pdf(sale, customer, items)

        # Return as streaming response
        invoice_no = sale.get("invoice_no", "invoice")
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=invoice_{invoice_no}.pdf"
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error generating invoice PDF: {str(e)}"
        )
