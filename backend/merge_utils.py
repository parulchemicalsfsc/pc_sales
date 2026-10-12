from typing import List, Dict, Optional, Tuple
from datetime import datetime, date
from clean_excel_distributors import normalize_redemo_village


def generate_group_key(row: dict) -> str:
    village = row.get("village") or ""
    meta = normalize_redemo_village(village)
    clean_v = meta.get("clean_village", "")
    
    name = str(row.get("mantri_name") or row.get("name") or "").strip().upper()
    mobile = str(row.get("mantri_mobile") or row.get("mobile") or "").strip()
    
    return f"{clean_v}_{name}_{mobile}"


def parse_redemo_status(row: dict) -> Optional[bool]:
    """
    Evaluates REDEMO status of a record.
    Returns:
        True  for REDEMO == YES
        False for REDEMO == NO
        None  for null, missing, or unknown values
    """
    val = row.get("is_redemo")
    if val is None and "redemo" in row:
        val = row.get("redemo")
        
    if val is True:
        return True
    if val is False:
        return False
    if val is None:
        return None
        
    if isinstance(val, str):
        v = val.strip().upper()
        if v in ("YES", "TRUE", "Y", "1"):
            return True
        if v in ("NO", "FALSE", "N", "0"):
            return False
        return None
        
    if isinstance(val, (int, float)):
        if val == 1:
            return True
        if val == 0:
            return False
            
    return None


def parse_iso_or_date(val) -> Optional[datetime]:
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, date):
        return datetime.combine(val, datetime.min.time())
    s = str(val).strip()
    if not s or s.lower() in ("null", "none", "n/a", "na", "-", ""):
        return None
    try:
        clean_s = s.replace("Z", "+00:00")
        return datetime.fromisoformat(clean_s)
    except Exception:
        pass
    for fmt in (
        "%Y-%m-%d",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%m/%d/%Y",
    ):
        try:
            return datetime.strptime(s, fmt)
        except Exception:
            pass
    return None


def get_record_datetime(row: dict) -> Tuple[Optional[datetime], str]:
    """
    Returns (datetime, field_name).
    Prioritizes record_date (the actual business event date),
    falling back to created_at (database creation timestamp).
    """
    rd = parse_iso_or_date(row.get("record_date"))
    if rd:
        return rd, "record_date"
    ca = parse_iso_or_date(row.get("created_at"))
    if ca:
        return ca, "created_at"
    return None, ""


def newest_record_sort_key(row: dict):
    """
    Key for deterministic sorting of records from newest to oldest.
    Used for tie-breaking in Case B (multiple NO records) and Case D (all null).
    """
    dt, _ = get_record_datetime(row)
    has_date = 1 if dt is not None else 0
    ts = dt.timestamp() if dt is not None else float("-inf")
    did = row.get("distributor_id")
    has_id = 1 if isinstance(did, (int, float)) else 0
    id_val = int(did) if has_id else 0
    return (has_date, ts, has_id, id_val)


def oldest_record_sort_key(row: dict):
    """
    Key for deterministic sorting of records from oldest to newest.
    Used for Case C (all YES records).
    Prefers records with valid timestamps, earliest timestamp first.
    Tie-breaker: lowest distributor_id (earlier created row in DB).
    """
    dt, _ = get_record_datetime(row)
    has_date = 1 if dt is not None else 0
    ts = dt.timestamp() if dt is not None else float("inf")
    did = row.get("distributor_id")
    has_id = 1 if isinstance(did, (int, float)) else 0
    id_val = int(did) if has_id else float("inf")
    return (0 if has_date else 1, ts, 0 if has_id else 1, id_val)


def resolve_distributors(rows: List[dict]) -> List[dict]:
    # 1. Group rows
    groups: Dict[str, List[dict]] = {}
    for row in rows:
        key = generate_group_key(row)
        if key not in groups:
            groups[key] = []
        groups[key].append(row)
        
    resolved_list = []
    
    for key, group_rows in groups.items():
        if len(group_rows) == 1:
            # Case A: Only one record exists
            # Display that record's existing REDEMO value (YES or NO).
            # Do not change or infer its value.
            selected_row = group_rows[0]
            selected_status = parse_redemo_status(selected_row)
        else:
            # Categorize records into NO, YES, and NULL/unknown
            no_records = [r for r in group_rows if parse_redemo_status(r) is False]
            yes_records = [r for r in group_rows if parse_redemo_status(r) is True]
            unknown_records = [r for r in group_rows if parse_redemo_status(r) is None]

            if no_records:
                # Case B: Multiple records exist and at least one has REDEMO = NO
                # Select the record with REDEMO = NO (takes priority over all YES records).
                # Deterministic tie-breaker: newest NO record based on existing business logic & IDs.
                no_records.sort(key=newest_record_sort_key, reverse=True)
                selected_row = no_records[0]
                selected_status = False
            elif yes_records:
                # Case C: Multiple records exist and every known record has REDEMO = YES
                # Select the oldest record, provided a reliable date or historical record is available.
                # Deterministic tie-breaker: lowest distributor_id if dates match or missing.
                yes_records.sort(key=oldest_record_sort_key, reverse=False)
                selected_row = yes_records[0]
                selected_status = True
            else:
                # Case D: All records have missing/null/unknown REDEMO values
                # Deterministic tie-breaker: newest record using existing business logic.
                # Do not silently convert unknown values to NO.
                unknown_records.sort(key=newest_record_sort_key, reverse=True)
                selected_row = unknown_records[0]
                selected_status = None

        # Base is the chosen record
        base = dict(selected_row)

        # Merge nulls from other rows in the group without corrupting REDEMO status
        for other_row in group_rows:
            if other_row is selected_row:
                continue
            for k, other_v in other_row.items():
                if k in ("is_redemo", "redemo"):
                    continue
                if (k not in base or base[k] is None or base[k] == "") and other_v is not None and other_v != "":
                    base[k] = other_v

        # Maintain exact REDEMO status consistent with selected record
        if selected_status is True:
            base["is_redemo"] = True
            if "redemo" in base:
                base["redemo"] = "YES"
        elif selected_status is False:
            base["is_redemo"] = False
            if "redemo" in base:
                base["redemo"] = "NO"
        else:
            # Preserve original value without converting to False/NO
            base["is_redemo"] = selected_row.get("is_redemo")
            if "redemo" in base:
                base["redemo"] = selected_row.get("redemo")

        # Metadata
        redemo_count = sum(1 for r in group_rows if parse_redemo_status(r) is True)
        redemo_dates = [
            get_record_datetime(r)[0].strftime("%Y-%m-%d")
            for r in group_rows
            if parse_redemo_status(r) is True and get_record_datetime(r)[0] is not None
        ]
        latest_redemo_date = max(redemo_dates) if redemo_dates else None

        base["redemo_count"] = redemo_count
        base["latest_redemo_date"] = latest_redemo_date

        # --- PHASE 3.1: CLEAN RESOLVED DISPLAY ---
        # Replace Village with clean_village to hide REDEMO suffix from UI
        meta = normalize_redemo_village(base.get("village", ""))
        base["village"] = meta.get("clean_village", base.get("village"))

        resolved_list.append(base)

    return resolved_list
