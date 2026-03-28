import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from psycopg2.extensions import connection

from supabase_db import get_db
from excel_loader import (
    detect_excel_type,
    import_customers_excel,
    import_demo_excel,
    import_distributors_excel,
    import_sales_excel,
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

@router.post("/excel")
def import_excel(
    file: UploadFile = File(...),
    conn: connection = Depends(get_db),
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

    try:
        try:
            excel_type = detect_excel_type(file_path)
        except Exception as detection_err:
            excel_type = "UNKNOWN"

        if excel_type == "DISTRIBUTORS":
            inserted = import_distributors_excel(file_path, conn)
            return {
                "type": "Distributors",
                "distributors_inserted": inserted,
                "message": f"Successfully imported {inserted} distributors",
            }

        elif excel_type == "CUSTOMERS":
            print("🔥 CUSTOMER IMPORT TRIGGERED")
            print("🔥 USING DISTRIBUTOR LOGIC")
            print("⚠️ Customer import redirected to distributor logic")
            inserted = import_distributors_excel(file_path, conn)
            return {
                "type": "Distributors",
                "distributors_inserted": inserted,
                "message": f"Successfully imported {inserted} distributors",
            }

        elif excel_type == "SALES":
            sale_items = import_sales_excel(file_path, conn)
            demos = import_demo_excel(file_path, conn)
            return {
                "type": "Sales",
                "sale_items_inserted": sale_items,
                "demos_inserted": demos,
                "message": (
                    f"Successfully imported {sale_items} sale items "
                    f"and {demos} demos"
                ),
            }

        # DISTRIBUTORS or UNKNOWN — always use distributor importer
        if excel_type != "DISTRIBUTORS":
            print("Fallback triggered")
        inserted = import_distributors_excel(file_path, conn)
        return {
            "type": "Distributors" if excel_type == "DISTRIBUTORS" else "Distributors (Fallback)",
            "distributors_inserted": inserted,
            "message": (
                f"Successfully imported {inserted} distributors"
                if excel_type == "DISTRIBUTORS"
                else "Successfully imported distributors"
            ),
        }

    except Exception as e:
        print("❌ IMPORT ERROR:", str(e))
        import traceback
        print("Import error:\n", traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Import failed: {str(e)}. Please verify the Excel file format.",
        )
