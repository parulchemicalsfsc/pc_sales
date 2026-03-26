import re
from typing import Optional, Any
import pandas as pd
from clean_excel_distributors import extract_distributors

# =================================================
# CONSTANTS
# =================================================

MOBILE_REGEX = re.compile(r"\b\d{10}\b")

# =================================================
# HELPERS
# =================================================

def normalize(col: str) -> str:
    return (
        str(col)
        .strip()
        .lower()
        .replace(" ", "")
        .replace("_", "")
        .replace("-", "")
        .replace(".", "")
    )

def normalize_date(val) -> Optional[str]:
    try:
        return pd.to_datetime(val, dayfirst=True).strftime("%Y-%m-%d")
    except Exception:
        return None

def to_int(v):
    try:
        return int(float(v))
    except Exception:
        return 0

def to_float(v):
    try:
        return float(v)
    except Exception:
        return 0.0

def extract_packaging_liter(text):
    if not isinstance(text, str):
        return None
    t = text.lower()
    for size in [1, 2, 5, 10, 15]:
        if str(size) in t and ("ltr" in t or "liter" in t):
            return size
    return None

# =================================================
# ✅ EXCEL TYPE DETECTION (FIXED)
# =================================================

def detect_excel_type(file_path: str) -> str:
    xls = pd.ExcelFile(file_path)

    # SALES → always has 2 sheets
    if len(xls.sheet_names) >= 2:
        return "SALES"

    df = pd.read_excel(xls, sheet_name=0, header=None)
    df.dropna(how="all", inplace=True)

    customer_hits = 0
    distributor_hits = 0

    for _, row in df.head(50).iterrows():
        text = " ".join(str(c).lower() for c in row if pd.notna(c))

        if re.search(r"\b\d{10}\b", text):
            customer_hits += 1

        if any(k in text for k in ["mantri", "sabhasad", "district", "taluka"]):
            distributor_hits += 1

    if distributor_hits >= 3:
        return "DISTRIBUTORS"

    if customer_hits >= 3:
        return "CUSTOMERS"

    return "UNKNOWN"

# =================================================
# PRODUCT RESOLUTION
# =================================================

def resolve_product(conn: Any, packaging_name: str) -> Optional[int]:
    liter = extract_packaging_liter(packaging_name)
    if not liter:
        return None

    # Check if product exists
    res = conn.table("products").select("product_id").eq("capacity_ltr", liter).limit(1).execute()
    if res.data:
        return res.data[0]["product_id"]

    # Create new product if not found
    insert_res = conn.table("products").insert({
        "product_name": f"Oil {liter} Ltr",
        "capacity_ltr": liter,
        "is_active": True
    }).execute()
    
    if insert_res.data:
        return insert_res.data[0]["product_id"]
    return None

# =================================================
# CUSTOMERS IMPORT (FREE-FORM)
# =================================================

def import_customers_excel(path: str, conn: Any) -> int:
    df = pd.read_excel(path, header=None)
    df.dropna(how="all", inplace=True)

    inserted = 0
    records = []

    for _, row in df.iterrows():
        cells = [str(c).strip() for c in row if pd.notna(c)]
        if len(cells) < 2:
            continue

        name = mobile = village = taluka = None

        for cell in cells:
            if not name and not cell.isdigit():
                name = cell

            if not mobile:
                m = MOBILE_REGEX.search(cell)
                if m:
                    mobile = m.group()

            parts = cell.split()
            if len(parts) >= 3 and parts[1].isdigit():
                village = parts[0].lower()
                taluka = parts[2].lower()

        if not (name and village and taluka):
            continue

        records.append({
            "name": name,
            "mobile": mobile,
            "village": village,
            "taluka": taluka
        })

    if records:
        res = conn.table("customers").insert(records).execute()
        inserted = len(res.data) if hasattr(res, 'data') else len(records)

    return inserted

# =================================================
# SALES IMPORT (SHEET 0)
# =================================================

def import_sales_excel(path: str, conn: Any) -> int:
    xls = pd.ExcelFile(path)
    df = pd.read_excel(xls, sheet_name=0)

    df.columns = [normalize(c) for c in df.columns]

    current_sale_id = None
    items_count = 0

    for _, row in df.iterrows():
        # 1. Handle New Sale (Master Record)
        if pd.notna(row.get("name")):
            customer_name = str(row.get("name")).strip()
            # Fetch customer_id via Supabase
            c_res = conn.table("customers").select("customer_id").eq("name", customer_name).limit(1).execute()
            customer_id = c_res.data[0]["customer_id"] if c_res.data else None
            
            s_res = conn.table("sales").insert({
                "invoice_no": row.get("invno"),
                "customer_id": customer_id,
                "sale_date": normalize_date(row.get("dispatchdate"))
            }).execute()
            
            if s_res.data:
                current_sale_id = s_res.data[0]["sale_id"]

        # 2. Handle Sale Item (Detail Record)
        if current_sale_id and pd.notna(row.get("packing")):
            product_id = resolve_product(conn, row.get("packing"))
            
            conn.table("sale_items").insert({
                "sale_id": current_sale_id,
                "product_id": product_id,
                "quantity": to_int(row.get("qtn") or row.get("qty")),
                "rate": to_float(row.get("rate")),
                "amount": to_float(row.get("amt"))
            }).execute()
            items_count += 1

    return items_count

# =================================================
# DEMO IMPORT (SHEET 1)
# =================================================

def import_demo_excel(path: str, conn: Any) -> int:
    xls = pd.ExcelFile(path)
    df = pd.read_excel(xls, sheet_name=1)

    df.columns = [normalize(c) for c in df.columns]

    count = 0

    for _, row in df.iterrows():
        if pd.isna(row.get("name")) or pd.isna(row.get("packing")):
            continue

        customer_name = str(row.get("name")).strip()
        # Fetch customer_id via Supabase
        c_res = conn.table("customers").select("customer_id").eq("name", customer_name).limit(1).execute()
        customer_id = c_res.data[0]["customer_id"] if c_res.data else None

        conn.table("demos").insert({
            "customer_id": customer_id,
            "demo_date": normalize_date(row.get("dispatchdate")),
            "product_id": resolve_product(conn, row.get("packing")),
            "quantity_provided": to_int(row.get("qtn") or row.get("qty")),
            "notes": "Imported from Excel"
        }).execute()
        
        count += 1

    return count


# =================================================
# DISTRIBUTORS IMPORT (via extract_distributors)
# =================================================

def import_distributors_excel(path: str, conn: Any) -> int:
    """
    Clean and import an Excel file of distributors into the Supabase distributors table.
    """
    data = extract_distributors(path)
    print("🚀 NEW IMPORT FUNCTION RUNNING")
    print(f"🔥 TOTAL EXTRACTED: {len(data)}")

    if not data:
        print("⚠️ No data to insert.")
        return 0

    try:
        # Use Supabase REST client for bulk insertion
        # Note: .execute() is MANDATORY for the request to be sent
        print("📦 SAMPLE ROW:", data[0] if data else "NO DATA")
        print(f"💾 Inserting {len(data)} rows into Supabase...")
        
        response = conn.table("distributors").insert(data).execute()

        # 🔍 DEBUG RESPONSE
        print("🔍 FULL RESPONSE:", response)

        if response.data:
            print(f"✅ ACTUAL INSERT SUCCESS: {len(response.data)} rows inserted.")
        else:
            print("❌ INSERT FAILED:", response)

    except Exception as e:
        print(f"❌ DATABASE ERROR: {e}")
        # If bulk fails, you might want to try one-by-one or just report the error
        raise e

