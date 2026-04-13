from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from supabase_db import SupabaseClient, get_supabase
from rbac_utils import verify_permission

router = APIRouter()


# ======================
# Dashboard Metrics
# FIX-4: Use count-only queries instead of fetching entire tables.
# Previously: fetched ALL rows of 4 tables, counted/summed in Python.
# Now: targeted selects with only required columns.
# ======================
@router.get("/metrics", dependencies=[Depends(verify_permission("view_dashboard"))])
def dashboard_metrics(db: SupabaseClient = Depends(get_supabase)):
    """Get dashboard metrics using targeted queries (FIX-4 optimized)"""
    try:
        # 1. Sales Metrics — only fetch the 2 columns we actually use
        sales_response = db.table("sales").select("total_amount, payment_status").execute()
        sales_data = sales_response.data or []

        total_sales = sum((s.get("total_amount") or 0) for s in sales_data)
        total_transactions = len(sales_data)
        pending_amount = sum(
            (s.get("total_amount") or 0)
            for s in sales_data
            if str(s.get("payment_status", "")).lower() == "pending"
        )

        # 2. Customer Metrics — only fetch status column
        customers_response = db.table("customers").select("status").execute()
        customers_data = customers_response.data or []

        total_customers = len(customers_data)
        active_customers = sum(
            1 for c in customers_data if str(c.get("status", "")).lower() == "active"
        )

        # 3. Demo Conversion Rate — only fetch conversion_status column
        demo_conversion_rate = 0
        try:
            demos_response = db.table("demos").select("conversion_status").execute()
            demos_data = demos_response.data or []

            total_demos = len(demos_data)
            converted_demos = sum(
                1 for d in demos_data
                if str(d.get("conversion_status", "")).lower() == "converted"
            )

            if total_demos > 0:
                demo_conversion_rate = round((converted_demos / total_demos) * 100, 2)
        except Exception as demo_err:
            print(f"Warning: Could not fetch demos data: {demo_err}")

        # 4. Payment Method Distribution — only fetch the 2 columns we need
        payments_response = db.table("payments").select("payment_method, amount").execute()
        payments_data = payments_response.data or []

        payment_method_distribution = {}
        for p in payments_data:
            method = p.get("payment_method") or "Unknown"
            amount = p.get("amount") or 0
            payment_method_distribution[method] = payment_method_distribution.get(method, 0) + amount

        return {
            "total_sales": total_sales,
            "total_transactions": total_transactions,
            "pending_amount": pending_amount,
            "total_customers": total_customers,
            "active_customers": active_customers,
            "demo_conversion_rate": demo_conversion_rate,
            "payment_method_distribution": payment_method_distribution,
        }

    except Exception as e:
        print(f"Error in dashboard_metrics: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching metrics: {str(e)}")


# ======================
# Collected Payments
# FIX-6: Push date filtering into the query, not Python loops.
# Previously: fetched ALL payments, looped through every row to filter by date.
# Now: sends date range as query parameters so DB returns only relevant rows.
# NOTE: Uses TEXT comparison (gte/lte) which works correctly for YYYY-MM-DD strings.
# ======================
@router.get("/collected-payments", dependencies=[Depends(verify_permission("view_dashboard"))])
def get_collected_payments(
    start_date: str,
    end_date: str,
    db: SupabaseClient = Depends(get_supabase)
):
    """Get total collected payments for a date range (FIX-6 optimized)"""
    try:
        try:
            datetime.strptime(start_date, "%Y-%m-%d")
            datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

        # FIX-6: Filter at DB level — only fetch rows matching the date range
        response = (
            db.table("payments")
            .select("amount")
            .gte("payment_date", start_date)
            .lte("payment_date", end_date)
            .execute()
        )

        payments = response.data or []
        total_amount = sum(p.get("amount", 0) or 0 for p in payments)

        return {"total_amount": total_amount}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching collected payments: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ======================
# Sales Trend
# FIX-5: Apply date filtering at DB level, not in Python.
# Previously: fetched ALL sales ever, filtered/grouped in Python.
# Now: sends cutoff date so DB only returns the relevant window.
# ======================
@router.get("/sales-trend", dependencies=[Depends(verify_permission("view_dashboard"))])
def sales_trend(days: int = 30, db: SupabaseClient = Depends(get_supabase)):
    """Get sales trend for the last N days (FIX-5 optimized)"""
    try:
        today = datetime.now()
        cutoff_date = (today - timedelta(days=days)).strftime("%Y-%m-%d")
        today_str = today.strftime("%Y-%m-%d")

        # FIX-5: Filter at DB level — only fetch sales within the window
        response = (
            db.table("sales")
            .select("sale_date, total_amount")
            .gte("sale_date", cutoff_date)
            .lte("sale_date", today_str)
            .execute()
        )

        if not response.data:
            return []

        # Group by date and sum amounts
        trend_dict = {}
        for sale in response.data:
            date_key = sale.get("sale_date")
            if not date_key:
                continue
            trend_dict[date_key] = trend_dict.get(date_key, 0) + (sale.get("total_amount") or 0)

        result = [
            {"sale_date": date, "total_amount": amount}
            for date, amount in trend_dict.items()
        ]
        result.sort(key=lambda x: x["sale_date"])
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching sales trend: {str(e)}")


# ======================
# Recent Sales
# FIX-7: Use PostgREST embedding instead of fetching all customers separately.
# Previously: fetched last 10 sales + ALL customers just to do a name lookup.
# Now: single query with embedded customer join.
# ======================
@router.get("/recent-sales", dependencies=[Depends(verify_permission("view_dashboard"))])
def recent_sales(limit: int = 10, db: SupabaseClient = Depends(get_supabase)):
    """Get recent sales with customer information (FIX-7 optimized)"""
    try:
        # FIX-7: Embed customer join in a single query using PostgREST syntax
        sales_response = (
            db.table("sales")
            .select("invoice_no, total_amount, sale_date, payment_status, customers(name, village)")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

        if not sales_response.data:
            return []

        result = []
        for sale in sales_response.data:
            customer = sale.get("customers") or {}
            result.append({
                "invoice_no": sale.get("invoice_no"),
                "customer_name": customer.get("name"),
                "village": customer.get("village"),
                "total_amount": sale.get("total_amount"),
                "sale_date": sale.get("sale_date"),
                "payment_status": sale.get("payment_status"),
            })

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching recent sales: {str(e)}")


# ======================
# Upcoming Demos
# FIX-8: Use PostgREST embedding instead of fetching all customers + all products.
# Previously: fetched filtered demos, then ALL customers + ALL products for lookups.
# Now: single query with embedded joins for both customers and products.
# ======================
@router.get("/upcoming-demos", dependencies=[Depends(verify_permission("view_dashboard"))])
def upcoming_demos(limit: int = 10, db: SupabaseClient = Depends(get_supabase)):
    """Get upcoming scheduled demos (FIX-8 optimized)"""
    try:
        today = datetime.now().strftime("%Y-%m-%d")

        try:
            # FIX-8: Embed customer and product joins — no separate full-table fetches
            demos_response = (
                db.table("demos")
                .select("demo_id, demo_date, demo_time, conversion_status, customers(name, village), products(product_name)")
                .gte("demo_date", today)
                .eq("conversion_status", "Scheduled")
                .order("demo_date")
                .limit(limit)
                .execute()
            )
        except Exception as table_err:
            print(f"Warning: Could not fetch demos: {table_err}")
            return []

        if not demos_response.data:
            return []

        result = []
        for demo in demos_response.data:
            customer = demo.get("customers") or {}
            product = demo.get("products") or {}
            result.append({
                "demo_id": demo.get("demo_id"),
                "customer_name": customer.get("name"),
                "village": customer.get("village"),
                "product_name": product.get("product_name"),
                "demo_date": demo.get("demo_date"),
                "demo_time": demo.get("demo_time"),
                "conversion_status": demo.get("conversion_status"),
            })
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching upcoming demos: {str(e)}")


# ======================
# System Start Date
# ======================
@router.get("/system-start-date", dependencies=[Depends(verify_permission("view_dashboard"))])
def system_start_date(db: SupabaseClient = Depends(get_supabase)):
    """Get the oldest date from sales and payments to use as default date filter"""
    try:
        oldest_date = "2024-01-01"  # Default fallback

        # Check oldest sale — only 1 row needed, ordered ascending
        sales_resp = db.table("sales").select("sale_date").order("sale_date", desc=False).limit(1).execute()
        sale_date_str = None
        if sales_resp.data and sales_resp.data[0].get("sale_date"):
            sale_date_str = sales_resp.data[0].get("sale_date")

        # Check oldest payment
        payments_resp = db.table("payments").select("payment_date").order("payment_date", desc=False).limit(1).execute()
        payment_date_str = None
        if payments_resp.data and payments_resp.data[0].get("payment_date"):
            payment_date_str = payments_resp.data[0].get("payment_date")

        dates = []
        for d in [sale_date_str, payment_date_str]:
            if d:
                try:
                    datetime.strptime(d, "%Y-%m-%d")
                    dates.append(d)
                except ValueError:
                    pass

        if dates:
            oldest_date = min(dates)

        return {"start_date": oldest_date}
    except Exception as e:
        print(f"Error fetching system start date: {e}")
        return {"start_date": "2024-01-01"}
