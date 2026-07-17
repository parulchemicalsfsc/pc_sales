from typing import List, Dict, Any, Optional
from collections import defaultdict
from supabase_db import SupabaseClient

def get_telecaller_dashboard(
    db: SupabaseClient,
    start_date: str,
    end_date: str,
    telecaller_email: Optional[str] = None,
    order_status: Optional[str] = None
) -> Dict[str, Any]:
    
    # 1. Fetch Call Logs
    call_logs_query = db.table("call_logs").select("user_email, call_outcome, time_taken, customer_id").gte("called_at", f"{start_date}T00:00:00").lte("called_at", f"{end_date}T23:59:59")
    if telecaller_email:
        call_logs_query = call_logs_query.eq("user_email", telecaller_email)
    call_logs = call_logs_query.execute().data or []

    # 2. Fetch Attendance
    attendance_query = db.table("telecaller_attendance").select("user_email, is_present").gte("attendance_date", start_date).lte("attendance_date", end_date)
    if telecaller_email:
        attendance_query = attendance_query.eq("user_email", telecaller_email)
    attendance = attendance_query.execute().data or []

    # 3. Fetch Orders
    orders_query = db.table("telecaller_orders").select("telecaller_email, status, customer_id, customer_village").gte("created_at", f"{start_date}T00:00:00").lte("created_at", f"{end_date}T23:59:59")
    if telecaller_email:
        orders_query = orders_query.eq("telecaller_email", telecaller_email)
    if order_status:
        orders_query = orders_query.eq("status", order_status)
    orders = orders_query.execute().data or []

    # 4. Fetch Duty Days
    duty_days = db.table("duty_sheet_log").select("duty_date").gte("duty_date", start_date).lte("duty_date", end_date).execute().data or []
    total_duty_days = max(len(duty_days), 1)  # Prevent div by 0

    # Initialize aggregations
    all_telecallers = set()
    
    # Call stats per telecaller
    tc_calls = defaultdict(int)
    tc_connected = defaultdict(int)
    tc_callback = defaultdict(int)
    tc_not_reachable = defaultdict(int)
    tc_wrong_number = defaultdict(int)
    tc_time = defaultdict(int)
    tc_time_count = defaultdict(int)
    outcome_counts = defaultdict(int)
    total_calls = len(call_logs)

    for log in call_logs:
        email = log.get("user_email")
        if not email:
            continue
        all_telecallers.add(email)
        tc_calls[email] += 1
        
        outcome = log.get("call_outcome") or "Unknown"
        outcome_counts[outcome] += 1
        
        outcome_lower = outcome.lower()
        if "connect" in outcome_lower:
            tc_connected[email] += 1
        elif "callback" in outcome_lower:
            tc_callback[email] += 1
        elif "reach" in outcome_lower:
            tc_not_reachable[email] += 1
        elif "wrong" in outcome_lower:
            tc_wrong_number[email] += 1
            
        time_taken = log.get("time_taken")
        if time_taken is not None:
            tc_time[email] += time_taken
            tc_time_count[email] += 1

    # Attendance stats per telecaller
    tc_present = defaultdict(int)
    tc_absent = defaultdict(int)
    for att in attendance:
        email = att.get("user_email")
        if not email:
            continue
        all_telecallers.add(email)
        if att.get("is_present"):
            tc_present[email] += 1
        else:
            tc_absent[email] += 1

    # Order stats per telecaller
    tc_orders = defaultdict(int)
    tc_orders_approved = defaultdict(int)
    tc_orders_pending = defaultdict(int)
    tc_orders_rejected = defaultdict(int)
    for ord in orders:
        email = ord.get("telecaller_email")
        if not email:
            continue
        all_telecallers.add(email)
        tc_orders[email] += 1
        status = (ord.get("status") or "").lower()
        if status == "approved":
            tc_orders_approved[email] += 1
        elif status == "rejected":
            tc_orders_rejected[email] += 1
        else:
            tc_orders_pending[email] += 1

    # -------------------------------------------------------------
    # GEOGRAPHICAL ANALYSIS
    # -------------------------------------------------------------
    customer_ids = {log.get("customer_id") for log in call_logs if log.get("customer_id")}
    customer_ids.update({ord.get("customer_id") for ord in orders if ord.get("customer_id")})
    
    customers_dict = {}
    if customer_ids:
        customers_resp = db.table("customers").select("customer_id, district, village").in_("customer_id", list(customer_ids)).execute()
        customers_dict = {c["customer_id"]: c for c in (customers_resp.data or [])}

    print("--- GEOGRAPHICAL ANALYSIS DEBUG ---")
    print(f"Total call_logs fetched: {len(call_logs)}")
    print(f"Total telecaller_orders fetched: {len(orders)}")
    print(f"Number of unique customer_ids extracted: {len(customer_ids)}")
    print(f"Number of customer records successfully matched: {len(customers_dict)}")

    dist_stats = defaultdict(lambda: {"calls": 0, "connected": 0, "orders": 0})
    vill_stats = defaultdict(lambda: {"calls": 0, "connected": 0, "orders": 0, "district": ""})

    for log in call_logs:
        cid = log.get("customer_id")
        cust = customers_dict.get(cid, {}) if cid else {}
        dist = cust.get("district") or "Not Available"
        vill = cust.get("village") or "Not Available"
        
        dist_stats[dist]["calls"] += 1
        vill_stats[vill]["calls"] += 1
        if not vill_stats[vill]["district"] or vill_stats[vill]["district"] == "Not Available":
            vill_stats[vill]["district"] = dist
            
        outcome_lower = (log.get("call_outcome") or "").lower()
        if "connect" in outcome_lower:
            dist_stats[dist]["connected"] += 1
            vill_stats[vill]["connected"] += 1

    for ord in orders:
        cid = ord.get("customer_id")
        cust = customers_dict.get(cid, {}) if cid else {}
        
        # Fallback to customer_village if missing customer_id
        if not cid and ord.get("customer_village"):
            vill = ord.get("customer_village")
            dist = "Not Available"
        else:
            dist = cust.get("district") or "Not Available"
            vill = cust.get("village") or "Not Available"
            
        dist_stats[dist]["orders"] += 1
        vill_stats[vill]["orders"] += 1
        if not vill_stats[vill]["district"] or vill_stats[vill]["district"] == "Not Available":
            vill_stats[vill]["district"] = dist

    district_breakdown = []
    for rank, (dist, stats) in enumerate(sorted(dist_stats.items(), key=lambda x: x[1]["calls"], reverse=True), 1):
        calls = stats["calls"]
        conn = stats["connected"]
        ords = stats["orders"]
        conv = (ords / conn * 100) if conn else 0
        district_breakdown.append({
            "rank": rank,
            "label": dist,
            "orders": calls,           # Frontend expects DimensionRow format (calls -> orders)
            "revenue": conn,           # connected -> revenue
            "liters": ords,            # orders -> liters
            "pct": round(conv, 1)      # conversion pct -> pct
        })

    village_breakdown = []
    for rank, (vill, stats) in enumerate(sorted(vill_stats.items(), key=lambda x: x[1]["calls"], reverse=True), 1):
        calls = stats["calls"]
        conn = stats["connected"]
        ords = stats["orders"]
        conv = (ords / conn * 100) if conn else 0
        village_breakdown.append({
            "rank": rank,
            "label": vill,
            "secondary_label": stats["district"],
            "orders": calls,
            "revenue": conn,
            "liters": ords,
            "pct": round(conv, 1)
        })

    # Build KPI Summary
    total_connected = sum(tc_connected.values())
    total_orders = len(orders)
    total_time = sum(tc_time.values())
    total_time_count = sum(tc_time_count.values())
    
    present_today_count = 0 # Approximated as total unique telecallers present during this period if looking at 1 day. Let's just sum unique present telecallers.
    # Actually, the user asked for "Present / Total" -> "14/17". This usually implies "today" or "avg per day".
    # Since we are aggregating over a date range, "Present Telecallers" can be the average per day, or unique telecallers who were present at least once.
    # We will use sum of all present records / total duty days. Or we can just count telecallers who have >0 present days if period is large.
    # Let's count unique telecallers present in this period.
    present_telecallers = sum(1 for v in tc_present.values() if v > 0)
    total_telecallers_count = len(all_telecallers)

    summary = {
        "total_calls": total_calls,
        "connected_calls": total_connected,
        "connected_pct": round((total_connected / total_calls * 100) if total_calls else 0, 1),
        "present_telecallers": present_telecallers,
        "total_telecallers": total_telecallers_count,
        "total_orders": total_orders,
        "conversion_rate": round((total_orders / total_calls * 100) if total_calls else 0, 1),
        "avg_duration": round((total_time / total_time_count) if total_time_count else 0, 1)
    }

    # Build Call Outcomes
    call_outcomes_list = []
    for outcome, count in sorted(outcome_counts.items(), key=lambda x: x[1], reverse=True):
        call_outcomes_list.append({
            "outcome": outcome,
            "count": count,
            "percentage": round((count / total_calls * 100) if total_calls else 0, 1)
        })

    # Build Tables
    performance_list = []
    attendance_list = []
    orders_list = []

    for email in all_telecallers:
        calls = tc_calls[email]
        connected = tc_connected[email]
        ords = tc_orders[email]
        time_sum = tc_time[email]
        time_cnt = tc_time_count[email]
        pres = tc_present[email]
        
        # Performance
        performance_list.append({
            "email": email,
            "calls": calls,
            "connected_calls": connected,
            "connected_pct": round((connected / calls * 100) if calls else 0, 1),
            "callback": tc_callback[email],
            "not_reachable": tc_not_reachable[email],
            "wrong_number": tc_wrong_number[email],
            "orders": ords,
            "conversion_pct": round((ords / connected * 100) if connected > 0 else 0, 1),
            "attendance_pct": round((pres / total_duty_days * 100), 1),
            "avg_duration": round((time_sum / time_cnt) if time_cnt else 0, 1)
        })
        
        # Attendance
        attendance_list.append({
            "email": email,
            "present_days": pres,
            "attendance_pct": round((pres / total_duty_days * 100), 1)
        })
        
        # Orders
        appr = tc_orders_approved[email]
        pend = tc_orders_pending[email]
        rej = tc_orders_rejected[email]
        orders_list.append({
            "email": email,
            "total_orders": ords,
            "approved": appr,
            "pending": pend,
            "rejected": rej,
            "approval_rate": round((appr / ords * 100) if ords else 0, 1)
        })

    # Sort Performance by Total Calls DESC
    performance_list.sort(key=lambda x: x["calls"], reverse=True)
    
    response_data = {
        "summary": summary,
        "call_outcomes": call_outcomes_list,
        "performance": performance_list,
        "attendance": sorted(attendance_list, key=lambda x: x["present_days"], reverse=True),
        "orders": sorted(orders_list, key=lambda x: x["total_orders"], reverse=True),
        "district_breakdown": district_breakdown,
        "village_breakdown": village_breakdown
    }
    print("--- GEOGRAPHICAL BREAKDOWN OUTPUT ---")
    print(f"District records: {len(district_breakdown)}")
    print(f"Village records: {len(village_breakdown)}")
    
    return response_data

def prepare_performance_export(db: SupabaseClient, start_date: str, end_date: str, telecaller_email: Optional[str] = None, order_status: Optional[str] = None):
    dashboard_data = get_telecaller_dashboard(db, start_date, end_date, telecaller_email, order_status)
    performance = dashboard_data.get("performance", [])
    
    headers = ["Rank", "Telecaller", "Calls", "Connected %", "Orders", "Attendance %", "Avg Duration (s)"]
    rows = []
    for i, row in enumerate(performance):
        rows.append([
            i + 1,
            row.get("email", ""),
            row.get("calls", 0),
            f"{row.get('connected_pct', 0)}%",
            row.get("orders", 0),
            f"{row.get('attendance_pct', 0)}%",
            row.get("avg_duration", 0)
        ])
    return headers, rows

def prepare_attendance_export(db: SupabaseClient, start_date: str, end_date: str, telecaller_email: Optional[str] = None, order_status: Optional[str] = None):
    dashboard_data = get_telecaller_dashboard(db, start_date, end_date, telecaller_email, order_status)
    attendance = dashboard_data.get("attendance", [])
    
    # We also need the total duty days for this period to calculate absent days accurately
    duty_days = db.table("duty_sheet_log").select("duty_date").gte("duty_date", start_date).lte("duty_date", end_date).execute().data or []
    total_duty_days = max(len(duty_days), 1)

    headers = ["Telecaller", "Present Days", "Absent Days", "Attendance %"]
    rows = []
    for row in attendance:
        present = row.get("present_days", 0)
        absent = total_duty_days - present if len(duty_days) > 0 else 0
        rows.append([
            row.get("email", ""),
            present,
            absent,
            f"{row.get('attendance_pct', 0)}%"
        ])
    return headers, rows

def prepare_call_logs_export(db: SupabaseClient, start_date: str, end_date: str, telecaller_email: Optional[str] = None, order_status: Optional[str] = None):
    query = db.table("call_logs").select("called_at, user_email, customer_id, call_outcome, time_taken, notes, customer:customers(name)").gte("called_at", f"{start_date}T00:00:00").lte("called_at", f"{end_date}T23:59:59")
    if telecaller_email:
        query = query.eq("user_email", telecaller_email)
    
    # Fetch paginated to avoid limits if data is huge, but usually export limits to what's fetched
    call_logs = query.execute().data or []
    
    headers = ["Date", "Time", "Telecaller", "Customer", "Outcome", "Duration (s)", "Notes"]
    rows = []
    for log in call_logs:
        called_at = log.get("called_at", "")
        dt = called_at.split("T")
        date_part = dt[0] if len(dt) > 0 else ""
        time_part = dt[1][:8] if len(dt) > 1 else ""
        
        customer_info = log.get("customer") or {}
        customer_name = customer_info.get("name") if isinstance(customer_info, dict) else str(customer_info)
        
        rows.append([
            date_part,
            time_part,
            log.get("user_email", ""),
            customer_name or log.get("customer_id", ""),
            log.get("call_outcome", ""),
            log.get("time_taken", 0),
            log.get("notes", "") or ""
        ])
    return headers, rows

def prepare_orders_export(db: SupabaseClient, start_date: str, end_date: str, telecaller_email: Optional[str] = None, order_status: Optional[str] = None):
    query = db.table("telecaller_orders").select("*").gte("created_at", f"{start_date}T00:00:00").lte("created_at", f"{end_date}T23:59:59")
    if telecaller_email:
        query = query.eq("telecaller_email", telecaller_email)
    if order_status:
        query = query.eq("status", order_status)
    
    orders = query.execute().data or []
    
    headers = ["Telecaller", "Customer", "Status", "Created Date", "Confirmation Date", "Products", "Notes"]
    rows = []
    
    import json
    for order in orders:
        dt = order.get("created_at", "").split("T")
        created_date = dt[0] if len(dt) > 0 else ""
        
        products_raw = order.get("products_json") or "[]"
        try:
            products_list = json.loads(products_raw) if isinstance(products_raw, str) else products_raw
            products_str = ", ".join([f"{p.get('name', 'Item')} (x{p.get('quantity', 1)})" for p in products_list])
        except:
            products_str = str(products_raw)
            
        rows.append([
            order.get("telecaller_email", ""),
            order.get("customer_name", ""),
            (order.get("status") or "").upper(),
            created_date,
            order.get("confirmation_date", ""),
            products_str,
            order.get("notes", "") or ""
        ])
    return headers, rows

def get_telecaller_charts(db: SupabaseClient, start_date: str, end_date: str, view_by: str = 'daily', telecaller_email: Optional[str] = None) -> Dict[str, Any]:
    """
    Fetch aggregated charts data from the dedicated RPC.
    """
    params = {
        "p_start_date": start_date,
        "p_end_date": end_date,
        "p_view_by": view_by
    }
    if telecaller_email:
        params["p_telecaller_email"] = telecaller_email
        
    try:
        print(f"DEBUG: Executing RPC get_telecaller_charts_data with params: {params}")
        result = db.rpc('get_telecaller_charts_data', params)
        print(f"DEBUG: Raw RPC result type: {type(result)}")
        print(f"DEBUG: Raw RPC result: {result}")
        
        # PostgREST sometimes returns a list of objects or a single value for JSONB RPCs
        if isinstance(result, list) and len(result) > 0:
            result = result[0]
            print(f"DEBUG: Extracted first element from list: {result}")
            
        # Ensure fallback lists if null
        parsed_result = {
            "calls_trend": result.get("calls_trend") if isinstance(result, dict) else [],
            "orders_trend": result.get("orders_trend") if isinstance(result, dict) else [],
            "outcomes_trend": result.get("outcomes_trend") if isinstance(result, dict) else [],
            "top_telecallers": result.get("top_telecallers") if isinstance(result, dict) else []
        }
        print(f"DEBUG: Final parsed charts data: {parsed_result}")
        return parsed_result
    except Exception as e:
        import traceback
        print(f"Error fetching telecaller charts data: {str(e)}")
        traceback.print_exc()
        # Return empty structure on failure
        return {
            "calls_trend": [],
            "orders_trend": [],
            "outcomes_trend": [],
            "top_telecallers": []
        }

