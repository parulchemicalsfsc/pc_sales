from typing import List, Dict, Any
from similarity_utils import calculate_similarity
from clean_excel_distributors import normalize_redemo_village, clean_phone

def preprocess_distributor_upload(uploaded_rows: List[dict], existing_db_rows: List[dict]) -> Dict[str, Any]:
    ready_to_import = []
    exact_duplicates = []
    possible_conflicts = []
    invalid_rows = []
    
    # Pre-process DB rows for fast exact match lookup using robust clean_phone
    exact_match_keys = {}
    for r in existing_db_rows:
        meta = normalize_redemo_village(r.get("village", ""))
        clean_v = meta.get("clean_village", "")
        
        taluka = str(r.get("taluka") or "").upper().strip()
        district = str(r.get("district") or "").upper().strip()
        state = str(r.get("state") or "").upper().strip()
        mobile = clean_phone(r.get("mantri_mobile"))
        
        key = f"{clean_v}|{taluka}|{district}|{state}|{mobile}"
        exact_match_keys[key] = r

    for row in uploaded_rows:
        # Step 4: Add Temporary Debug Logs
        print("[P5 MOBILE DEBUG]", row.get("mantri_mobile"))

        # 1. Validation Layer
        village = str(row.get("village") or "").strip()
        taluka = str(row.get("taluka") or "").strip()
        mantri_name = str(row.get("mantri_name") or "").strip()
        mantri_mobile = str(row.get("mantri_mobile") or "").strip()
        
        missing = []
        if not village: missing.append("village")
        if not taluka: missing.append("taluka")
        if not mantri_name: missing.append("mantri_name")
        
        if missing:
            invalid_rows.append({
                "uploaded_row": row,
                "is_redemo": row.get("is_redemo", False),
                "clean_village": row.get("clean_village", ""),
                "original_village": row.get("original_village", ""),
                "reason": f"Missing required fields: {', '.join(missing)}"
            })
            continue
            
        # 2. Normalization
        # clean_village is already attached by extract_distributors in Phase 1
        clean_v = row.get("clean_village", "")
        taluka_up = taluka.upper()
        district_up = str(row.get("district") or "").upper().strip()
        state_up = str(row.get("state") or "").upper().strip()
        mobile = clean_phone(mantri_mobile)
        
        # Step 5: Add Temporary Debug Logs
        if row.get("is_redemo"):
            print(f"[P5 REDEMO DEBUG]\nVillage: {row.get('village')}\nClean Village: {clean_v}\nis_redemo: TRUE\n")
        
        # 3. Exact Duplicate Detection
        exact_key = f"{clean_v}|{taluka_up}|{district_up}|{state_up}|{mobile}"
        if exact_key in exact_match_keys:
            is_redemo = row.get("is_redemo", False)
            if is_redemo:
                # REDEMO duplicate is ready to import (triggers canonical update on confirm)
                ready_to_import.append({
                    "uploaded_row": row,
                    "existing_db_row": exact_match_keys[exact_key],
                    "is_redemo": True,
                    "clean_village": clean_v,
                    "original_village": row.get("original_village", ""),
                    "reason": "REDEMO duplicate (triggers canonical update of record_date)"
                })
            else:
                exact_duplicates.append({
                    "uploaded_row": row,
                    "existing_db_row": exact_match_keys[exact_key],
                    "is_redemo": False,
                    "clean_village": clean_v,
                    "original_village": row.get("original_village", ""),
                    "reason": "Exact match on clean_village, taluka, district, state, mantri_mobile",
                    "similarity_score": 1.0
                })
            continue
            
        # 4. Possible Conflict Detection
        conflict_found = False
        for db_row in existing_db_rows:
            sim = calculate_similarity(row, db_row)
            if sim["probable_match"]:
                possible_conflicts.append({
                    "uploaded_row": row,
                    "existing_db_row": db_row,
                    "is_redemo": row.get("is_redemo", False),
                    "clean_village": clean_v,
                    "original_village": row.get("original_village", ""),
                    "reason": "High similarity detected (score 0.75-0.90+)",
                    "similarity_score": sim["similarity_score"]
                })
                conflict_found = True
                break
                
        if conflict_found:
            continue
            
        # 5. Ready to Import
        ready_to_import.append({
            "uploaded_row": row,
            "is_redemo": row.get("is_redemo", False),
            "clean_village": clean_v,
            "original_village": row.get("original_village", ""),
            "reason": "Passed all validation and duplication checks"
        })
        
    print("\n📦 [P5 IMPORT]")
    print(f"Ready: {len(ready_to_import)}")
    print(f"Duplicates: {len(exact_duplicates)}")
    print(f"Conflicts: {len(possible_conflicts)}")
    print(f"Invalid: {len(invalid_rows)}\n")

    return {
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
