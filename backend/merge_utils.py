from typing import List, Dict
from clean_excel_distributors import normalize_redemo_village

def generate_group_key(row: dict) -> str:
    village = row.get("village") or ""
    meta = normalize_redemo_village(village)
    clean_v = meta.get("clean_village", "")
    
    name = str(row.get("mantri_name") or "").strip().upper()
    mobile = str(row.get("mantri_mobile") or "").strip()
    
    return f"{clean_v}_{name}_{mobile}"

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
        # 2. Sort by record_date OR created_at descending (newest first)
        def get_date(r):
            d = r.get("record_date")
            if not d:
                d = r.get("created_at")
            if not d:
                return ""
            return d
            
        group_rows.sort(key=lambda x: get_date(x), reverse=True)
        
        # 3. Base is the newest row
        base = dict(group_rows[0])
        
        # 4. Merge nulls from older rows
        for older_row in group_rows[1:]:
            for k, v in base.items():
                if v is None or v == "":
                    older_v = older_row.get(k)
                    if older_v is not None and older_v != "":
                        base[k] = older_v
                        
        # 5. Metadata
        redemo_count = sum(1 for r in group_rows if r.get("is_redemo") is True)
        
        redemo_dates = [get_date(r) for r in group_rows if r.get("is_redemo") is True and get_date(r)]
        latest_redemo_date = max(redemo_dates) if redemo_dates else None
        
        base["redemo_count"] = redemo_count
        base["latest_redemo_date"] = latest_redemo_date
        
        # --- PHASE 3.1: CLEAN RESOLVED DISPLAY ---
        # 1. Replace Village with clean_village to hide REDEMO suffix from UI
        meta = normalize_redemo_village(base.get("village", ""))
        base["village"] = meta.get("clean_village", base.get("village"))
        
        # 2. Preserve REDEMO Status if ANY row in the group was REDEMO
        base["is_redemo"] = any(row.get("is_redemo") for row in group_rows)
        
        resolved_list.append(base)
        
    return resolved_list
