import re
from typing import List, Dict, Any
import pandas as pd

def sanitize_for_json(data: Any) -> Any:
    """Recursively convert pandas/numpy NaN/NA values to None for JSON serialization."""
    if isinstance(data, dict):
        return {k: sanitize_for_json(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_for_json(item) for item in data]
    else:
        if pd.isna(data):
            return None
        return data

def clean_phone_number(val) -> str | None:
    if pd.isna(val):
        return None
    s = str(val).strip()
    if s.lower() in ["n/a", "na", "null", "none", "nil", "-", "."]:
        return None
    if s.endswith(".0"):
        s = s[:-2]
    digits = re.sub(r"\D", "", s)
    if len(digits) == 10:
        return digits
    return None

def normalize_string(val) -> str:
    if pd.isna(val) or val is None:
        return ""
    return re.sub(r"\s+", " ", str(val).strip().upper())

def preprocess_sabhasad_upload(uploaded_rows: List[dict], existing_db_rows: List[dict]) -> Dict[str, Any]:
    ready_to_import = []
    exact_duplicates = []
    possible_conflicts = []
    invalid_rows = []
    
    # Pre-process DB rows for fast lookup
    db_by_code = {}
    db_by_phone = {}
    db_by_name_village = {}
    db_by_name = {}

    for r in existing_db_rows:
        # Customer ID / Code
        code = str(r.get("customer_code") or "").strip().upper()
        if code:
            db_by_code[code] = r
            
        # Phone
        phone = clean_phone_number(r.get("mobile"))
        if phone:
            db_by_phone[phone] = r
            
        # Name + Village
        name = normalize_string(r.get("name"))
        village = normalize_string(r.get("village"))
        if name and village:
            db_by_name_village[f"{name}|{village}"] = r
            
        if name:
            if name not in db_by_name:
                db_by_name[name] = []
            db_by_name[name].append(r)

    # Track duplicates within the excel itself
    uploaded_phones = {}

    for idx, row in enumerate(uploaded_rows):
        # 1. Phone number validation
        mobile = clean_phone_number(row.get("mobile"))
        if not mobile:
            invalid_rows.append({
                "uploaded_row": row,
                "reason": f"Invalid or missing phone number: {row.get('mobile')}"
            })
            continue
            
        # Check if missing name or village
        if not row.get("name") or not row.get("village"):
            invalid_rows.append({
                "uploaded_row": row,
                "reason": "Missing required fields: Name or Village"
            })
            continue

        # Duplicate in Excel check
        if mobile in uploaded_phones:
            possible_conflicts.append({
                "uploaded_row": row,
                "existing_db_row": uploaded_phones[mobile],
                "conflict_type": "PHONE_EXISTS_IN_FILE",
                "confidence": "HIGH",
                "reason": "Duplicate phone number found within the uploaded Excel file"
            })
            continue
        
        uploaded_phones[mobile] = row
        
        excel_code = str(row.get("customer_code") or "").strip().upper()
        excel_name = normalize_string(row.get("name"))
        excel_village = normalize_string(row.get("village"))
        
        # Priority 1: Customer ID match
        if excel_code and excel_code in db_by_code:
            db_match = db_by_code[excel_code]
            db_phone = clean_phone_number(db_match.get("mobile"))
            
            if db_phone == mobile:
                # Safe match!
                exact_duplicates.append({
                    "uploaded_row": row,
                    "existing_db_row": db_match,
                    "reason": "Exact Match on Customer Code and Phone"
                })
            else:
                # Customer Code matches, but phone is different
                # We need admin confirmation to update phone
                possible_conflicts.append({
                    "uploaded_row": row,
                    "existing_db_row": db_match,
                    "conflict_type": "PHONE_UPDATE_REQUIRED",
                    "confidence": "HIGH",
                    "reason": f"Customer ID {excel_code} matched, but phone differs. Excel: {mobile}, DB: {db_phone}"
                })
            continue
            
        # Priority 2: Existing Phone Number Match
        if mobile in db_by_phone:
            db_match = db_by_phone[mobile]
            db_name = normalize_string(db_match.get("name"))
            
            if db_name == excel_name:
                # Same phone, same name.
                exact_duplicates.append({
                    "uploaded_row": row,
                    "existing_db_row": db_match,
                    "reason": "Exact Match on Phone and Name"
                })
            else:
                # Phone matches, but name differs. Is it a transfer or same person?
                possible_conflicts.append({
                    "uploaded_row": row,
                    "existing_db_row": db_match,
                    "conflict_type": "PHONE_ALREADY_EXISTS",
                    "confidence": "HIGH",
                    "reason": f"Phone belongs to different name. Excel: {excel_name}, DB: {db_name}"
                })
            continue
            
        # Priority 3: Name + Village Match (No phone match or ID match)
        name_village_key = f"{excel_name}|{excel_village}"
        if name_village_key in db_by_name_village:
            db_match = db_by_name_village[name_village_key]
            db_phone = clean_phone_number(db_match.get("mobile"))
            
            # DB has different phone, Excel has new phone.
            possible_conflicts.append({
                "uploaded_row": row,
                "existing_db_row": db_match,
                "conflict_type": "MULTIPLE_POSSIBLE_MATCHES",
                "confidence": "MEDIUM",
                "reason": f"Name & Village matched, but phone is different. Excel: {mobile}, DB: {db_phone}"
            })
            continue
            
        # Priority 4: Name only match
        if excel_name in db_by_name:
            # We just take the first match for simplicity in suggesting
            db_match = db_by_name[excel_name][0]
            db_phone = clean_phone_number(db_match.get("mobile"))
            
            possible_conflicts.append({
                "uploaded_row": row,
                "existing_db_row": db_match,
                "conflict_type": "NAME_MISMATCH", # Reusing conflict type name
                "confidence": "LOW",
                "reason": f"Name matched but Village and Phone differ. Excel: {mobile}, DB: {db_phone}"
            })
            continue

        # If we reach here, it's a completely new customer based on all our checks!
        ready_to_import.append({
            "uploaded_row": row,
            "existing_db_row": None,
            "reason": "New Sabhasad record"
        })

    print("\n📦 [SABHASAD IMPORT PREPROCESSING]")
    print(f"Ready: {len(ready_to_import)}")
    print(f"Exact Duplicates: {len(exact_duplicates)}")
    print(f"Conflicts: {len(possible_conflicts)}")
    print(f"Invalid: {len(invalid_rows)}\n")

    result = {
        "summary": {
            "total_records": len(uploaded_rows),
            "ready_to_import": len(ready_to_import),
            "exact_duplicates": len(exact_duplicates),
            "possible_conflicts": len(possible_conflicts),
            "invalid_rows": len(invalid_rows)
        },
        "ready_to_import": ready_to_import,
        "exact_duplicates": exact_duplicates,
        "possible_conflicts": possible_conflicts,
        "invalid_rows": invalid_rows
    }
    
    return sanitize_for_json(result)
