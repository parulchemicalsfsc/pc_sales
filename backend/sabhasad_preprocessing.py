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
    phone_review = []
    invalid_rows = []
    
    # Pre-process DB rows for fast lookup by phone
    db_by_phone = {}

    for r in existing_db_rows:
        phone = clean_phone_number(r.get("mobile"))
        if phone:
            db_by_phone[phone] = r

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
            phone_review.append({
                "uploaded_row": row,
                "existing_db_row": uploaded_phones[mobile],
                "conflict_type": "PHONE_EXISTS_IN_FILE",
                "confidence": "HIGH",
                "reason": "Duplicate phone number found within the uploaded Excel file"
            })
            continue
        
        uploaded_phones[mobile] = row
        
        excel_name = normalize_string(row.get("name"))
        excel_village = normalize_string(row.get("village"))
        
        # Priority 1: Existing Phone Number Match
        if mobile in db_by_phone:
            db_match = db_by_phone[mobile]
            db_name = normalize_string(db_match.get("name"))
            db_village = normalize_string(db_match.get("village"))
            
            if db_name == excel_name and db_village == excel_village:
                phone_review.append({
                    "uploaded_row": row,
                    "existing_db_row": db_match,
                    "conflict_type": "EXACT_DUPLICATE",
                    "confidence": "HIGH",
                    "reason": "Exact Match on Phone, Name, and Village"
                })
            else:
                phone_review.append({
                    "uploaded_row": row,
                    "existing_db_row": db_match,
                    "conflict_type": "PHONE_CONFLICT",
                    "confidence": "HIGH",
                    "reason": f"Phone exists but Name and/or Village differs"
                })
            continue

        # If we reach here, it's a new customer
        ready_to_import.append({
            "uploaded_row": row,
            "existing_db_row": None,
            "reason": "New Sabhasad record"
        })

    print("\n📦 [SABHASAD IMPORT PREPROCESSING]")
    print(f"Ready: {len(ready_to_import)}")
    print(f"Phone Review: {len(phone_review)}")
    print(f"Invalid: {len(invalid_rows)}\n")

    result = {
        "summary": {
            "total_records": len(uploaded_rows),
            "ready_to_import": len(ready_to_import),
            "phone_review": len(phone_review),
            "invalid_rows": len(invalid_rows)
        },
        "ready_to_import": ready_to_import,
        "phone_review": phone_review,
        "invalid_rows": invalid_rows
    }
    
    return sanitize_for_json(result)
