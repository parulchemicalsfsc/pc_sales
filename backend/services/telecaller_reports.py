import time
from typing import List, Dict, Any, Optional, Set
from collections import defaultdict
import logging
from supabase_db import SupabaseClient

logger = logging.getLogger(__name__)

VALID_ROLES = {"all", "telecaller", "sales_manager"}

def format_duration_str(seconds: Optional[float]) -> str:
    if not seconds or seconds <= 0:
        return "0s"
    sec = int(round(seconds))
    if sec < 60:
        return f"{sec}s"
    m = sec // 60
    s = sec % 60
    return f"{m}m {s}s" if s > 0 else f"{m}m"

def format_call_duration_hms(seconds: Optional[float]) -> str:
    if not seconds or seconds <= 0:
        return "0s"
    sec = int(round(seconds))
    h = sec // 3600
    m = (sec % 3600) // 60
    s = sec % 60
    if h > 0:
        return f"{h}h {m}m {s}s" if s > 0 else (f"{h}h {m}m" if m > 0 else f"{h}h")
    elif m > 0:
        return f"{m}m {s}s" if s > 0 else f"{m}m"
    else:
        return f"{s}s"

def extract_name_from_email(email: str) -> str:
    if not email:
        return ""
    name_part = email.split("@")[0]
    return name_part.replace(".", " ").replace("_", " ").title()

def calculate_attendance_metrics(
    attendance_records: List[Dict[str, Any]],
    duty_dates: Set[str],
    user_emails: Set[str],
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Pure calculation helper for attendance metrics (no DB operations performed inside).
    Encapsulates all user attendance, total working days, zero-attendance user counts, and overall team attendance %.
    """
    att_dates = {a["attendance_date"] for a in attendance_records if a.get("attendance_date")}
    
    missing_in_duty = att_dates - duty_dates
    missing_in_attendance = duty_dates - att_dates
    
    if missing_in_duty:
        logger.warning(
            f"[ATTENDANCE] Attendance exists without duty sheet for dates: {sorted(missing_in_duty)}"
        )
    if missing_in_attendance:
        logger.warning(
            f"[ATTENDANCE] Duty sheet exists without attendance for dates: {sorted(missing_in_attendance)}"
        )

    effective_duty_dates = duty_dates | att_dates
    total_duty_days = len(effective_duty_dates)
    
    present_dates = defaultdict(set)
    for att in attendance_records:
        email = att.get("user_email")
        date = att.get("attendance_date")
        if (
            email
            and date
            and att.get("is_present")
            and date in effective_duty_dates
        ):
            present_dates[email].add(date)

    user_attendance = {}
    present_users_count = 0
    total_present_days_sum = 0

    for email in user_emails:
        pres = len(present_dates[email])
        total_present_days_sum += pres
        if pres > 0:
            present_users_count += 1
            
        if pres > total_duty_days:
            logger.warning(
                "[ATTENDANCE ANOMALY] User=%s Present=%d Duty=%d Range=%s->%s",
                email,
                pres,
                total_duty_days,
                start_date or "N/A",
                end_date or "N/A",
            )

        absent = max(total_duty_days - pres, 0) if total_duty_days > 0 else 0
        att_pct = round((pres / total_duty_days * 100), 1) if total_duty_days > 0 else 0.0
        
        # Status Tiers
        if att_pct >= 95.0:
            status = "Excellent"
        elif att_pct >= 85.0:
            status = "Good"
        elif att_pct >= 70.0:
            status = "Average"
        else:
            status = "Needs Improvement"

        user_attendance[email] = {
            "present_days": pres,
            "absent_days": absent,
            "total_duty_days": total_duty_days,
            "attendance_pct": att_pct,
            "status": status,
        }

    total_users_count = len(user_emails)
    zero_attendance_users_count = total_users_count - present_users_count
    total_potential = total_duty_days * total_users_count
    overall_attendance_pct = round((total_present_days_sum / total_potential * 100), 1) if total_potential > 0 else 0.0

    return {
        "total_duty_days": total_duty_days,
        "total_users_count": total_users_count,
        "present_users_count": present_users_count,
        "zero_attendance_users_count": zero_attendance_users_count,
        "total_present_days_sum": total_present_days_sum,
        "overall_attendance_pct": overall_attendance_pct,
        "user_attendance": user_attendance,
    }

def get_role_emails(db: SupabaseClient, role: Optional[str]) -> Optional[Set[str]]:
    """
    Validates role parameter and queries app_users table ONCE per request to return a set of emails
    matching the role. Returns None if role is 'all', invalid, or unprovided (no filtering).
    """
    if not role or not isinstance(role, str):
        return None
        
    role_clean = role.strip().lower().replace(" ", "_")
    if role_clean not in VALID_ROLES or role_clean == "all":
        return None

    try:
        res = db.table("app_users").select("email, role").execute()
        users = res.data or []
        allowed_emails = set()
        for u in users:
            email = u.get("email")
            if not email:
                continue
            u_role = (u.get("role") or "").strip().lower().replace(" ", "_")
            if role_clean == "telecaller":
                if u_role == "telecaller" or "telecaller" in u_role or u_role in ["staff", "telecaller1", "telecaller2"]:
                    allowed_emails.add(email)
            elif role_clean == "sales_manager":
                if u_role in ["sales_manager", "salesmanager"] or "sales_manager" in u_role or "sales manager" in (u.get("role") or "").strip().lower():
                    allowed_emails.add(email)
        return allowed_emails
    except Exception as e:
        print(f"Error resolving role emails from app_users: {e}")
        return None

def filter_by_allowed_emails(records: List[Dict[str, Any]], email_key: str, allowed_emails: Optional[Set[str]]) -> List[Dict[str, Any]]:
    """
    Utility helper to filter a list of dictionary records by allowed_emails.
    If allowed_emails is None, returns the original records list (no filtering).
    """
    if allowed_emails is None:
        return records
    return [r for r in records if r.get(email_key) in allowed_emails]

def get_telecaller_dashboard(
    db: SupabaseClient,
    start_date: str,
    end_date: str,
    telecaller_email: Optional[str] = None,
    order_status: Optional[str] = None,
    allowed_emails: Optional[Set[str]] = None,
) -> Dict[str, Any]:
    
    t_start = time.perf_counter()
    q_counts = {"call_logs": 0, "telecaller_orders": 0, "telecaller_attendance": 0, "customers": 0, "app_users": 0, "duty_sheet_log": 0}

    # 1. Fetch Call Logs
    call_logs_query = db.table("call_logs").select("user_email, call_outcome, time_taken, customer_id").gte("called_at", f"{start_date}T00:00:00").lte("called_at", f"{end_date}T23:59:59")
    if telecaller_email:
        call_logs_query = call_logs_query.eq("user_email", telecaller_email)
    q_counts["call_logs"] += 1
    call_logs = call_logs_query.execute().data or []

    # 2. Fetch Attendance
    attendance_query = db.table("telecaller_attendance").select("user_email, attendance_date, is_present").gte("attendance_date", start_date).lte("attendance_date", end_date)
    if telecaller_email:
        attendance_query = attendance_query.eq("user_email", telecaller_email)
    q_counts["telecaller_attendance"] += 1
    attendance = attendance_query.execute().data or []

    # 3. Fetch Orders
    orders_query = db.table("telecaller_orders").select("telecaller_email, status, customer_id, customer_village").gte("created_at", f"{start_date}T00:00:00").lte("created_at", f"{end_date}T23:59:59")
    if telecaller_email:
        orders_query = orders_query.eq("telecaller_email", telecaller_email)
    if order_status:
        orders_query = orders_query.eq("status", order_status)
    q_counts["telecaller_orders"] += 1
    orders = orders_query.execute().data or []

    # Apply role filter using centralized helper
    call_logs = filter_by_allowed_emails(call_logs, "user_email", allowed_emails)
    attendance = filter_by_allowed_emails(attendance, "user_email", allowed_emails)
    orders = filter_by_allowed_emails(orders, "telecaller_email", allowed_emails)

    # 4. Fetch Duty Days
    q_counts["duty_sheet_log"] += 1
    duty_days_data = db.table("duty_sheet_log").select("duty_date").gte("duty_date", start_date).lte("duty_date", end_date).execute().data or []
    duty_dates = {d["duty_date"] for d in duty_days_data if d.get("duty_date")}

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

    # Add emails from attendance & orders to all_telecallers
    for att in attendance:
        email = att.get("user_email")
        if email:
            all_telecallers.add(email)

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

    # Resolve target user_emails set for attendance calculation
    if allowed_emails is not None:
        user_emails = set(allowed_emails)
    elif telecaller_email:
        user_emails = {telecaller_email}
    else:
        reporting_roles = {"telecaller", "staff", "telecaller1", "telecaller2", "sales_manager", "salesmanager"}
        try:
            q_counts["app_users"] += 1
            users_res = db.table("app_users").select("email, role, is_active").execute()
            active_emails = set()
            for u in (users_res.data or []):
                if u.get("is_active", True) is False:
                    continue
                r = (u.get("role") or "").strip().lower().replace(" ", "_")
                if r in reporting_roles or "telecaller" in r or "sales" in r:
                    active_emails.add(u["email"])
            user_emails = active_emails.union(all_telecallers)
        except Exception as e:
            logger.warning(f"Error fetching active reporting users from app_users: {e}")
            user_emails = set(all_telecallers)

    # 5. Calculate Attendance Metrics using pure helper
    att_results = calculate_attendance_metrics(
        attendance_records=attendance,
        duty_dates=duty_dates,
        user_emails=user_emails,
        start_date=start_date,
        end_date=end_date,
    )
    user_attendance = att_results["user_attendance"]

    # -------------------------------------------------------------
    # GEOGRAPHICAL ANALYSIS
    # -------------------------------------------------------------
    customer_ids = {log.get("customer_id") for log in call_logs if log.get("customer_id")}
    customer_ids.update({ord.get("customer_id") for ord in orders if ord.get("customer_id")})
    
    customers_dict = {}
    if customer_ids:
        q_counts["customers"] += 1
        customers_resp = db.table("customers").select("customer_id, district, village").in_("customer_id", list(customer_ids)).execute()
        customers_dict = {c["customer_id"]: c for c in (customers_resp.data or [])}

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
            "orders": calls,
            "revenue": conn,
            "liters": ords,
            "pct": round(conv, 1)
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
    approved_orders = sum(1 for order in orders if (order.get("status") or "").strip().lower() in ("approved", "accepted"))
    rejected_orders = sum(1 for order in orders if (order.get("status") or "").strip().lower() == "rejected")
    unconfirmed_orders = sum(1 for order in orders if (order.get("status") or "").strip().lower() in ("unconfirmed", "pending"))
    
    total_call_seconds = sum(log.get("time_taken") or 0 for log in call_logs)
    total_time_count = sum(tc_time_count.values())
    avg_duration_seconds = round((total_call_seconds / total_time_count) if total_time_count else 0, 1)

    summary = {
        "total_calls": total_calls,
        "connected_calls": total_connected,
        "connected_pct": round((total_connected / total_calls * 100) if total_calls else 0, 1),
        "present_telecallers": att_results["present_users_count"],
        "total_telecallers": att_results["total_users_count"],
        "total_orders": total_orders,
        "approved_orders": approved_orders,
        "rejected_orders": rejected_orders,
        "unconfirmed_orders": unconfirmed_orders,
        "conversion_rate": round((total_orders / total_calls * 100) if total_calls else 0, 1),
        "total_call_seconds": total_call_seconds,
        "total_call_duration": format_call_duration_hms(total_call_seconds),
        "avg_duration_seconds": avg_duration_seconds,
        "avg_duration": format_call_duration_hms(avg_duration_seconds),
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

    # Display users in performance table (union of active user_emails and all_telecallers)
    display_users = user_emails.union(all_telecallers)

    for email in display_users:
        calls = tc_calls[email]
        connected = tc_connected[email]
        ords = tc_orders[email]
        time_sum = tc_time[email]
        time_cnt = tc_time_count[email]
        
        att_info = user_attendance.get(email, {
            "present_days": 0,
            "absent_days": att_results["total_duty_days"],
            "total_duty_days": att_results["total_duty_days"],
            "attendance_pct": 0.0
        })
        
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
            "attendance_pct": att_info["attendance_pct"],
            "avg_duration": round((time_sum / time_cnt) if time_cnt else 0, 1),
            "total_talk_time_seconds": time_sum,
            "total_talk_time": format_call_duration_hms(time_sum),
        })
        
        attendance_list.append({
            "email": email,
            "present_days": att_info["present_days"],
            "absent_days": att_info["absent_days"],
            "total_duty_days": att_info["total_duty_days"],
            "attendance_pct": att_info["attendance_pct"],
            "status": att_info.get("status", "Needs Improvement")
        })
        
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

    t_end = time.perf_counter()
    logger.info(f"[PERF] Total dashboard ....... {t_end - t_start:.2f}s")
    logger.info("[PERF] Database Queries (Dashboard):\n" + "\n".join([f"{k:.<22} {v}" for k, v in q_counts.items()]))

    performance_list.sort(key=lambda x: x["calls"], reverse=True)
    
    response_data = {
        "summary": summary,
        "call_outcomes": call_outcomes_list,
        "performance": performance_list,
        "attendance": sorted(attendance_list, key=lambda x: x["present_days"], reverse=True),
        "attendance_summary_metrics": att_results,
        "orders": sorted(orders_list, key=lambda x: x["total_orders"], reverse=True),
        "district_breakdown": district_breakdown,
        "village_breakdown": village_breakdown
    }
    return response_data

def prepare_performance_export(db: SupabaseClient, start_date: str, end_date: str, telecaller_email: Optional[str] = None, order_status: Optional[str] = None, allowed_emails: Optional[Set[str]] = None, role: Optional[str] = None):
    dashboard_data = get_telecaller_dashboard(db, start_date, end_date, telecaller_email, order_status, allowed_emails=allowed_emails)
    performance = dashboard_data.get("performance", [])
    summary = dashboard_data.get("summary", {})
    
    role_clean = (role or "").strip().lower().replace(" ", "_")
    is_sales_manager = role_clean == "sales_manager"

    if is_sales_manager:
        headers = ["Rank", "Name", "Attendance %", "Total Talk Time"]
        summary_cards = [
            {"label": "Total Calls", "value": str(summary.get("total_calls", 0))},
            {"label": "Connected Calls", "value": str(summary.get("connected_calls", 0)), "subLabel": f"{summary.get('connected_pct', 0)}%"},
            {"label": "Total Call Duration", "value": summary.get("total_call_duration", "0s")},
            {"label": "Average Call Duration", "value": summary.get("avg_duration", "0s")},
            {"label": "Sales Managers Present", "value": str(summary.get("present_telecallers", 0)), "subLabel": f"Out of {summary.get('total_telecallers', 0)} total"},
            {"label": "Orders Generated", "value": str(summary.get("total_orders", 0)), "subLabel": f"{summary.get('conversion_rate', 0)}% Conv."},
            {"label": "Approved Orders", "value": str(summary.get("approved_orders", 0))},
            {"label": "Rejected Orders", "value": str(summary.get("rejected_orders", 0))},
        ]
        rows = []
        for i, row in enumerate(performance):
            rows.append([
                i + 1,
                extract_name_from_email(row.get("email", "")),
                f"{row.get('attendance_pct', 0)}%",
                row.get("total_talk_time", "0s"),
            ])
    else:
        headers = ["Rank", "Name", "Calls", "Connected %", "Orders", "Attendance %", "Avg Duration", "Total Talk Time"]
        summary_cards = [
            {"label": "Total Calls", "value": str(summary.get("total_calls", 0))},
            {"label": "Connected Calls", "value": str(summary.get("connected_calls", 0)), "subLabel": f"{summary.get('connected_pct', 0)}%"},
            {"label": "Total Call Duration", "value": summary.get("total_call_duration", "0s")},
            {"label": "Average Call Duration", "value": summary.get("avg_duration", "0s")},
            {"label": "Present Users", "value": str(summary.get("present_telecallers", 0)), "subLabel": f"Out of {summary.get('total_telecallers', 0)} total"},
            {"label": "Orders Generated", "value": str(summary.get("total_orders", 0)), "subLabel": f"{summary.get('conversion_rate', 0)}% Conv."},
            {"label": "Approved Orders", "value": str(summary.get("approved_orders", 0))},
            {"label": "Rejected Orders", "value": str(summary.get("rejected_orders", 0))},
        ]
        rows = []
        for i, row in enumerate(performance):
            rows.append([
                i + 1,
                extract_name_from_email(row.get("email", "")),
                row.get("calls", 0),
                f"{row.get('connected_pct', 0)}%",
                row.get("orders", 0),
                f"{row.get('attendance_pct', 0)}%",
                format_call_duration_hms(row.get("avg_duration", 0)),
                row.get("total_talk_time", "0s"),
            ])
            
    return headers, rows, summary_cards

def prepare_attendance_export(db: SupabaseClient, start_date: str, end_date: str, telecaller_email: Optional[str] = None, order_status: Optional[str] = None, allowed_emails: Optional[Set[str]] = None, role: Optional[str] = None):
    dashboard_data = get_telecaller_dashboard(db, start_date, end_date, telecaller_email, order_status, allowed_emails=allowed_emails)
    att_summary = dashboard_data.get("attendance_summary_metrics", {})
    attendance_list = dashboard_data.get("attendance", [])

    summary_cards = [
        {"label": "Total Users", "value": str(att_summary.get("total_users_count", 0))},
        {"label": "Present Users", "value": str(att_summary.get("present_users_count", 0))},
        {"label": "Users with Zero Attendance", "value": str(att_summary.get("zero_attendance_users_count", 0))},
        {"label": "Overall Att %", "value": f"{att_summary.get('overall_attendance_pct', 0.0)}%"},
        {"label": "Total Working Days", "value": str(att_summary.get("total_duty_days", 0))},
    ]

    summary_paragraph = (
        f"During the selected reporting period ({start_date} to {end_date}), {att_summary.get('total_duty_days', 0)} official working days "
        f"were recorded. Out of {att_summary.get('total_users_count', 0)} monitored users, {att_summary.get('present_users_count', 0)} registered "
        f"attendance during the period, resulting in an overall attendance rate of {att_summary.get('overall_attendance_pct', 0.0)}%."
    )

    headers = ["Rank", "Name", "Present Days", "Absent Days", "Total Days", "Attendance %", "Status"]
    rows = []
    for i, row in enumerate(attendance_list):
        rows.append([
            i + 1,
            extract_name_from_email(row.get("email", "")),
            row.get("present_days", 0),
            row.get("absent_days", 0),
            row.get("total_duty_days", 0),
            f"{row.get('attendance_pct', 0)}%",
            row.get("status", "Needs Improvement")
        ])

    return headers, rows, summary_cards, summary_paragraph

def prepare_call_logs_export(db: SupabaseClient, start_date: str, end_date: str, telecaller_email: Optional[str] = None, order_status: Optional[str] = None, allowed_emails: Optional[Set[str]] = None, role: Optional[str] = None):
    query = db.table("call_logs").select("called_at, user_email, customer_id, call_outcome, time_taken, notes").gte("called_at", f"{start_date}T00:00:00").lte("called_at", f"{end_date}T23:59:59")
    if telecaller_email:
        query = query.eq("user_email", telecaller_email)
    
    call_logs = query.execute().data or []
    call_logs = filter_by_allowed_emails(call_logs, "user_email", allowed_emails)
    
    # Fetch customers separately to prevent PostgREST relationship errors
    customer_ids = list({log.get("customer_id") for log in call_logs if log.get("customer_id")})
    customers_map = {}
    if customer_ids:
        try:
            cust_res = db.table("customers").select("customer_id, name").in_("customer_id", customer_ids).execute()
            customers_map = {c["customer_id"]: c.get("name") for c in (cust_res.data or []) if c.get("customer_id")}
        except Exception as e:
            logger.warning(f"Failed to fetch customer names for call logs export: {e}")

    headers = ["Date", "Time", "Name", "Customer", "Outcome", "Duration", "Notes"]
    rows = []
    for log in call_logs:
        called_at = log.get("called_at", "")
        dt = called_at.split("T")
        date_part = dt[0] if len(dt) > 0 else ""
        time_part = dt[1][:8] if len(dt) > 1 else ""
        
        cid = log.get("customer_id")
        customer_name = customers_map.get(cid) or cid or "N/A"
        
        rows.append([
            date_part,
            time_part,
            extract_name_from_email(log.get("user_email", "")),
            customer_name,
            log.get("call_outcome", "") or "",
            format_duration_str(log.get("time_taken", 0)),
            log.get("notes", "") or ""
        ])
    return headers, rows, None

def prepare_notes_export(
    db: SupabaseClient,
    start_date: str,
    end_date: str,
    telecaller_email: Optional[str] = None,
    order_status: Optional[str] = None,
    allowed_emails: Optional[Set[str]] = None,
    role: Optional[str] = None,
    district: Optional[str] = None,
    village: Optional[str] = None,
):
    query = db.table("call_logs").select("called_at, user_email, customer_id, call_outcome, notes").gte("called_at", f"{start_date}T00:00:00").lte("called_at", f"{end_date}T23:59:59")
    if telecaller_email and telecaller_email.lower() != "all":
        query = query.eq("user_email", telecaller_email)
    
    call_logs = query.execute().data or []
    
    # 1. Apply role filtering
    call_logs = filter_by_allowed_emails(call_logs, "user_email", allowed_emails)
    
    # 2. Filter empty and whitespace-only notes
    non_empty_logs = []
    for log in call_logs:
        notes = log.get("notes")
        if (notes or "").strip():
            non_empty_logs.append(log)
            
    call_logs = non_empty_logs
    
    # 3. Batch resolve customers
    customer_ids = list({log.get("customer_id") for log in call_logs if log.get("customer_id")})
    customers_map = {}
    if customer_ids:
        try:
            cust_res = db.table("customers").select("customer_id, name, district, village").in_("customer_id", customer_ids).execute()
            customers_map = {c["customer_id"]: c for c in (cust_res.data or []) if c.get("customer_id")}
        except Exception as e:
            logger.warning(f"Failed to fetch customer names for notes export: {e}")
            
    # 4. & 5. Apply district and village filters and build rows
    headers = ["Date", "Customer", "District", "Village", "User", "Call Outcome", "Notes"]
    rows = []
    
    district_filter = district.strip().lower() if district and district.lower() != "all" else None
    village_filter = village.strip().lower() if village and village.lower() != "all" else None
    
    for log in call_logs:
        cid = log.get("customer_id")
        cust = customers_map.get(cid) or {}
        
        c_dist = cust.get("district") or ""
        c_vill = cust.get("village") or ""
        
        if district_filter and c_dist.strip().lower() != district_filter:
            continue
        if village_filter and c_vill.strip().lower() != village_filter:
            continue
            
        called_at = log.get("called_at", "")
        dt = called_at.split("T")
        date_part = dt[0] if len(dt) > 0 else ""
        
        customer_name = cust.get("name") or cid or "N/A"
        
        rows.append([
            date_part,
            customer_name,
            c_dist,
            c_vill,
            extract_name_from_email(log.get("user_email", "")),
            (log.get("call_outcome", "") or "").title().replace("_", " "),
            log.get("notes", "").strip()
        ])
        
    summary_cards = [
        {"label": "Total Notes", "value": str(len(rows))},
        {"label": "District(s)", "value": district if district and district.lower() != "all" else "All"},
        {"label": "Village(s)", "value": village if village and village.lower() != "all" else "All"},
        {"label": "Reporting Period", "value": f"{start_date} to {end_date}"}
    ]
        
    return headers, rows, summary_cards, None

def prepare_orders_export(
    db: SupabaseClient,
    start_date: str,
    end_date: str,
    telecaller_email: Optional[str] = None,
    order_status: Optional[str] = None,
    allowed_emails: Optional[Set[str]] = None,
    role: Optional[str] = None,
    single_user: bool = False,
):
    query = db.table("telecaller_orders").select("*").gte("created_at", f"{start_date}T00:00:00").lte("created_at", f"{end_date}T23:59:59")
    if telecaller_email and telecaller_email.lower() != "all":
        query = query.eq("telecaller_email", telecaller_email)
    if order_status and order_status.lower() != "all":
        query = query.eq("status", order_status)
    
    orders = query.execute().data or []
    orders = filter_by_allowed_emails(orders, "telecaller_email", allowed_emails)
    
    # Batch resolve customer details
    customer_ids = list({ord.get("customer_id") for ord in orders if ord.get("customer_id")})
    customers_map = {}
    if customer_ids:
        try:
            cust_res = db.table("customers").select("customer_id, name, village").in_("customer_id", customer_ids).execute()
            customers_map = {c["customer_id"]: c for c in (cust_res.data or []) if c.get("customer_id")}
        except Exception as e:
            logger.warning(f"Failed to fetch customer details for orders export: {e}")

    # Batch resolve user display names once
    users_map = {}
    try:
        users_res = db.table("app_users").select("email, name").execute()
        users_map = {u["email"]: u.get("name") for u in (users_res.data or []) if u.get("email")}
    except Exception as e:
        logger.warning(f"Failed to fetch app_users for orders export: {e}")

    approved_cnt = sum(1 for o in orders if (o.get("status") or "").strip().lower() in ("approved", "accepted"))
    rejected_cnt = sum(1 for o in orders if (o.get("status") or "").strip().lower() == "rejected")
    unconfirmed_cnt = len(orders) - (approved_cnt + rejected_cnt)

    summary_cards = [
        {"label": "Total Orders", "value": str(len(orders))},
        {"label": "Approved Orders", "value": str(approved_cnt)},
        {"label": "Rejected Orders", "value": str(rejected_cnt)},
        {"label": "Unconfirmed Orders", "value": str(unconfirmed_cnt)},
    ]

    if single_user:
        headers = ["Date", "Customer", "Village", "Status", "Total Items", "Products", "Notes"]
    else:
        headers = ["Date", "Name", "Customer", "Village", "Status", "Total Items", "Products", "Notes"]

    rows = []
    import json
    for order in orders:
        dt = order.get("created_at", "").split("T")
        created_date = dt[0] if len(dt) > 0 else ""
        
        email = order.get("telecaller_email", "")
        user_name = users_map.get(email) or extract_name_from_email(email) or email
        
        cid = order.get("customer_id")
        cust_info = customers_map.get(cid, {}) if cid else {}
        customer_name = order.get("customer_name") or cust_info.get("name") or cid or "N/A"
        customer_village = order.get("customer_village") or cust_info.get("village") or "N/A"
        
        products_raw = order.get("products_json") or "[]"
        total_items = 0
        try:
            products_list = json.loads(products_raw) if isinstance(products_raw, str) else products_raw
            formatted_prods = []
            if isinstance(products_list, list):
                for p in products_list:
                    qty = p.get("quantity", 1)
                    total_items += qty
                    formatted_prods.append(f"{p.get('name', 'Item')} (x{qty})")
                products_str = ", ".join(formatted_prods)
            else:
                products_str = str(products_raw)
        except Exception:
            products_str = str(products_raw)

        if single_user:
            rows.append([
                created_date,
                customer_name,
                customer_village,
                (order.get("status") or "").upper(),
                total_items,
                products_str,
                order.get("notes", "") or ""
            ])
        else:
            rows.append([
                created_date,
                user_name,
                customer_name,
                customer_village,
                (order.get("status") or "").upper(),
                total_items,
                products_str,
                order.get("notes", "") or ""
            ])

    return headers, rows, summary_cards
    
def prepare_selected_user_orders_export(db: SupabaseClient, start_date: str, end_date: str, telecaller_email: Optional[str] = None, order_status: Optional[str] = None, allowed_emails: Optional[Set[str]] = None, role: Optional[str] = None):
    return prepare_orders_export(db, start_date, end_date, telecaller_email, order_status, allowed_emails=allowed_emails, role=role, single_user=True)


def build_python_telecaller_charts(
    db: SupabaseClient,
    start_date: str,
    end_date: str,
    view_by: str = 'daily',
    telecaller_email: Optional[str] = None,
    allowed_emails: Optional[Set[str]] = None
) -> Dict[str, Any]:
    """Fallback and role-filtered calculation for telecaller charts."""
    t_start = time.perf_counter()
    q_counts = {"call_logs": 0, "telecaller_orders": 0, "customers": 0, "app_users": 0}

    cl_query = db.table("call_logs").select("log_id, user_email, customer_id, call_outcome, time_taken, called_at").gte("called_at", f"{start_date}T00:00:00").lte("called_at", f"{end_date}T23:59:59")
    if telecaller_email:
        cl_query = cl_query.eq("user_email", telecaller_email)
    q_counts["call_logs"] += 1
    call_logs = cl_query.execute().data or []
    call_logs = filter_by_allowed_emails(call_logs, "user_email", allowed_emails)

    ord_query = db.table("telecaller_orders").select("telecaller_email, created_at").gte("created_at", f"{start_date}T00:00:00").lte("created_at", f"{end_date}T23:59:59")
    if telecaller_email:
        ord_query = ord_query.eq("telecaller_email", telecaller_email)
    q_counts["telecaller_orders"] += 1
    orders = ord_query.execute().data or []
    orders = filter_by_allowed_emails(orders, "telecaller_email", allowed_emails)

    def get_period_key(dt_str: str) -> str:
        if not dt_str:
            return ""
        date_part = dt_str.split("T")[0]
        try:
            from datetime import datetime
            dt = datetime.strptime(date_part, "%Y-%m-%d")
            if view_by == "weekly":
                return f"{dt.strftime('%Y')}-W{dt.strftime('%W')}"
            elif view_by == "monthly":
                return dt.strftime("%Y-%m")
            return date_part
        except Exception:
            return date_part

    calls_by_period = defaultdict(int)
    outcomes_by_period = defaultdict(lambda: {"connected": 0, "callback": 0, "not_reachable": 0, "wrong_number": 0})
    for log in call_logs:
        period = get_period_key(log.get("called_at", ""))
        if not period:
            continue
        calls_by_period[period] += 1
        
        outcome = (log.get("call_outcome") or "").lower()
        if "connect" in outcome:
            outcomes_by_period[period]["connected"] += 1
        elif "callback" in outcome:
            outcomes_by_period[period]["callback"] += 1
        elif "reach" in outcome:
            outcomes_by_period[period]["not_reachable"] += 1
        elif "wrong" in outcome:
            outcomes_by_period[period]["wrong_number"] += 1

    orders_by_period = defaultdict(int)
    orders_by_tc = defaultdict(int)
    for ord_row in orders:
        period = get_period_key(ord_row.get("created_at", ""))
        if period:
            orders_by_period[period] += 1
        tc = ord_row.get("telecaller_email")
        if tc:
            orders_by_tc[tc] += 1

    all_periods = sorted(set(calls_by_period.keys()).union(orders_by_period.keys()).union(outcomes_by_period.keys()))

    calls_trend = [{"period": p, "calls": calls_by_period[p]} for p in all_periods]
    orders_trend = [{"period": p, "orders": orders_by_period[p]} for p in all_periods]
    outcomes_trend = [
        {
            "period": p,
            "connected": outcomes_by_period[p]["connected"],
            "callback": outcomes_by_period[p]["callback"],
            "not_reachable": outcomes_by_period[p]["not_reachable"],
            "wrong_number": outcomes_by_period[p]["wrong_number"],
        }
        for p in all_periods
    ]

    top_telecallers = [
        {"telecaller_email": tc, "orders_generated": cnt}
        for tc, cnt in sorted(orders_by_tc.items(), key=lambda x: x[1], reverse=True)[:10]
    ]

    valid_logs = [log for log in call_logs if log.get("time_taken") is not None]
    top_5_raw = sorted(valid_logs, key=lambda x: x.get("time_taken") or 0, reverse=True)[:5]

    cust_ids = list({log.get("customer_id") for log in top_5_raw if log.get("customer_id")})
    cust_map = {}
    if cust_ids:
        try:
            q_counts["customers"] += 1
            cust_res = db.table("customers").select("customer_id, name").in_("customer_id", cust_ids).execute()
            cust_map = {c["customer_id"]: c.get("name") for c in (cust_res.data or []) if c.get("customer_id")}
        except Exception as e:
            logger.warning(f"Error fetching customer names for longest calls chart: {e}")

    user_emails_set = list({log.get("user_email") for log in top_5_raw if log.get("user_email")})
    users_map = {}
    if user_emails_set:
        try:
            q_counts["app_users"] += 1
            users_res = db.table("app_users").select("email, name").in_("email", user_emails_set).execute()
            users_map = {u["email"]: u.get("name") for u in (users_res.data or []) if u.get("email")}
        except Exception as e:
            logger.warning(f"Error fetching user names for longest calls chart: {e}")

    longest_calls = []
    for rank, log in enumerate(top_5_raw, 1):
        email = log.get("user_email", "")
        dur = log.get("time_taken") or 0
        cid = log.get("customer_id")
        
        display_name = users_map.get(email) or extract_name_from_email(email) or email
        customer_name = cust_map.get(cid) or cid or "N/A"
        
        longest_calls.append({
            "rank": rank,
            "log_id": log.get("log_id"),
            "customer_id": cid,
            "user_email": email,
            "user_name": display_name,
            "customer_name": customer_name,
            "call_outcome": (log.get("call_outcome") or "Unknown").title().replace("_", " "),
            "duration_seconds": dur,
            "duration": format_call_duration_hms(dur),
            "called_at": log.get("called_at")
        })

    t_end = time.perf_counter()
    logger.info(f"[PERF] Total charts ....... {t_end - t_start:.2f}s")
    logger.info("[PERF] Database Queries (Charts):\n" + "\n".join([f"{k:.<22} {v}" for k, v in q_counts.items()]))

    return {
        "calls_trend": calls_trend,
        "orders_trend": orders_trend,
        "outcomes_trend": outcomes_trend,
        "top_telecallers": top_telecallers,
        "longest_calls": longest_calls,
    }

def get_telecaller_charts(
    db: SupabaseClient,
    start_date: str,
    end_date: str,
    view_by: str = 'daily',
    telecaller_email: Optional[str] = None,
    allowed_emails: Optional[Set[str]] = None
) -> Dict[str, Any]:
    """
    Fetch aggregated charts data. Uses Python aggregation when role/allowed_emails filtering is active,
    or falls back to RPC if allowed_emails is None.
    """
    if allowed_emails is not None:
        return build_python_telecaller_charts(db, start_date, end_date, view_by, telecaller_email, allowed_emails)

    params = {
        "p_start_date": start_date,
        "p_end_date": end_date,
        "p_view_by": view_by
    }
    if telecaller_email:
        params["p_telecaller_email"] = telecaller_email
        
    try:
        result = db.rpc('get_telecaller_charts_data', params)
        if isinstance(result, list) and len(result) > 0:
            result = result[0]
            
        python_charts = build_python_telecaller_charts(db, start_date, end_date, view_by, telecaller_email, allowed_emails)
        
        parsed_result = {
            "calls_trend": result.get("calls_trend") if isinstance(result, dict) else [],
            "orders_trend": result.get("orders_trend") if isinstance(result, dict) else [],
            "outcomes_trend": result.get("outcomes_trend") if isinstance(result, dict) else [],
            "top_telecallers": result.get("top_telecallers") if isinstance(result, dict) else [],
            "longest_calls": python_charts.get("longest_calls", [])
        }
        return parsed_result
    except Exception as e:
        print(f"Error fetching telecaller charts RPC data, falling back to Python aggregation: {str(e)}")
        return build_python_telecaller_charts(db, start_date, end_date, view_by, telecaller_email, allowed_emails)
