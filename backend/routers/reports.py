"""
Reports Router
Handles report generation for sales trends, payments, and PDFs
"""

from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from fastapi.responses import StreamingResponse
from supabase_db import SupabaseClient, get_db
from reports import ReportGenerator
from rbac_utils import verify_permission
from services.telecaller_reports import (
    get_telecaller_dashboard,
    prepare_performance_export,
    prepare_attendance_export,
    prepare_call_logs_export,
    prepare_orders_export
)
import io

router = APIRouter()
report_generator = ReportGenerator("Sales Management System")


def get_user_email(user_email: Optional[str] = Header(None, alias="x-user-email")):
    """Get user email from header (kept for backward compat where needed)"""
    if not user_email:
        raise HTTPException(status_code=401, detail="User email not provided")
    return user_email


@router.get("/sales-trend", dependencies=[Depends(verify_permission("view_reports"))])
def get_sales_trend(
    interval: str = "daily",  # daily, weekly, monthly
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """
    FIX-9: Get sales trend — filter at DB level, not in Python.
    Previously fetched ALL sales across all time and filtered in Python.
    Now sends date range to DB so only matching rows are returned.
    """
    try:
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")

        try:
            datetime.strptime(start_date, "%Y-%m-%d")
            datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

        print(f"=== SALES TREND API CALLED ===")
        print(f"Interval: {interval}, Start: {start_date}, End: {end_date}")

        # FIX-9: Filter at DB level — only fetch rows in the date range
        response = (
            db.table("sales")
            .select("sale_date, total_amount, total_liters")
            .gte("sale_date", start_date)
            .lte("sale_date", end_date)
            .execute()
        )
        sales_data = response.data or []

        # Group by interval in Python — dataset is now small (only the date window)
        trends = {}
        for sale in sales_data:
            date_str = sale.get("sale_date")
            if not date_str:
                continue
            try:
                sale_date = datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                continue

            if interval == "daily":
                key = date_str
            elif interval == "weekly":
                key = f"{sale_date.strftime('%Y')}-W{sale_date.strftime('%W')}"
            elif interval == "monthly":
                key = sale_date.strftime("%Y-%m")
            else:
                key = date_str

            if key not in trends:
                trends[key] = {"period": key, "sales_count": 0, "total_amount": 0, "total_liters": 0}

            trends[key]["sales_count"] += 1
            trends[key]["total_amount"] += sale.get("total_amount", 0) or 0
            trends[key]["total_liters"] += sale.get("total_liters", 0) or 0

        trends_list = sorted(trends.values(), key=lambda x: x["period"])
        return {"trends": trends_list}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_sales_trend: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching sales trend: {str(e)}")



@router.get("/analytics-summary", dependencies=[Depends(verify_permission("view_reports"))])
def get_analytics_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    district: Optional[str] = None,
    village: Optional[str] = None,
    product_id: Optional[int] = None,
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """
    FIX-10: Get KPI summary — use targeted queries with DB-level date filtering.
    Previously: fetched ALL of 4 full tables, joined and filtered everything in Python.
    Now: only fetches the date-window rows needed, with minimal columns.
    """
    try:
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = datetime.now().replace(day=1).strftime("%Y-%m-%d")

        try:
            datetime.strptime(start_date, "%Y-%m-%d")
            datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

        # FIX-10: Fetch only rows within the date range with minimal columns
        sales_resp = (
            db.table("sales")
            .select("sale_id, total_amount, total_liters, customer_id, buyer_type, doctor_id, shopkeeper_id, distributor_id")
            .gte("sale_date", start_date)
            .lte("sale_date", end_date)
            .execute()
        )
        all_sales = sales_resp.data or []

        # Fetch only customers we actually need (by IDs in the filtered sales)
        customer_ids = list({s["customer_id"] for s in all_sales if s.get("customer_id")})
        customers_dict = {}
        if customer_ids:
            # PostgREST can filter by list using in_
            customers_resp = (
                db.table("customers")
                .select("customer_id, name, village, district")
                .in_("customer_id", customer_ids)
                .execute()
            )
            customers_dict = {c["customer_id"]: c for c in (customers_resp.data or [])}

        # Fetch other buyer types to resolve district properly
        districts_map = {}
        villages_map = {}
        
        doctor_ids = list({s["doctor_id"] for s in all_sales if s.get("doctor_id")})
        if doctor_ids:
            docs = db.table("doctors").select("doctor_id, district, village").in_("doctor_id", doctor_ids).execute().data or []
            for d in docs: 
                districts_map[f"doctor_{d['doctor_id']}"] = d.get("district")
                villages_map[f"doctor_{d['doctor_id']}"] = d.get("village")
            
        shopkeeper_ids = list({s["shopkeeper_id"] for s in all_sales if s.get("shopkeeper_id")})
        if shopkeeper_ids:
            sks = db.table("shopkeepers").select("shopkeeper_id, district, village").in_("shopkeeper_id", shopkeeper_ids).execute().data or []
            for sk in sks: 
                districts_map[f"shopkeeper_{sk['shopkeeper_id']}"] = sk.get("district")
                villages_map[f"shopkeeper_{sk['shopkeeper_id']}"] = sk.get("village")
            
        distributor_ids = list({s["distributor_id"] for s in all_sales if s.get("distributor_id")})
        if distributor_ids:
            dists = db.table("distributors").select("distributor_id, district, village").in_("distributor_id", distributor_ids).execute().data or []
            for d in dists: 
                districts_map[f"distributor_{d['distributor_id']}"] = d.get("district")
                villages_map[f"distributor_{d['distributor_id']}"] = d.get("village")

        # Apply district/village filters in Python (small dataset now)
        filtered_sales = []
        for sale in all_sales:
            customer = customers_dict.get(sale.get("customer_id"), {})
            
            # Resolve district and village based on buyer_type
            sale_district = customer.get("district")
            sale_village = customer.get("village")
            buyer_type = sale.get("buyer_type")
            
            if not sale_district and buyer_type:
                if buyer_type == "doctor":
                    sale_district = districts_map.get(f"doctor_{sale.get('doctor_id')}")
                    sale_village = villages_map.get(f"doctor_{sale.get('doctor_id')}")
                elif buyer_type == "shopkeeper":
                    sale_district = districts_map.get(f"shopkeeper_{sale.get('shopkeeper_id')}")
                    sale_village = villages_map.get(f"shopkeeper_{sale.get('shopkeeper_id')}")
                elif buyer_type in ("distributor", "mantri"):
                    sale_district = districts_map.get(f"distributor_{sale.get('distributor_id')}")
                    sale_village = villages_map.get(f"distributor_{sale.get('distributor_id')}")
            
            # Store on the sale for KPIs
            sale["resolved_district"] = sale_district
            sale["resolved_village"] = sale_village

            if district and (sale_district or "").strip() != district.strip():
                continue
            if village and (sale_village or "").strip() != village.strip():
                continue
            filtered_sales.append({**sale, "customer": customer})

        # Product filter — only if specified
        if product_id is not None:
            filtered_sale_ids = {s["sale_id"] for s in filtered_sales}
            if filtered_sale_ids:
                items_resp = (
                    db.table("sale_items")
                    .select("sale_id")
                    .eq("product_id", product_id)
                    .in_("sale_id", list(filtered_sale_ids))
                    .execute()
                )
                matching_ids = {item["sale_id"] for item in (items_resp.data or [])}
                filtered_sales = [s for s in filtered_sales if s["sale_id"] in matching_ids]

        # Compute KPIs
        total_orders = len(filtered_sales)
        total_revenue = sum(s.get("total_amount") or 0 for s in filtered_sales)
        total_liters = sum(s.get("total_liters") or 0 for s in filtered_sales)
        avg_order_value = round(total_revenue / total_orders, 2) if total_orders > 0 else 0

        # Top district
        district_revenue: dict = {}
        for s in filtered_sales:
            d = s.get("resolved_district") or "Unknown"
            district_revenue[d] = district_revenue.get(d, 0) + (s.get("total_amount") or 0)
        top_district = max(district_revenue, key=district_revenue.get) if district_revenue else None
        top_district_amount = district_revenue.get(top_district, 0) if top_district else 0

        # Top product — fetch sale_items only for the filtered sale IDs
        filtered_sale_id_set = {s["sale_id"] for s in filtered_sales}
        top_product_name = None
        top_product_amount = 0
        if filtered_sale_id_set:
            items_resp = (
                db.table("sale_items")
                .select("sale_id, product_id, amount, products(product_name)")
                .in_("sale_id", list(filtered_sale_id_set))
                .execute()
            )
            product_revenue: dict = {}
            product_names: dict = {}
            for item in (items_resp.data or []):
                pid = item.get("product_id")
                if pid is None:
                    continue
                product_revenue[pid] = product_revenue.get(pid, 0) + (item.get("amount") or 0)
                if pid not in product_names:
                    prod = item.get("products") or {}
                    product_names[pid] = prod.get("product_name", "Unknown")

            if product_revenue:
                top_product_id = max(product_revenue, key=product_revenue.get)
                top_product_name = product_names.get(top_product_id)
                top_product_amount = product_revenue.get(top_product_id, 0)

        return {
            "total_orders": total_orders,
            "total_revenue": round(total_revenue, 2),
            "total_liters": round(total_liters, 2),
            "avg_order_value": avg_order_value,
            "top_district": top_district,
            "top_district_amount": round(top_district_amount, 2),
            "top_product": top_product_name,
            "top_product_amount": round(top_product_amount, 2),
            "filters": {
                "start_date": start_date,
                "end_date": end_date,
                "district": district,
                "village": village,
                "product_id": product_id,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching analytics summary: {str(e)}")


@router.get("/dimension-breakdown", dependencies=[Depends(verify_permission("view_reports"))])
def get_dimension_breakdown(
    dimension: str = "district",  # district | village | product | customer
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    district: Optional[str] = None,
    village: Optional[str] = None,
    product_id: Optional[int] = None,
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """
    FIX-11: Returns ranked breakdown by dimension.
    Previously: fetched ALL of 4 full tables regardless of date range.
    Now: date filter applied at DB level; only needed customer IDs fetched.
    """
    try:
        if dimension not in ("district", "village", "product", "customer"):
            raise HTTPException(status_code=400, detail="Invalid dimension. Use: district, village, product, customer")

        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = datetime.now().replace(day=1).strftime("%Y-%m-%d")

        try:
            datetime.strptime(start_date, "%Y-%m-%d")
            datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

        # FIX-11: Only fetch sales in the date window
        sales_resp = (
            db.table("sales")
            .select("sale_id, total_amount, total_liters, customer_id, buyer_type, doctor_id, shopkeeper_id, distributor_id")
            .gte("sale_date", start_date)
            .lte("sale_date", end_date)
            .execute()
        )
        all_sales = sales_resp.data or []

        # Fetch only customers referenced by those sales
        customer_ids = list({s["customer_id"] for s in all_sales if s.get("customer_id")})
        customers_dict = {}
        if customer_ids:
            customers_resp = (
                db.table("customers")
                .select("customer_id, name, village, district")
                .in_("customer_id", customer_ids)
                .execute()
            )
            customers_dict = {c["customer_id"]: c for c in (customers_resp.data or [])}

        # Apply district/village filters
        all_sales_enriched = []
        for sale in all_sales:
            customer = customers_dict.get(sale.get("customer_id"), {})
            if district and customer.get("district", "").strip() != district.strip():
                continue
            if village and customer.get("village", "").strip() != village.strip():
                continue
            all_sales_enriched.append({**sale, "customer": customer})

        # Product filter
        if product_id is not None:
            sale_ids = {s["sale_id"] for s in all_sales_enriched}
            if sale_ids:
                items_resp = (
                    db.table("sale_items")
                    .select("sale_id")
                    .eq("product_id", product_id)
                    .in_("sale_id", list(sale_ids))
                    .execute()
                )
                matching_ids = {item["sale_id"] for item in (items_resp.data or [])}
                all_sales_enriched = [s for s in all_sales_enriched if s["sale_id"] in matching_ids]
            else:
                all_sales_enriched = []

        filtered_sales = all_sales_enriched
        total_revenue = sum(s.get("total_amount") or 0 for s in filtered_sales)
        total_liters_all = sum(s.get("total_liters") or 0 for s in filtered_sales)
        filtered_sale_ids = {s["sale_id"] for s in filtered_sales}

        rows = []

        if dimension == "district":
            # Fetch districts for non-customer buyers
            districts_map = {}
            
            doctor_ids = list({s["doctor_id"] for s in filtered_sales if s.get("doctor_id")})
            if doctor_ids:
                docs = db.table("doctors").select("doctor_id, district").in_("doctor_id", doctor_ids).execute().data or []
                for d in docs: districts_map[f"doctor_{d['doctor_id']}"] = d.get("district")
                
            shopkeeper_ids = list({s["shopkeeper_id"] for s in filtered_sales if s.get("shopkeeper_id")})
            if shopkeeper_ids:
                sks = db.table("shopkeepers").select("shopkeeper_id, district").in_("shopkeeper_id", shopkeeper_ids).execute().data or []
                for sk in sks: districts_map[f"shopkeeper_{sk['shopkeeper_id']}"] = sk.get("district")
                
            distributor_ids = list({s["distributor_id"] for s in filtered_sales if s.get("distributor_id")})
            if distributor_ids:
                dists = db.table("distributors").select("distributor_id, district").in_("distributor_id", distributor_ids).execute().data or []
                for d in dists: districts_map[f"distributor_{d['distributor_id']}"] = d.get("district")

            groups: dict = {}
            for s in filtered_sales:
                key = s["customer"].get("district")
                
                # Resolve for other buyer types
                buyer_type = s.get("buyer_type")
                if not key and buyer_type:
                    if buyer_type == "doctor":
                        key = districts_map.get(f"doctor_{s.get('doctor_id')}")
                    elif buyer_type == "shopkeeper":
                        key = districts_map.get(f"shopkeeper_{s.get('shopkeeper_id')}")
                    elif buyer_type in ("distributor", "mantri"):
                        key = districts_map.get(f"distributor_{s.get('distributor_id')}")
                        
                key = key or "Unknown"

                print("[REPORT DISTRICT DEBUG]")
                print(f"sale_id: {s.get('sale_id')}")
                print(f"buyer_type: {buyer_type}")
                print(f"customer_id: {s.get('customer_id')}")
                print(f"resolved_district: {key}\n")

                if key not in groups:
                    groups[key] = {"orders": 0, "revenue": 0, "liters": 0}
                groups[key]["orders"] += 1
                groups[key]["revenue"] += s.get("total_amount") or 0
                groups[key]["liters"] += s.get("total_liters") or 0

            for key, vals in groups.items():
                rows.append({
                    "label": key,
                    "orders": vals["orders"],
                    "revenue": round(vals["revenue"], 2),
                    "liters": round(vals["liters"], 2),
                    "pct": round(vals["revenue"] / total_revenue * 100, 1) if total_revenue > 0 else 0,
                    "secondary_label": None,
                })

        elif dimension == "village":
            villages_map = {}
            districts_map = {}
            
            doctor_ids = list({s["doctor_id"] for s in filtered_sales if s.get("doctor_id")})
            if doctor_ids:
                docs = db.table("doctors").select("doctor_id, village, district").in_("doctor_id", doctor_ids).execute().data or []
                for d in docs: 
                    villages_map[f"doctor_{d['doctor_id']}"] = d.get("village")
                    districts_map[f"doctor_{d['doctor_id']}"] = d.get("district")
                
            shopkeeper_ids = list({s["shopkeeper_id"] for s in filtered_sales if s.get("shopkeeper_id")})
            if shopkeeper_ids:
                sks = db.table("shopkeepers").select("shopkeeper_id, village, district").in_("shopkeeper_id", shopkeeper_ids).execute().data or []
                for sk in sks: 
                    villages_map[f"shopkeeper_{sk['shopkeeper_id']}"] = sk.get("village")
                    districts_map[f"shopkeeper_{sk['shopkeeper_id']}"] = sk.get("district")
                
            distributor_ids = list({s["distributor_id"] for s in filtered_sales if s.get("distributor_id")})
            if distributor_ids:
                dists = db.table("distributors").select("distributor_id, village, district").in_("distributor_id", distributor_ids).execute().data or []
                for d in dists: 
                    villages_map[f"distributor_{d['distributor_id']}"] = d.get("village")
                    districts_map[f"distributor_{d['distributor_id']}"] = d.get("district")

            groups: dict = {}
            for s in filtered_sales:
                key = s["customer"].get("village")
                dist = s["customer"].get("district")
                
                buyer_type = s.get("buyer_type")
                if not key and buyer_type:
                    if buyer_type == "doctor":
                        key = villages_map.get(f"doctor_{s.get('doctor_id')}")
                        dist = districts_map.get(f"doctor_{s.get('doctor_id')}")
                    elif buyer_type == "shopkeeper":
                        key = villages_map.get(f"shopkeeper_{s.get('shopkeeper_id')}")
                        dist = districts_map.get(f"shopkeeper_{s.get('shopkeeper_id')}")
                    elif buyer_type in ("distributor", "mantri"):
                        key = villages_map.get(f"distributor_{s.get('distributor_id')}")
                        dist = districts_map.get(f"distributor_{s.get('distributor_id')}")
                
                key = key or "Unknown"
                dist = dist or ""

                if key not in groups:
                    groups[key] = {"orders": 0, "revenue": 0, "liters": 0, "district": dist}
                groups[key]["orders"] += 1
                groups[key]["revenue"] += s.get("total_amount") or 0
                groups[key]["liters"] += s.get("total_liters") or 0

            for key, vals in groups.items():
                rows.append({
                    "label": key,
                    "secondary_label": vals["district"],
                    "orders": vals["orders"],
                    "revenue": round(vals["revenue"], 2),
                    "liters": round(vals["liters"], 2),
                    "pct": round(vals["revenue"] / total_revenue * 100, 1) if total_revenue > 0 else 0,
                })

        elif dimension == "product":
            # Fetch sale_items for only the filtered sale IDs
            if filtered_sale_ids:
                items_resp = (
                    db.table("sale_items")
                    .select("sale_id, product_id, quantity, amount, products(product_name, packing_type)")
                    .in_("sale_id", list(filtered_sale_ids))
                    .execute()
                )
                all_items = items_resp.data or []
            else:
                all_items = []

            product_groups: dict = {}
            for item in all_items:
                pid = item.get("product_id")
                if pid is None:
                    continue
                prod = item.get("products") or {}
                label = prod.get("product_name", "Unknown")
                packing = prod.get("packing_type") or ""
                if pid not in product_groups:
                    product_groups[pid] = {"label": label, "packing": packing, "orders": 0, "qty": 0, "revenue": 0}
                product_groups[pid]["orders"] += 1
                product_groups[pid]["qty"] += item.get("quantity") or 0
                product_groups[pid]["revenue"] += item.get("amount") or 0

            product_total = sum(v["revenue"] for v in product_groups.values())
            for vals in product_groups.values():
                rows.append({
                    "label": vals["label"],
                    "secondary_label": vals["packing"],
                    "orders": vals["orders"],
                    "revenue": round(vals["revenue"], 2),
                    "liters": round(vals["qty"], 2),
                    "pct": round(vals["revenue"] / product_total * 100, 1) if product_total > 0 else 0,
                })

        elif dimension == "customer":
            names_map = {}
            villages_map = {}
            districts_map = {}
            
            doctor_ids = list({s["doctor_id"] for s in filtered_sales if s.get("doctor_id")})
            if doctor_ids:
                docs = db.table("doctors").select("doctor_id, name, village, district").in_("doctor_id", doctor_ids).execute().data or []
                for d in docs: 
                    names_map[f"doctor_{d['doctor_id']}"] = d.get("name")
                    villages_map[f"doctor_{d['doctor_id']}"] = d.get("village")
                    districts_map[f"doctor_{d['doctor_id']}"] = d.get("district")
                
            shopkeeper_ids = list({s["shopkeeper_id"] for s in filtered_sales if s.get("shopkeeper_id")})
            if shopkeeper_ids:
                sks = db.table("shopkeepers").select("shopkeeper_id, name, village, district").in_("shopkeeper_id", shopkeeper_ids).execute().data or []
                for sk in sks: 
                    names_map[f"shopkeeper_{sk['shopkeeper_id']}"] = sk.get("name")
                    villages_map[f"shopkeeper_{sk['shopkeeper_id']}"] = sk.get("village")
                    districts_map[f"shopkeeper_{sk['shopkeeper_id']}"] = sk.get("district")
                
            distributor_ids = list({s["distributor_id"] for s in filtered_sales if s.get("distributor_id")})
            if distributor_ids:
                dists = db.table("distributors").select("distributor_id, mantri_name, village, district").in_("distributor_id", distributor_ids).execute().data or []
                for d in dists: 
                    names_map[f"distributor_{d['distributor_id']}"] = d.get("mantri_name")
                    villages_map[f"distributor_{d['distributor_id']}"] = d.get("village")
                    districts_map[f"distributor_{d['distributor_id']}"] = d.get("district")

            customer_groups: dict = {}
            for s in filtered_sales:
                cid = s.get("customer_id")
                customer = s["customer"]
                name = customer.get("name")
                vill = customer.get("village")
                dist = customer.get("district")
                
                buyer_type = s.get("buyer_type")
                resolved_id = cid
                
                if not name and buyer_type:
                    if buyer_type == "doctor":
                        name = names_map.get(f"doctor_{s.get('doctor_id')}")
                        vill = villages_map.get(f"doctor_{s.get('doctor_id')}")
                        dist = districts_map.get(f"doctor_{s.get('doctor_id')}")
                        resolved_id = s.get('doctor_id')
                    elif buyer_type == "shopkeeper":
                        name = names_map.get(f"shopkeeper_{s.get('shopkeeper_id')}")
                        vill = villages_map.get(f"shopkeeper_{s.get('shopkeeper_id')}")
                        dist = districts_map.get(f"shopkeeper_{s.get('shopkeeper_id')}")
                        resolved_id = s.get('shopkeeper_id')
                    elif buyer_type in ("distributor", "mantri"):
                        name = names_map.get(f"distributor_{s.get('distributor_id')}")
                        vill = villages_map.get(f"distributor_{s.get('distributor_id')}")
                        dist = districts_map.get(f"distributor_{s.get('distributor_id')}")
                        resolved_id = s.get('distributor_id')
                        
                if not name:
                    if resolved_id is not None:
                        name = f"ID:{resolved_id}"
                    else:
                        name = "Unknown"
                        
                vill = vill or ""
                dist = dist or ""
                
                group_key = f"{buyer_type}_{resolved_id}" if resolved_id else "unknown_buyer"
                
                if group_key not in customer_groups:
                    customer_groups[group_key] = {"label": name, "village": vill, "district": dist, "orders": 0, "revenue": 0, "liters": 0}
                customer_groups[group_key]["orders"] += 1
                customer_groups[group_key]["revenue"] += s.get("total_amount") or 0
                customer_groups[group_key]["liters"] += s.get("total_liters") or 0

            for vals in customer_groups.values():
                rows.append({
                    "label": vals["label"],
                    "secondary_label": f"{vals['village']}, {vals['district']}".strip(", "),
                    "orders": vals["orders"],
                    "revenue": round(vals["revenue"], 2),
                    "liters": round(vals["liters"], 2),
                    "pct": round(vals["revenue"] / total_revenue * 100, 1) if total_revenue > 0 else 0,
                })

        rows.sort(key=lambda x: x["revenue"], reverse=True)
        for i, row in enumerate(rows):
            row["rank"] = i + 1

        return {
            "dimension": dimension,
            "total_revenue": round(total_revenue, 2),
            "total_liters": round(total_liters_all, 2),
            "rows": rows,
            "filters": {
                "start_date": start_date,
                "end_date": end_date,
                "district": district,
                "village": village,
                "product_id": product_id,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching dimension breakdown: {str(e)}")


@router.get("/filter-options", dependencies=[Depends(verify_permission("view_reports"))])
def get_filter_options(
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """Get available distinct values for filter dropdowns: districts, villages, products."""
    try:
        customers_resp = db.table("customers").select("village, district").execute()
        customers_data = customers_resp.data or []

        invalid_districts = {"GUJRAT", "GUJARAT", "STATE"}
        districts_set = set()
        for c in customers_data:
            d = c.get("district")
            if d and isinstance(d, str):
                d_clean = d.strip().upper()
                if d_clean and d_clean not in invalid_districts:
                    districts_set.add(d_clean)
        districts = sorted(list(districts_set))
        villages = sorted(list({c["village"] for c in customers_data if c.get("village")}))

        products_resp = db.table("products").select("product_id, product_name, packing_type").eq("is_active", 1).execute()
        products = [
            {"product_id": p["product_id"], "label": f"{p.get('product_name', '')} ({p.get('packing_type', '')})"}
            for p in (products_resp.data or [])
        ]

        return {"districts": districts, "villages": villages, "products": products}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching filter options: {str(e)}")


@router.get("/payment-trend", dependencies=[Depends(verify_permission("view_reports"))])
def get_payment_trend(
    interval: str = "daily",  # daily, weekly, monthly
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """
    FIX-12: Get payment trend — filter at DB level, not in Python.
    Previously fetched ALL payments ever and filtered by date in Python.
    Now sends date range so only matching rows are returned.
    """
    try:
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")

        try:
            start_date_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_date_dt = datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

        # FIX-12: Filter at DB level — only fetch payments in the date range
        response = (
            db.table("payments")
            .select("payment_id, payment_date, amount, payment_method, sales(invoice_no, customers(name))")
            .gte("payment_date", start_date)
            .lte("payment_date", end_date)
            .order("payment_date", desc=False)
            .execute()
        )

        payments_data = response.data or []

        # Group by interval
        trends = {}
        payment_methods = {}

        for payment in payments_data:
            date_str = payment.get("payment_date")
            if not date_str:
                continue

            try:
                payment_date = datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                continue

            if interval == "daily":
                key = payment_date.strftime("%Y-%m-%d")
            elif interval == "weekly":
                key = f"{payment_date.strftime('%Y')}-W{payment_date.strftime('%W')}"
            elif interval == "monthly":
                key = payment_date.strftime("%Y-%m")
            else:
                raise HTTPException(status_code=400, detail="Invalid interval. Use daily, weekly, or monthly")

            if key not in trends:
                trends[key] = {
                    "period": key,
                    "payment_count": 0,
                    "total_amount": 0,
                    "payment_methods": {},
                    "payments": [],
                }

            trends[key]["payment_count"] += 1
            trends[key]["total_amount"] += payment.get("amount", 0) or 0

            method = payment.get("payment_method", "Unknown")
            trends[key]["payment_methods"][method] = trends[key]["payment_methods"].get(method, 0) + 1

            payment_methods[method] = payment_methods.get(method, {"count": 0, "amount": 0})
            payment_methods[method]["count"] += 1
            payment_methods[method]["amount"] += payment.get("amount", 0) or 0

            sale = payment.get("sales") or {}
            customer = sale.get("customers") or {}
            trends[key]["payments"].append({
                "payment_id": payment.get("payment_id"),
                "invoice_no": sale.get("invoice_no"),
                "customer_name": customer.get("name"),
                "amount": payment.get("amount", 0),
                "method": method,
                "date": date_str,
            })

        trend_list = sorted(trends.values(), key=lambda x: x["period"])

        total_payments = sum(t["payment_count"] for t in trend_list)
        total_amount = sum(t["total_amount"] for t in trend_list)
        avg_payments_per_period = total_payments / len(trend_list) if trend_list else 0
        avg_amount_per_period = total_amount / len(trend_list) if trend_list else 0

        return {
            "interval": interval,
            "start_date": start_date,
            "end_date": end_date,
            "summary": {
                "total_payments": total_payments,
                "total_amount": total_amount,
                "periods_count": len(trend_list),
                "avg_payments_per_period": round(avg_payments_per_period, 2),
                "avg_amount_per_period": round(avg_amount_per_period, 2),
                "payment_methods": payment_methods,
            },
            "trends": trend_list,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating payment trend: {str(e)}")


@router.get("/sales-order-summary-pdf", dependencies=[Depends(verify_permission("export_reports"))])
def generate_sales_order_summary_pdf(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """
    Generate a PDF report of sales order summary
    """
    try:
        # Default date range (last 30 days)
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")

        # Fetch ALL sales (safer for text date filtering)
        response = (
            db.table("sales")
            .select("*, customers(name, mobile, village), payments(amount)")
            .order("sale_date", desc=True)
            .execute()
        )

        sales_data = response.data or []

        # Prepare data for PDF
        processed_sales = []
        
        # Parse filter dates
        try:
            start_date_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_date_dt = datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError:
             raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

        for sale in sales_data:
            s_date_str = sale.get("sale_date")
            if not s_date_str: continue
            
            try:
                s_date = datetime.strptime(s_date_str, "%Y-%m-%d")
                if not (start_date_dt <= s_date <= end_date_dt):
                    continue
            except ValueError:
                continue

            customer = sale.get("customers", {})
            payments = sale.get("payments", [])
            total_paid = sum(p.get("amount", 0) for p in payments)
            
            processed_sales.append({
                "invoice_no": sale.get("invoice_no", "N/A"),
                "customer_name": customer.get("name", "N/A") if customer else "N/A",
                "customer_mobile": customer.get("mobile", "N/A") if customer else "N/A",
                "customer_village": customer.get("village", "N/A") if customer else "N/A",
                "sale_date": sale.get("sale_date", "N/A"),
                "total_amount": sale.get("total_amount", 0),
                "total_liters": sale.get("total_liters", 0),
                "payment_status": sale.get("payment_status", "Unknown"),
                "total_paid": total_paid,
                "balance": sale.get("total_amount", 0) - total_paid,
                "notes": sale.get("notes", ""),
            })

        # Generate PDF
        pdf_bytes = report_generator.generate_sales_report_pdf(
            processed_sales, start_date, end_date
        )

        # Return as streaming response
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=sales_order_summary_{start_date}_to_{end_date}.pdf"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error generating PDF: {str(e)}"
        )


@router.get("/sales-summary", dependencies=[Depends(verify_permission("view_reports"))])
def sales_summary(
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db)
):
    """FIX-13: Get overall sales summary — select only needed columns, not SELECT *"""
    try:
        response = db.table("sales").select("total_amount, payment_status").execute()
        sales_data = response.data or []

        total_sales = len(sales_data)
        total_amount = sum(sale.get("total_amount", 0) or 0 for sale in sales_data)

        return {
            "total_sales": total_sales,
            "total_amount": total_amount,
            "average_sale": total_amount / total_sales if total_sales > 0 else 0,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error fetching sales summary: {str(e)}"
        )

@router.get("/customers-pdf", dependencies=[Depends(verify_permission("export_reports"))])
def generate_customers_pdf(
    status: Optional[str] = None,
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """Generate Customers Report PDF"""
    try:
        query = db.table("customers").select("*").order("name")
        if status:
            query = query.eq("status", status)
            
        response = query.execute()
        customers = response.data or []

        pdf_bytes = report_generator.generate_customer_report_pdf(customers)

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=customers_report_{datetime.now().strftime('%Y%m%d')}.pdf"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")


@router.get("/invoices-pdf", dependencies=[Depends(verify_permission("export_reports"))])
def generate_invoices_pdf(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """Generate Invoices List PDF (Reuse Sales Report logic for now)"""
    try:
        # Default date range (last 30 days)
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")

        # Fetch ALL sales (safer for text date filtering)
        response = (
            db.table("sales")
            .select("*, customers(name)")
            .order("sale_date", desc=True)
            .execute()
        )
        sales = response.data or []
        
        # Parse filter dates
        try:
            start_date_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_date_dt = datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError:
             raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

        # Format for report generator
        processed_sales = []
        for sale in sales:
             s_date_str = sale.get("sale_date")
             if not s_date_str: continue

             try:
                s_date = datetime.strptime(s_date_str, "%Y-%m-%d")
                if not (start_date_dt <= s_date <= end_date_dt):
                    continue
             except ValueError:
                continue

             processed_sales.append({
                "invoice_no": sale.get("invoice_no"),
                "customer_name": sale.get("customers", {}).get("name") if sale.get("customers") else "N/A",
                "sale_date": sale.get("sale_date"),
                "total_amount": sale.get("total_amount"),
                "total_liters": sale.get("total_liters"),
                "payment_status": sale.get("payment_status"),
             })

        pdf_bytes = report_generator.generate_sales_report_pdf(processed_sales, start_date, end_date)

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=invoices_report_{start_date}_{end_date}.pdf"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")


@router.get("/payments-pdf", dependencies=[Depends(verify_permission("export_reports"))])
def generate_payments_pdf(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """Generate Payments Report PDF"""
    try:
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")

        # Fetch ALL payments (safer for text date filtering)
        response = (
            db.table("payments")
            .select("*, sales(invoice_no)")
            .order("payment_date", desc=True)
            .execute()
        )
        payments = response.data or []
        
        # Parse filter dates
        try:
            start_date_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_date_dt = datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError:
             raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

        # Enrich data and filter
        filtered_payments = []
        for p in payments:
            p_date_str = p.get("payment_date")
            if not p_date_str: continue

            try:
                p_date = datetime.strptime(p_date_str, "%Y-%m-%d")
                if not (start_date_dt <= p_date <= end_date_dt):
                    continue
            except ValueError:
                continue

            if p.get("sales"):
                p["invoice_no"] = p["sales"].get("invoice_no")
            
            filtered_payments.append(p)

        pdf_bytes = report_generator.generate_payment_report_pdf(filtered_payments, start_date, end_date)

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=payments_report_{start_date}_{end_date}.pdf"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")


@router.get("/calling-list-pdf", dependencies=[Depends(verify_permission("export_reports"))])
def generate_calling_list_pdf(
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """Generate Calling List PDF (Master or Assigned)"""
    try:
        # Fetch master calling list from automation logic
        # We need to import the helper function or replicate logic. 
        # Importing from sibling module:
        from routers.automation import get_master_calling_list
        
        master_list = get_master_calling_list(db, inactive_days=30)
        
        # Sort by priority
        master_list.sort(key=lambda x: (0 if x.get("priority") == "High" else 1 if x.get("priority") == "Medium" else 2))

        pdf_bytes = report_generator.generate_calling_list_report_pdf(master_list)

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=calling_list_{datetime.now().strftime('%Y%m%d')}.pdf"
            }
        )
    except Exception as e:
         # Fallback if import fails or other error
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")


# ── Shared helper: run all 4 dimension breakdowns in one call ─────────────────
def _run_all_dimensions(
    db: SupabaseClient,
    start_date: str,
    end_date: str,
    district: Optional[str],
    village: Optional[str],
    product_id: Optional[int],
):
    """Fetch KPI + all 4 dimension rows by calling the analytics functions directly."""
    common = dict(start_date=start_date, end_date=end_date,
                  district=district, village=village, product_id=product_id,
                  user_email="system", db=db)

    kpi = get_analytics_summary(**common)
    dist = get_dimension_breakdown(dimension="district", **common)
    vil = get_dimension_breakdown(dimension="village", **common)
    prod = get_dimension_breakdown(dimension="product", **common)
    cust = get_dimension_breakdown(dimension="customer", **common)

    return kpi, dist["rows"], vil["rows"], prod["rows"], cust["rows"]


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 4 ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/sales-analytics-pdf", dependencies=[Depends(verify_permission("view_reports"))])
def get_sales_analytics_pdf(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    district: Optional[str] = None,
    village: Optional[str] = None,
    product_id: Optional[int] = None,
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """Phase 4: Download Sales Analytics PDF — mirrors exactly what the UI shows."""
    try:
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = datetime.now().replace(day=1).strftime("%Y-%m-%d")

        kpi, dist_rows, vil_rows, prod_rows, cust_rows = _run_all_dimensions(
            db, start_date, end_date, district, village, product_id)

        pdf_bytes = report_generator.generate_sales_analytics_pdf(
            kpi=kpi,
            district_rows=dist_rows,
            village_rows=vil_rows,
            product_rows=prod_rows,
            customer_rows=cust_rows,
            start_date=start_date,
            end_date=end_date,
            district_filter=district,
            village_filter=village,
        )
        fname = f"sales_analytics_{start_date}_{end_date}.pdf"
        return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf",
                                 headers={"Content-Disposition": f"attachment; filename={fname}"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating sales analytics PDF: {str(e)}")


@router.get("/sales-analytics-excel", dependencies=[Depends(verify_permission("view_reports"))])
def get_sales_analytics_excel(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    district: Optional[str] = None,
    village: Optional[str] = None,
    product_id: Optional[int] = None,
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """Phase 4: Download Sales Analytics Excel — KPI + 4 dimension sheets."""
    try:
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = datetime.now().replace(day=1).strftime("%Y-%m-%d")

        kpi, dist_rows, vil_rows, prod_rows, cust_rows = _run_all_dimensions(
            db, start_date, end_date, district, village, product_id)

        excel_bytes = report_generator.generate_sales_analytics_excel(
            kpi=kpi,
            district_rows=dist_rows,
            village_rows=vil_rows,
            product_rows=prod_rows,
            customer_rows=cust_rows,
            start_date=start_date,
            end_date=end_date,
        )
        fname = f"sales_analytics_{start_date}_{end_date}.xlsx"
        return StreamingResponse(
            io.BytesIO(excel_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={fname}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating sales analytics Excel: {str(e)}")


@router.get("/product-report-pdf", dependencies=[Depends(verify_permission("view_reports"))])
def get_product_report_pdf(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    district: Optional[str] = None,
    village: Optional[str] = None,
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """Phase 4: Download Product / Packing breakdown PDF."""
    try:
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = datetime.now().replace(day=1).strftime("%Y-%m-%d")

        from routers.reports import get_dimension_breakdown
        prod_data = get_dimension_breakdown(
            dimension="product", start_date=start_date, end_date=end_date,
            district=district, village=village, product_id=None,
            user_email=user_email, db=db)

        pdf_bytes = report_generator.generate_product_report_pdf(
            product_rows=prod_data["rows"],
            start_date=start_date,
            end_date=end_date,
        )
        fname = f"product_report_{start_date}_{end_date}.pdf"
        return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf",
                                 headers={"Content-Disposition": f"attachment; filename={fname}"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating product PDF: {str(e)}")


@router.get("/product-report-excel", dependencies=[Depends(verify_permission("view_reports"))])
def get_product_report_excel(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    district: Optional[str] = None,
    village: Optional[str] = None,
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """Phase 4: Download Product / Packing breakdown Excel."""
    try:
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = datetime.now().replace(day=1).strftime("%Y-%m-%d")

        from routers.reports import get_dimension_breakdown
        prod_data = get_dimension_breakdown(
            dimension="product", start_date=start_date, end_date=end_date,
            district=district, village=village, product_id=None,
            user_email=user_email, db=db)

        excel_bytes = report_generator.generate_product_report_excel(
            product_rows=prod_data["rows"],
            start_date=start_date,
            end_date=end_date,
        )
        fname = f"product_report_{start_date}_{end_date}.xlsx"
        return StreamingResponse(
            io.BytesIO(excel_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={fname}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating product Excel: {str(e)}")


@router.get("/customer-analytics-pdf", dependencies=[Depends(verify_permission("view_reports"))])
def get_customer_analytics_pdf(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    district: Optional[str] = None,
    village: Optional[str] = None,
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """Phase 4: Download Customer Analytics PDF — ranked by revenue with sales stats."""
    try:
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = datetime.now().replace(day=1).strftime("%Y-%m-%d")

        from routers.reports import get_dimension_breakdown
        cust_data = get_dimension_breakdown(
            dimension="customer", start_date=start_date, end_date=end_date,
            district=district, village=village, product_id=None,
            user_email=user_email, db=db)

        pdf_bytes = report_generator.generate_customer_analytics_pdf(
            customer_rows=cust_data["rows"],
            start_date=start_date,
            end_date=end_date,
            district_filter=district,
            village_filter=village,
        )
        fname = f"customer_analytics_{start_date}_{end_date}.pdf"
        return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf",
                                 headers={"Content-Disposition": f"attachment; filename={fname}"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating customer PDF: {str(e)}")


@router.get("/customer-analytics-excel", dependencies=[Depends(verify_permission("view_reports"))])
def get_customer_analytics_excel(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    district: Optional[str] = None,
    village: Optional[str] = None,
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """Phase 4: Download Customer Analytics Excel."""
    try:
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = datetime.now().replace(day=1).strftime("%Y-%m-%d")

        from routers.reports import get_dimension_breakdown
        cust_data = get_dimension_breakdown(
            dimension="customer", start_date=start_date, end_date=end_date,
            district=district, village=village, product_id=None,
            user_email=user_email, db=db)

        excel_bytes = report_generator.generate_customer_analytics_excel(
            customer_rows=cust_data["rows"],
            start_date=start_date,
            end_date=end_date,
        )
        fname = f"customer_analytics_{start_date}_{end_date}.xlsx"
        return StreamingResponse(
            io.BytesIO(excel_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={fname}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating customer Excel: {str(e)}")

@router.get("/telecaller-dashboard", dependencies=[Depends(verify_permission("view_reports"))])
def get_telecaller_dashboard_route(
    start_date: str,
    end_date: str,
    telecaller_email: Optional[str] = None,
    order_status: Optional[str] = None,
    db: SupabaseClient = Depends(get_db),
):
    try:
        data = get_telecaller_dashboard(db, start_date, end_date, telecaller_email, order_status)
        return data
    except Exception as e:
        print(f"Error generating telecaller dashboard: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating telecaller dashboard: {str(e)}")

@router.get("/telecaller/{report_type}/{format}", dependencies=[Depends(verify_permission("view_reports"))])
def download_telecaller_report(
    report_type: str,
    format: str,
    start_date: str,
    end_date: str,
    telecaller_email: Optional[str] = None,
    order_status: Optional[str] = None,
    db: SupabaseClient = Depends(get_db),
):
    try:
        format = format.lower()
        if format not in ["pdf", "excel"]:
            raise HTTPException(status_code=400, detail="Invalid format. Use 'pdf' or 'excel'.")
            
        filters = []
        if telecaller_email:
            filters.append(f"Telecaller: {telecaller_email}")
        else:
            filters.append("Telecaller: All")
            
        if order_status and order_status != "all":
            filters.append(f"Status: {order_status.title()}")
            
        title = ""
        subtitle = f"Period: {start_date} to {end_date}"
        
        if report_type == "performance":
            headers, rows = prepare_performance_export(db, start_date, end_date, telecaller_email, order_status)
            title = "Telecaller Performance Report"
        elif report_type == "attendance":
            headers, rows = prepare_attendance_export(db, start_date, end_date, telecaller_email, order_status)
            title = "Telecaller Attendance Report"
        elif report_type == "call-logs":
            headers, rows = prepare_call_logs_export(db, start_date, end_date, telecaller_email, order_status)
            title = "Telecaller Call Logs Report"
        elif report_type == "orders":
            headers, rows = prepare_orders_export(db, start_date, end_date, telecaller_email, order_status)
            title = "Telecaller Orders Report"
        else:
            raise HTTPException(status_code=400, detail="Invalid report type.")

        safe_start = start_date.replace("-", "")
        safe_end = end_date.replace("-", "")
        filename_prefix = title.replace(" ", "_")
        
        if format == "pdf":
            pdf_bytes = report_generator.generate_generic_table_pdf(
                title=title,
                subtitle=subtitle,
                headers=headers,
                data_rows=rows,
                metadata_filters=filters
            )
            return StreamingResponse(
                io.BytesIO(pdf_bytes),
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename={filename_prefix}_{safe_start}_to_{safe_end}.pdf"}
            )
        else:
            excel_bytes = report_generator.generate_generic_table_excel(
                sheet_name=title,
                headers=headers,
                data_rows=rows
            )
            return StreamingResponse(
                io.BytesIO(excel_bytes),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename={filename_prefix}_{safe_start}_to_{safe_end}.xlsx"}
            )
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error generating telecaller export: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating telecaller export: {str(e)}")

@router.get("/telecaller/charts", dependencies=[Depends(verify_permission("view_reports"))])
def get_telecaller_charts_api(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    view_by: str = "daily",
    telecaller_email: Optional[str] = None,
    user_email: str = Depends(get_user_email),
    db: SupabaseClient = Depends(get_db),
):
    """Get chart data aggregated by time interval for telecaller reports"""
    try:
        from services.telecaller_reports import get_telecaller_charts
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
            
        return get_telecaller_charts(
            db=db,
            start_date=start_date,
            end_date=end_date,
            view_by=view_by,
            telecaller_email=telecaller_email
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching telecaller charts: {str(e)}")
