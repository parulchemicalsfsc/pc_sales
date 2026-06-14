"""
balance_utils.py
----------------
Shared utility for recalculating a sale's remaining balance
and updating its payment_status.

Formula:
  net_paid   = sum(regular_payments) - sum(refund_paid_payments)
  remaining  = total_amount - net_paid - total_credit_notes + total_debit_notes

  "Refund Paid" payments are money OUT (company → customer), so they
  subtract from net_paid rather than adding to it.

Payment status thresholds:
  remaining <= 0            → "Paid"       (includes overpaid / exact match)
  0 < remaining < total     → "Partial"
  remaining == total        → "Pending"
  remaining < 0             → "Overpaid"

This function is imported and called from:
  - routers/payments.py  (create / update / delete payment)
  - routers/notes.py     (create note / void note)
"""

from supabase_db import SupabaseClient


def calculate_remaining_balance(sale_id: int, db: SupabaseClient) -> dict:
    """
    Recalculate and persist the payment_status for a given sale.

    Returns a dict with:
      total_amount, total_paid, credit_total, debit_total,
      remaining_balance, payment_status
    """
    # 1. Fetch the sale's total_amount
    sale_resp = db.table("sales").select("total_amount").eq("sale_id", sale_id).execute()
    if not sale_resp.data:
        return {}

    total_amount = float(sale_resp.data[0].get("total_amount") or 0)

    # 2. Sum payments for this sale
    #    Regular payments (Cash, UPI, etc.) = money IN  → adds to paid
    #    "Refund Paid" payments             = money OUT → subtracts from paid
    payments_resp = db.table("payments").select("amount, payment_method").eq("sale_id", sale_id).execute()
    total_paid = 0.0
    for p in (payments_resp.data or []):
        amt = float(p.get("amount") or 0)
        if (p.get("payment_method") or "").strip().lower() == "refund paid":
            total_paid -= amt   # money going OUT to customer reduces net-paid
        else:
            total_paid += amt   # money coming IN from customer

    # 3. Sum active credit and debit notes for this sale
    notes_resp = (
        db.table("credit_debit_notes")
        .select("note_type, amount")
        .eq("sale_id", sale_id)
        .eq("status", "active")
        .execute()
    )
    credit_total = 0.0
    debit_total = 0.0
    for note in (notes_resp.data or []):
        amt = float(note.get("amount") or 0)
        if note.get("note_type") == "credit":
            credit_total += amt
        elif note.get("note_type") == "debit":
            debit_total += amt

    # 4. Compute remaining balance
    remaining = total_amount - total_paid - credit_total + debit_total

    # 5. Determine payment_status with all four states
    if remaining < 0:
        payment_status = "Refund Due"  # Credit notes exceeded what was owed — company owes customer
    elif remaining == 0:
        payment_status = "Paid"
    elif remaining < total_amount:
        payment_status = "Partial"
    else:
        payment_status = "Pending"

    # 6. Persist to the sales table
    db.table("sales").eq("sale_id", sale_id).update({"payment_status": payment_status}).execute()

    return {
        "total_amount": total_amount,
        "total_paid": total_paid,
        "credit_total": credit_total,
        "debit_total": debit_total,
        "remaining_balance": remaining,
        "payment_status": payment_status,
    }
