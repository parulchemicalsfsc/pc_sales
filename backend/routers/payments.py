from typing import Optional

import requests
from fastapi import APIRouter, Depends, Header, HTTPException
from models import Payment
from supabase_db import SupabaseClient, get_supabase
from rbac_utils import verify_permission
from activity_logger import get_activity_logger

from routers.notifications import create_notification_helper

router = APIRouter()


@router.get("/", dependencies=[Depends(verify_permission("view_payments"))])
def get_payments(
    skip: int = 0,
    limit: int = 100,
    db: SupabaseClient = Depends(get_supabase),
):
    """Get all payments with related sale and customer information"""
    try:
        # Get all payments
        payments_response = (
            db.table("payments")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .offset(skip)
            .execute()
        )

        if not payments_response.data:
            return []

        # Get all sales
        sales_response = (
            db.table("sales").select("sale_id, invoice_no, customer_id").execute()
        )
        sales_dict = (
            {s["sale_id"]: s for s in sales_response.data}
            if sales_response.data
            else {}
        )

        # Get all customers
        customers_response = db.table("customers").select("customer_id, name").execute()
        customers_dict = (
            {c["customer_id"]: c for c in customers_response.data}
            if customers_response.data
            else {}
        )

        # Build result with joined data
        result = []
        for payment in payments_response.data:
            sale_id = payment.get("sale_id")
            sale = sales_dict.get(sale_id, {})
            customer_id = sale.get("customer_id")
            customer = customers_dict.get(customer_id, {})

            result.append(
                {
                    "payment_id": payment.get("payment_id"),
                    "sale_id": sale_id,
                    "invoice_no": sale.get("invoice_no"),
                    "customer_id": customer_id,
                    "customer_name": customer.get("name"),
                    "payment_date": payment.get("payment_date"),
                    "payment_method": payment.get("payment_method"),
                    "amount": payment.get("amount", 0),
                    "rrn": payment.get("rrn"),
                    "reference": payment.get("reference"),
                    "notes": payment.get("notes"),
                    "created_at": payment.get("created_at"),
                }
            )

        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching payments: {str(e)}"
        )


@router.get("/pending", dependencies=[Depends(verify_permission("view_payments"))])
def get_pending(db: SupabaseClient = Depends(get_supabase)):
    """Get sales with pending payments"""
    try:
        # Get all sales
        sales_response = db.table("sales").select("*").execute()

        if not sales_response.data:
            return []

        # Get all customers
        customers_response = (
            db.table("customers").select("customer_id, name, mobile").execute()
        )
        customers_dict = (
            {c["customer_id"]: c for c in customers_response.data}
            if customers_response.data
            else {}
        )

        # Get all payments
        payments_response = db.table("payments").select("sale_id, amount").execute()

        # Calculate paid amounts per sale
        paid_by_sale = {}
        if payments_response.data:
            for payment in payments_response.data:
                sale_id = payment.get("sale_id")
                amount = payment.get("amount", 0) or 0
                paid_by_sale[sale_id] = paid_by_sale.get(sale_id, 0) + amount

        # Build result with pending amounts
        result = []
        for sale in sales_response.data:
            sale_id = sale.get("sale_id")
            customer_id = sale.get("customer_id")
            total_amount = sale.get("total_amount", 0) or 0
            paid_amount = paid_by_sale.get(sale_id, 0)
            pending_amount = total_amount - paid_amount

            # Only include sales with pending amounts
            if pending_amount > 0:
                customer = customers_dict.get(customer_id, {})
                result.append(
                    {
                        "sale_id": sale_id,
                        "invoice_no": sale.get("invoice_no"),
                        "customer_name": customer.get("name"),
                        "mobile": customer.get("mobile"),
                        "sale_date": sale.get("sale_date"),
                        "total_amount": total_amount,
                        "paid_amount": paid_amount,
                        "pending_amount": pending_amount,
                    }
                )

        # Sort by pending amount descending
        result.sort(key=lambda x: x["pending_amount"], reverse=True)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching pending payments: {str(e)}"
        )


@router.get("/sale/{sale_id}", dependencies=[Depends(verify_permission("view_payments"))])
def get_payment_history(sale_id: int, db: SupabaseClient = Depends(get_supabase)):
    """Get payment history for a specific sale"""
    try:
        response = (
            db.table("payments")
            .select("*")
            .eq("sale_id", sale_id)
            .order("created_at", desc=True)
            .execute()
        )

        if not response.data:
            return []

        return response.data
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching payment history: {str(e)}"
        )


@router.get("/{payment_id}", dependencies=[Depends(verify_permission("view_payments"))])
def get_payment(payment_id: int, db: SupabaseClient = Depends(get_supabase)):
    """Get a single payment by ID"""
    try:
        response = (
            db.table("payments").select("*").eq("payment_id", payment_id).execute()
        )

        if not response.data:
            raise HTTPException(status_code=404, detail="Payment not found")

        payment = response.data[0]

        # Get related sale and customer info
        sale_id = payment.get("sale_id")
        if sale_id:
            sale_response = (
                db.table("sales").select("*").eq("sale_id", sale_id).execute()
            )
            if sale_response.data:
                sale = sale_response.data[0]
                payment["invoice_no"] = sale.get("invoice_no")

                customer_id = sale.get("customer_id")
                if customer_id:
                    customer_response = (
                        db.table("customers")
                        .select("*")
                        .eq("customer_id", customer_id)
                        .execute()
                    )
                    if customer_response.data:
                        payment["customer_name"] = customer_response.data[0].get("name")

        return payment
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching payment: {str(e)}")


@router.post("/test")
def test_payment_creation(payment: Payment):
    """Test endpoint to validate payment data"""
    return {
        "status": "ok",
        "received_data": {
            "sale_id": payment.sale_id,
            "payment_date": payment.payment_date,
            "payment_method": payment.payment_method,
            "amount": payment.amount,
            "rrn": payment.rrn,
            "reference": payment.reference,
            "notes": payment.notes,
        },
    }


@router.post("/", dependencies=[Depends(verify_permission("record_payment"))])
def create_payment(
    payment: Payment,
    db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Create a new payment and update sale payment status"""
    try:
        # Debug: Print payment data
        print(
            f"Received payment request: sale_id={payment.sale_id}, amount={payment.amount}"
        )
        # Validate required fields
        if not payment.sale_id:
            raise HTTPException(status_code=400, detail="Sale ID is required")

        if not payment.amount or payment.amount <= 0:
            raise HTTPException(
                status_code=400, detail="Payment amount must be greater than 0"
            )

        if not payment.payment_date:
            raise HTTPException(status_code=400, detail="Payment date is required")

        if not payment.payment_method:
            raise HTTPException(status_code=400, detail="Payment method is required")

        # Insert payment first (don't verify sale exists to avoid 400 error)
        payment_data = {
            "sale_id": int(payment.sale_id),
            "payment_date": str(payment.payment_date),
            "payment_method": str(payment.payment_method),
            "amount": float(payment.amount),
        }

        # Add optional fields only if they have values
        if payment.rrn:
            payment_data["rrn"] = str(payment.rrn)
        if payment.reference:
            payment_data["reference"] = str(payment.reference)
        if payment.notes:
            payment_data["notes"] = str(payment.notes)

        print(f"Inserting payment: {payment_data}")

        try:
            payment_response = db.table("payments").insert(payment_data).execute()
        except requests.HTTPError as http_err:
            print(f"Supabase HTTP error: {http_err}")
            print(
                f"Response: {http_err.response.text if hasattr(http_err, 'response') else 'No response'}"
            )
            raise HTTPException(
                status_code=500,
                detail=f"Database error: Unable to insert payment. Please check database permissions and table structure.",
            )
        except Exception as insert_err:
            print(f"Insert error: {str(insert_err)}")
            raise HTTPException(
                status_code=500, detail=f"Failed to create payment: {str(insert_err)}"
            )

        if not payment_response.data:
            raise HTTPException(
                status_code=400, detail="Failed to create payment - no data returned"
            )

        created_payment = payment_response.data[0]
        print(f"Payment created successfully: {created_payment.get('payment_id')}")

        # Try to update sale status (but don't fail if it doesn't work)
        payment_status = None
        total_paid = None
        total_amount = None

        try:
            # Get the sale to calculate payment status
            sale_response = (
                db.table("sales")
                .select("sale_id, total_amount")
                .eq("sale_id", payment.sale_id)
                .execute()
            )

            if sale_response.data:
                sale = sale_response.data[0]
                total_amount = float(sale.get("total_amount", 0) or 0)

                # Calculate total paid amount for this sale
                all_payments = (
                    db.table("payments")
                    .select("amount")
                    .eq("sale_id", payment.sale_id)
                    .execute()
                )

                total_paid = 0.0
                if all_payments.data:
                    for p in all_payments.data:
                        amount = p.get("amount")
                        if amount:
                            total_paid += float(amount)

                # Update sale payment status
                if total_paid >= total_amount:
                    payment_status = "Paid"
                elif total_paid > 0:
                    payment_status = "Partial"
                else:
                    payment_status = "Pending"

                print(f"Updating sale status to: {payment_status}")
                db.table("sales").eq("sale_id", sale_id).update({"payment_status": payment_status}).execute()
        except requests.HTTPError as sale_http_err:
            print(f"Warning: Supabase HTTP error updating sale: {sale_http_err}")
            print(f"This may be due to RLS policies. Payment was still created.")
        except Exception as status_error:
            print(f"Warning: Could not update sale status: {str(status_error)}")
            # Payment was created successfully, just return without status update

        # Return success with available data
        response_data = {
            "message": "Payment recorded successfully",
            "payment": created_payment,
        }

        if payment_status:
            response_data["payment_status"] = payment_status
        if total_paid is not None:
            response_data["total_paid"] = total_paid
        if total_amount is not None:
            response_data["total_amount"] = total_amount
            response_data["pending_amount"] = max(0, total_amount - total_paid)

        # Notification creation removed as per user request

        # Log activity
        if user_email:
            try:
                logger = get_activity_logger(db)
                logger.log_create(
                    user_email=user_email,
                    entity_type="payment",
                    entity_name=f"Payment #{created_payment.get('payment_id')} for Sale #{payment.sale_id}",
                    entity_id=created_payment.get("payment_id"),
                    new_state=created_payment,
                    metadata={"amount": float(payment.amount), "sale_id": int(payment.sale_id)},
                )
            except Exception:
                pass

        return response_data

    except HTTPException:
        raise
    except requests.HTTPError as http_err:
        print(f"HTTP Error in payment creation: {http_err}")
        raise HTTPException(
            status_code=500,
            detail="Database connection error. Please check your database permissions.",
        )
    except Exception as e:
        print(f"Payment creation error: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error creating payment: {str(e)}")


@router.put("/{payment_id}", dependencies=[Depends(verify_permission("edit_payment"))])
def update_payment(
    payment_id: int, payment_data: dict, db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Update a payment"""
    try:
        # Get existing payment to get sale_id
        existing_payment = (
            db.table("payments").select("*").eq("payment_id", payment_id).execute()
        )

        if not existing_payment.data:
            raise HTTPException(status_code=404, detail="Payment not found")

        current_payment = existing_payment.data[0]
        sale_id = current_payment.get("sale_id")

        # Update payment
        response = (
            db.table("payments")
            .eq("payment_id", payment_id)
            .update(payment_data)
            .execute()
        )

        if not response.data:
            raise HTTPException(status_code=404, detail="Payment not found")

        # Recalculate sale payment status
        if sale_id:
            sale_response = (
                db.table("sales").select("*").eq("sale_id", sale_id).execute()
            )

            if sale_response.data:
                sale = sale_response.data[0]
                total_amount = sale.get("total_amount", 0) or 0

                # Calculate total paid
                all_payments = (
                    db.table("payments")
                    .select("amount")
                    .eq("sale_id", sale_id)
                    .execute()
                )

                total_paid = sum(
                    p.get("amount", 0) or 0 for p in (all_payments.data or [])
                )

                # Update payment status
                if total_paid >= total_amount:
                    payment_status = "Paid"
                elif total_paid > 0:
                    payment_status = "Partial"
                else:
                    payment_status = "Pending"

                db.table("sales").eq("sale_id", sale_id).update({"payment_status": payment_status}).execute()

        if user_email and current_payment:
            try:
                logger = get_activity_logger(db)
                logger.log_update_with_diff(
                    user_email=user_email,
                    entity_type="payment",
                    entity_name=f"Payment #{payment_id}",
                    entity_id=payment_id,
                    before=current_payment,
                    after=payment_data,
                )
            except Exception as le:
                 print(f"[ERROR] Failed to log update diff: {le}")

        return {"message": "Payment updated successfully", "payment": response.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating payment: {str(e)}")


@router.delete("/{payment_id}", dependencies=[Depends(verify_permission("delete_payment"))])
def delete_payment(payment_id: int, db: SupabaseClient = Depends(get_supabase),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
):
    """Delete a payment and update sale payment status"""
    try:
        # Get payment to get sale_id before deleting
        payment_response = (
            db.table("payments").select("*").eq("payment_id", payment_id).execute()
        )

        if not payment_response.data:
            raise HTTPException(status_code=404, detail="Payment not found")

        sale_id = payment_response.data[0].get("sale_id")

        # Delete payment
        delete_response = (
            db.table("payments").eq("payment_id", payment_id).delete().execute()
        )

        if not delete_response.data:
            raise HTTPException(status_code=404, detail="Payment not found")

        # Recalculate sale payment status
        if sale_id:
            sale_response = (
                db.table("sales").select("*").eq("sale_id", sale_id).execute()
            )

            if sale_response.data:
                sale = sale_response.data[0]
                total_amount = sale.get("total_amount", 0) or 0

                # Calculate remaining paid amount
                all_payments = (
                    db.table("payments")
                    .select("amount")
                    .eq("sale_id", sale_id)
                    .execute()
                )

                total_paid = sum(
                    p.get("amount", 0) or 0 for p in (all_payments.data or [])
                )

                # Update payment status
                if total_paid >= total_amount:
                    payment_status = "Paid"
                elif total_paid > 0:
                    payment_status = "Partial"
                else:
                    payment_status = "Pending"

                db.table("sales").eq("sale_id", sale_id).update({"payment_status": payment_status}).execute()

        if user_email:
            try:
                logger = get_activity_logger(db)
                logger.log_delete(
                    user_email=user_email,
                    entity_type="payment",
                    entity_name=f"Payment #{payment_id}",
                    entity_id=payment_id,
                    old_state=payment_response.data[0],
                )
            except Exception:
                pass

        return {"message": "Payment deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting payment: {str(e)}")
