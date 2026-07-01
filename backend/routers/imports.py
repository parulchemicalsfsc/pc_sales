import shutil
from pathlib import Path

from typing import Optional, List
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from pydantic import BaseModel
from datetime import datetime
from psycopg2.extensions import connection

from supabase_db import get_db
from excel_loader import (
    detect_excel_type,
    import_customers_excel,
    import_demo_excel,
    import_distributors_excel,
    import_sales_excel,
    import_sabhasad_excel,
)

print("[DEBUG] imports.py loaded")

router = APIRouter()

# ----------------------
# Upload directory
# ----------------------

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "data" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ----------------------
# File save helper
# ----------------------

def save_uploaded_file(file: UploadFile) -> str:
    if not file.filename.endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Only Excel files are allowed")

    file_path = UPLOAD_DIR / file.filename

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return str(file_path)


# ==========================================================
# Unified Excel Import Endpoint
# ==========================================================

class ConfirmImportRequest(BaseModel):
    selected_rows: List[dict]
    file_name: Optional[str] = None

@router.post("/distributors/confirm-import")
def confirm_import_distributors(
    req: ConfirmImportRequest,
    conn = Depends(get_db),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    user_role: Optional[str] = Header(None, alias="x-user-role"),
):
    """
    Phase 7: Confirm Import workflow for Distributor preprocessing review system.
    """
    print("🔥 CONFIRM IMPORT API HIT")
    selected_rows = req.selected_rows
    
    if not selected_rows:
        return {
            "imported_count": 0,
            "skipped_count": 0,
            "failed_rows": [],
            "message": "No rows selected for import."
        }
        
    import_batch_id = f"IMPORT_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    redemo_history = []
    distributors_to_insert = []
    failed_rows = []
    imported_count = 0
    
    for item in selected_rows:
        # Handle different possible payload structures from frontend
        row = item.get("uploaded_row") or item.get("row") or item
        
        # Re-run safety validation
        village = str(row.get("village") or "").strip()
        taluka = str(row.get("taluka") or "").strip()
        mantri_name = str(row.get("mantri_name") or "").strip()
        
        # Check required fields
        if not village or not taluka or not mantri_name:
            failed_rows.append({
                "row": row,
                "reason": "Missing required fields (village, taluka, mantri_name)"
            })
            continue
            
        # Extract REDEMO status/meta
        is_redemo = row.get("is_redemo", False)
        clean_village = row.get("clean_village") or row.get("village")
        
        # Check if this row matches an existing distributor (Exact Duplicate)
        from clean_excel_distributors import normalize_redemo_village
        match_village = str(clean_village or "").strip().upper()
        match_taluka = str(row.get("taluka") or "").strip().upper()
        match_district = str(row.get("district") or "").strip().upper()
        match_state = str(row.get("state") or "").strip().upper()
        match_mobile = str(row.get("mantri_mobile") or "").strip()
        
        existing = None
        try:
            query = conn.table("distributors").select("*")
            query = query.eq("taluka", match_taluka)
            if match_mobile:
                query = query.eq("mantri_mobile", match_mobile)
            db_res = query.execute()
            
            for db_row in db_res.data:
                db_v_meta = normalize_redemo_village(db_row.get("village", ""))
                db_clean_v = str(db_v_meta.get("clean_village") or "").strip().upper()
                db_dist = str(db_row.get("district") or "").strip().upper()
                db_state = str(db_row.get("state") or "").strip().upper()
                
                if db_clean_v == match_village and db_dist == match_district and db_state == match_state:
                    existing = db_row
                    break
        except Exception as q_err:
            print(f"Error checking duplicate: {q_err}")

        # Trigger canonical update flow if exact duplicate and REDEMO
        if existing and is_redemo:
            incoming_date_str = row.get("record_date")
            existing_date_str = existing.get("record_date")
            
            should_update_date = False
            if incoming_date_str:
                if not existing_date_str:
                    should_update_date = True
                else:
                    try:
                        incoming_date = datetime.strptime(incoming_date_str, "%Y-%m-%d").date()
                        existing_date = datetime.strptime(existing_date_str, "%Y-%m-%d").date()
                        if incoming_date > existing_date:
                            should_update_date = True
                    except Exception as parse_err:
                        print(f"Error comparing dates: {parse_err}")
                        if incoming_date_str > existing_date_str:
                            should_update_date = True
            
            update_data = {
                "is_redemo": True
            }
            old_date = existing.get("record_date")
            if should_update_date:
                update_data["record_date"] = incoming_date_str
                print(f"[REDEMO CANONICAL UPDATE]\nDistributor: {match_village}\nOld Date: {old_date}\nNew Date: {incoming_date_str}\n")
            else:
                print(f"[REDEMO CANONICAL UPDATE NO DATE OVERWRITE] Distributor: {match_village} Existing Date: {old_date} >= Incoming Date: {incoming_date_str}")
                
            try:
                conn.table("distributors").eq("distributor_id", existing["distributor_id"]).update(update_data)
                imported_count += 1
            except Exception as u_err:
                print(f"Error updating distributor: {u_err}")
                failed_rows.append({
                    "row": row,
                    "reason": f"Database update failed: {str(u_err)}"
                })
                continue
                
            # Log to REDEMO history as well (Step 4)
            redemo_history.append({
                "original_village": row.get("original_village") or row.get("village"),
                "clean_village": clean_village,
                "mantri_name": row.get("mantri_name"),
                "mantri_mobile": row.get("mantri_mobile"),
                "redemo_detected": True,
                "redemo_pattern": row.get("redemo_pattern"),
                "import_batch_id": import_batch_id,
                "redemo_date": incoming_date_str,
                "raw_row": row
            })
            continue

        # Standard insertion flow for non-duplicates (or standard rows)
        if existing and not is_redemo:
            # Block standard exact duplicate to avoid data duplication
            failed_rows.append({
                "row": row,
                "reason": "Exact duplicate already exists (non-REDEMO)"
            })
            continue

        if is_redemo:
            redemo_date = row.get("record_date")
            print(f"[REDEMO HISTORY INSERT]\nVillage: {clean_village}\nDate: {redemo_date}\n")
            
            redemo_history.append({
                "original_village": row.get("original_village") or row.get("village"),
                "clean_village": clean_village,
                "mantri_name": row.get("mantri_name"),
                "mantri_mobile": row.get("mantri_mobile"),
                "redemo_detected": True,
                "redemo_pattern": row.get("redemo_pattern"),
                "import_batch_id": import_batch_id,
                "redemo_date": redemo_date,
                "raw_row": row
            })
            
        # Clean row for insertion
        clean_row = {
            k: v for k, v in row.items() 
            if k not in ["original_village", "clean_village", "redemo_pattern", "raw_mobile_value"]
        }
        clean_row["is_redemo"] = bool(is_redemo)
        distributors_to_insert.append(clean_row)
        
    skipped_count = len(failed_rows)
    
    if redemo_history:
        try:
            print(f"📝 Logging {len(redemo_history)} REDEMO occurrences to history...")
            conn.table("distributor_redemo_history").insert(redemo_history).execute()
        except Exception as e:
            print(f"❌ ERROR inserting REDEMO history: {e}")
            
    if distributors_to_insert:
        try:
            print(f"💾 Inserting {len(distributors_to_insert)} approved rows into Supabase...")
            response = conn.table("distributors").insert(distributors_to_insert).execute()
            if response.data:
                imported_count += len(response.data)
                print(f"✅ ACTUAL INSERT SUCCESS: {len(response.data)} rows inserted.")
            else:
                print("❌ INSERT FAILED:", response)
                failed_rows.extend([
                    {"row": r, "reason": "Database insertion failed"}
                    for r in distributors_to_insert
                ])
                skipped_count += len(distributors_to_insert)
        except Exception as e:
            print(f"❌ DATABASE ERROR: {e}")
            failed_rows.extend([
                {"row": r, "reason": f"Database error: {str(e)}"}
                for r in distributors_to_insert
            ])
            skipped_count += len(distributors_to_insert)
            
    print(f"\n[P7 CONFIRM IMPORT]")
    print(f"Imported: {imported_count}")
    print(f"Skipped: {skipped_count}\n")
    
    # Store import history
    import_history_data = {
        "import_batch_id": import_batch_id,
        "module_name": "DISTRIBUTORS",
        "file_name": req.file_name or "distributors.xlsx",
        "imported_by_email": user_email,
        "imported_by_role": user_role,
        "total_records": len(selected_rows),
        "imported_records": imported_count,
        "duplicate_records": 0,
        "conflict_records": 0,
        "invalid_records": skipped_count,
        "import_status": "SUCCESS" if imported_count > 0 else "FAILED",
    }
    try:
        conn.table("import_history").insert(import_history_data).execute()
        print(f"[IMPORT HISTORY]\nSaved import session:\n{import_batch_id}")
    except Exception as eh:
        print(f"❌ ERROR logging import history: {eh}")
        
    return {
        "imported_count": imported_count,
        "skipped_count": skipped_count,
        "failed_rows": failed_rows,
        "message": f"Successfully imported {imported_count} rows, skipped/failed {skipped_count} rows."
    }


@router.post("/distributors/preprocess")
def preprocess_distributors(
    file: UploadFile = File(...),
    conn = Depends(get_db)
):
    """
    Phase 5: Preprocess distributor excel import and return categorized rows
    without inserting into the database.
    """
    print("🔥 PREPROCESS API HIT")
    file_path = save_uploaded_file(file)
    print(f"[INFO] File saved to: {file_path}")

    try:
        from clean_excel_distributors import extract_distributors
        from import_preprocessing import preprocess_distributor_upload
        
        # 1. Extract and Normalize (Phase 1)
        uploaded_rows = extract_distributors(file_path)
        
        # 2. Fetch existing DB rows for comparison
        # Using pagination if necessary, but since DB is small, a single select might suffice.
        # To be safe against 1000 limit, we paginate:
        all_rows = []
        batch = 1000
        offset = 0
        while True:
            resp = conn.table("distributors").select("*").range(offset, offset + batch - 1).execute()
            if not resp.data:
                break
            all_rows.extend(resp.data)
            if len(resp.data) < batch:
                break
            offset += batch
        
        # 3. Preprocess Pipeline (Phase 5)
        result = preprocess_distributor_upload(uploaded_rows, all_rows)
        
        return result
        
    except Exception as e:
        print("❌ PREPROCESS ERROR:", str(e))
        import traceback
        print("Preprocess error:\n", traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Preprocessing failed: {str(e)}",
        )

@router.post("/sabhasad/preprocess")
def preprocess_sabhasads(
    file: UploadFile = File(...),
    conn = Depends(get_db)
):
    """
    Preprocess Sabhasad excel import and return categorized rows.
    """
    print("🔥 SABHASAD PREPROCESS API HIT")
    file_path = save_uploaded_file(file)
    print(f"[INFO] File saved to: {file_path}")

    try:
        from clean_excel_customers import extract_sabhasad
        import sys
        import os
        sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/..")
        from sabhasad_preprocessing import preprocess_sabhasad_upload
        
        # 1. Extract
        uploaded_rows = extract_sabhasad(file_path)
        
        # 2. Fetch existing DB rows
        all_rows = []
        batch = 1000
        offset = 0
        while True:
            resp = conn.table("customers").select("*").range(offset, offset + batch - 1).execute()
            if not resp.data:
                break
            all_rows.extend(resp.data)
            if len(resp.data) < batch:
                break
            offset += batch
            
        # 3. Preprocess
        result = preprocess_sabhasad_upload(uploaded_rows, all_rows)
        return result
        
    except Exception as e:
        print("❌ SABHASAD PREPROCESS ERROR:", str(e))
        import traceback
        print("Preprocess error:\n", traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Preprocessing failed: {str(e)}",
        )

@router.post("/sabhasad/confirm-import")
def confirm_import_sabhasads(
    req: ConfirmImportRequest,
    conn = Depends(get_db),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    user_role: Optional[str] = Header(None, alias="x-user-role"),
):
    """
    Confirm Import workflow for Sabhasad preprocessing review system.
    """
    print("🔥 SABHASAD CONFIRM IMPORT API HIT")
    selected_rows = req.selected_rows
    print("selected_rows:", len(selected_rows))
    
    if not selected_rows:
        return {
            "imported_count": 0,
            "skipped_count": 0,
            "failed_rows": [],
            "message": "No rows selected for import."
        }
        
    import_batch_id = f"IMPORT_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    failed_rows = []
    imported_count = 0
    records_to_insert = []
    
    # Get max code for new sabhasads
    try:
        res = conn.table("customers").select("customer_code").order("customer_code", desc=True).limit(1).execute()
        last_code = res.data[0]["customer_code"] if res.data else "CUST000"
        import re
        m = re.search(r"CUST(\d+)", str(last_code))
        last_num = int(m.group(1)) if m else 0
    except Exception:
        last_num = 0

    for item in selected_rows:
        row = item.get("row") or item  # Handle different possible payload structures from frontend
        action = item.get("action", "IMPORT") # Action assigned by the UI for conflicts
        existing_id = item.get("existing_id") # If updating
        
        if action == "SKIP":
            failed_rows.append({"row": row, "reason": "Skipped by admin resolution."})
            continue

        if action == "UPDATE_EXISTING" and existing_id:
            # We are updating an existing customer
            try:
                update_payload = {
                    "mobile": row.get("mobile"),
                    "name": row.get("name"),
                    "village": row.get("village"),
                    "taluka": row.get("taluka"),
                    "district": row.get("district"),
                    "state": row.get("state") or "GUJARAT",
                    "status": "Active"
                }
                conn.table("customers").eq("customer_id", existing_id).update(update_payload).execute()
                imported_count += 1
            except Exception as e:
                failed_rows.append({"row": row, "reason": f"Update failed: {str(e)}"})
            continue

        # Otherwise, insert as new
        clean_row = {
            "name": row.get("name"),
            "mobile": row.get("mobile"),
            "village": row.get("village"),
            "taluka": row.get("taluka"),
            "district": row.get("district"),
            "state": row.get("state") or "GUJARAT",
            "status": "Active"
        }
        
        if not row.get("customer_code"):
            last_num += 1
            clean_row["customer_code"] = f"CUST{last_num:03d}"
        else:
            clean_row["customer_code"] = row.get("customer_code")
            
        records_to_insert.append(clean_row)

    if records_to_insert:
        try:
            print("records_to_insert:", len(records_to_insert))
            res = conn.table("customers").upsert(records_to_insert).execute()
            inserted = len(res.data) if res.data else 0
            imported_count += inserted
            print("res.data length:", len(res.data) if res.data else 0)
            print("res:", res)
        except Exception as e:
            failed_rows.extend([
                {"row": r, "reason": f"Database upsert error: {str(e)}"}
                for r in records_to_insert
            ])

    skipped_count = len(failed_rows)
    
    # Store import history
    import_history_data = {
        "import_batch_id": import_batch_id,
        "module_name": "SABHASAD",
        "file_name": req.file_name or "sabhasad.xlsx",
        "imported_by_email": user_email,
        "imported_by_role": user_role,
        "total_records": len(selected_rows),
        "imported_records": imported_count,
        "duplicate_records": 0,
        "conflict_records": 0,
        "invalid_records": skipped_count,
        "import_status": "SUCCESS" if imported_count > 0 else "FAILED",
    }
    try:
        conn.table("import_history").insert(import_history_data).execute()
    except Exception as eh:
        print(f"❌ ERROR logging import history: {eh}")
        
    print({
       "imported_count": imported_count,
       "skipped_count": skipped_count,
       "failed_rows": len(failed_rows)
    })
    if imported_count == 0:
        print("first 5 records_to_insert:")
        for r in records_to_insert[:5]:
            print(r)

    return {
        "imported_count": imported_count,
        "skipped_count": skipped_count,
        "failed_rows": failed_rows,
        "message": f"Successfully imported {imported_count} Sabhasads."
    }


@router.post("/excel")
def import_excel(
    file: UploadFile = File(...),
    conn = Depends(get_db),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    user_role: Optional[str] = Header(None, alias="x-user-role"),
):
    """
    Smart Excel importer:
    - Detects Excel type automatically
    - Routes to correct importer
    - Stores data using PostgreSQL (Supabase)
    """

    print("IMPORT API HIT")
    file_path = save_uploaded_file(file)
    print(f"[INFO] File saved to: {file_path}")

    import_batch_id = f"IMPORT_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    try:
        try:
            excel_type = detect_excel_type(file_path)
            print(f"[DEBUG] Detected Excel Type: {excel_type}")
        except Exception as detection_err:
            print(f"[ERROR] Detection failed: {detection_err}")
            excel_type = "UNKNOWN"

        if excel_type == "DISTRIBUTORS":
            inserted = import_distributors_excel(file_path, conn, import_batch_id=import_batch_id)
            
            # Log import history
            import_history_data = {
                "import_batch_id": import_batch_id,
                "module_name": "DISTRIBUTORS",
                "file_name": file.filename or "distributors.xlsx",
                "imported_by_email": user_email,
                "imported_by_role": user_role,
                "total_records": inserted,
                "imported_records": inserted,
                "duplicate_records": 0,
                "conflict_records": 0,
                "invalid_records": 0,
                "import_status": "SUCCESS" if inserted > 0 else "FAILED",
            }
            try:
                conn.table("import_history").insert(import_history_data).execute()
                print(f"[IMPORT HISTORY]\nSaved import session:\n{import_batch_id}")
            except Exception as eh:
                print(f"❌ ERROR logging import history: {eh}")
                
            return {
                "type": "Distributors",
                "distributors_inserted": inserted,
                "message": f"Successfully imported {inserted} distributors",
            }

        elif excel_type == "SABHASAD" or excel_type == "CUSTOMERS":
            print(f"🔥 {excel_type} IMPORT TRIGGERED")
            result = import_sabhasad_excel(file_path, conn)
            inserted = result.get("inserted", 0)
            skipped = result.get("skipped", 0)
            errors = result.get("errors", [])
            
            # Log import history
            import_history_data = {
                "import_batch_id": import_batch_id,
                "module_name": "SABHASAD",
                "file_name": file.filename or "sabhasad.xlsx",
                "imported_by_email": user_email,
                "imported_by_role": user_role,
                "total_records": inserted + skipped,
                "imported_records": inserted,
                "duplicate_records": skipped,
                "conflict_records": 0,
                "invalid_records": len(errors),
                "import_status": "SUCCESS" if result.get("success", False) else "FAILED",
            }
            try:
                conn.table("import_history").insert(import_history_data).execute()
                print(f"[IMPORT HISTORY]\nSaved import session:\n{import_batch_id}")
            except Exception as eh:
                print(f"❌ ERROR logging import history: {eh}")
                
            return {
                "type": "Sabhasad",
                "inserted": inserted,
                "skipped": skipped,
                "message": f"Successfully imported {inserted} Sabhasad records.",
                "errors": errors
            }

        elif excel_type == "SALES":
            sale_items = import_sales_excel(file_path, conn)
            demos = import_demo_excel(file_path, conn)
            
            # Log import history
            import_history_data = {
                "import_batch_id": import_batch_id,
                "module_name": "SALES",
                "file_name": file.filename or "sales.xlsx",
                "imported_by_email": user_email,
                "imported_by_role": user_role,
                "total_records": sale_items + demos,
                "imported_records": sale_items + demos,
                "duplicate_records": 0,
                "conflict_records": 0,
                "invalid_records": 0,
                "import_status": "SUCCESS" if (sale_items + demos) > 0 else "FAILED",
            }
            try:
                conn.table("import_history").insert(import_history_data).execute()
                print(f"[IMPORT HISTORY]\nSaved import session:\n{import_batch_id}")
            except Exception as eh:
                print(f"❌ ERROR logging import history: {eh}")
                
            return {
                "type": "Sales",
                "sale_items_inserted": sale_items,
                "demos_inserted": demos,
                "message": (
                    f"Successfully imported {sale_items} sale items "
                    f"and {demos} demos"
                ),
            }

        # Fallback for DISTRIBUTORS or UNKNOWN
        inserted = import_distributors_excel(file_path, conn, import_batch_id=import_batch_id)
        
        # Log import history
        import_history_data = {
            "import_batch_id": import_batch_id,
            "module_name": "DISTRIBUTORS",
            "file_name": file.filename or "distributors.xlsx",
            "imported_by_email": user_email,
            "imported_by_role": user_role,
            "total_records": inserted,
            "imported_records": inserted,
            "duplicate_records": 0,
            "conflict_records": 0,
            "invalid_records": 0,
            "import_status": "SUCCESS" if inserted > 0 else "FAILED",
        }
        try:
            conn.table("import_history").insert(import_history_data).execute()
            print(f"[IMPORT HISTORY]\nSaved import session:\n{import_batch_id}")
        except Exception as eh:
            print(f"❌ ERROR logging import history: {eh}")
            
        return {
            "type": "Distributors (Fallback)",
            "distributors_inserted": inserted,
            "message": f"Successfully imported distributors via fallback logic.",
        }

    except Exception as e:
        print("❌ IMPORT ERROR:", str(e))
        import traceback
        print("Import error:\n", traceback.format_exc())
        
        # Log failed import history if batch was generated
        try:
            import_history_data = {
                "import_batch_id": import_batch_id,
                "module_name": excel_type if 'excel_type' in locals() else "UNKNOWN",
                "file_name": file.filename or "unknown.xlsx",
                "imported_by_email": user_email,
                "imported_by_role": user_role,
                "total_records": 0,
                "imported_records": 0,
                "duplicate_records": 0,
                "conflict_records": 0,
                "invalid_records": 0,
                "import_status": "FAILED",
            }
            conn.table("import_history").insert(import_history_data).execute()
        except Exception as logging_err:
            print(f"❌ Failed to log failed import history: {logging_err}")
            
        raise HTTPException(
            status_code=500,
            detail=f"Import failed: {str(e)}. Please verify the Excel file format.",
        )
    finally:
        if user_email:
            try:
                from activity_logger import get_activity_logger
                from supabase_db import get_supabase_client
                db = get_supabase_client()
                logger = get_activity_logger(db)
                logger.log_import(
                    user_email=user_email,
                    file_name=file.filename or "unknown",
                    records_count=0,
                )
            except Exception:
                pass


@router.get("/history")
def get_import_history(
    conn = Depends(get_db),
    user_email: Optional[str] = Header(None, alias="x-user-email"),
    user_role: Optional[str] = Header(None, alias="x-user-role"),
):
    """
    Get centralized Excel import history, sorted by newest first.
    """
    try:
        res = conn.table("import_history").select("*").order("created_at", desc=True).execute()
        return res.data
    except Exception as e:
        print(f"❌ ERROR fetching import history: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch import history: {str(e)}"
        )
