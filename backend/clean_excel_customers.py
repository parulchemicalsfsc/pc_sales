import re
from typing import Optional
import pandas as pd

# ---------------------------------------------------------------------------
# Column-name aliases
# ---------------------------------------------------------------------------
NAME_ALIASES    = {"name", "sabhasad name", "member name", "sabahsad name"}
MOBILE_ALIASES  = {"mobile", "number", "contact", "phone", "mobile no"}
CODE_ALIASES    = {"code", "customer code", "id", "sabhasad code"}

VILLAGE_ALIASES  = {"village", "gaon", "gram", "village name"}
TALUKA_ALIASES   = {"taluka", "taluko", "taluka name", "tehsil"}
DISTRICT_ALIASES = {"district", "district name", "jilla"}
STATE_ALIASES    = {"state", "rajya"}

HEADER_KEYWORDS = {"name", "mobile", "village", "code"}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _norm(text: str) -> str:
    """Lowercase + collapse whitespace + strip."""
    if pd.isna(text): return ""
    # Remove all non-alphanumeric chars except space for matching? 
    # Actually just strip and lowercase and collapse spaces is enough.
    return re.sub(r"\s+", " ", str(text).strip().lower())

def _match_col(norm_cols: list[str], aliases: set[str]) -> str | None:
    """Return the first normalised column name that matches an alias set."""
    for c in norm_cols:
        if c in aliases:
            return c
    return None

def _safe_str(value) -> str | None:
    if pd.isna(value):
        return None
    
    # Standardize to string
    s = str(value).strip()
    
    # Remove float decimal if it's .0 (common in Excel imports)
    if s.endswith(".0"):
        s = s[:-2]
    
    # Basic cleanup
    if not s or s.lower() in ["n/a", "na", "null", "none", "nil", "-", "."]:
        return None
        
    return s

def to_upper_safe(value):
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        return value.upper() if value else None
    return value

def clean_phone(value) -> Optional[str]:
    if pd.isna(value):
        return None
    s = str(value).strip()
    if s.lower() in ["n/a", "na", "null", "none", "nil", "-", "."]:
        return None
    if s.endswith(".0"):
        s = s[:-2]
    digits = re.sub(r"\D", "", s)
    if len(digits) == 10:
        return digits
    return None

# ---------------------------------------------------------------------------
# Main extraction function
# ---------------------------------------------------------------------------

def extract_sabhasad(filepath: str, sheet_name: int | str = 0) -> list[dict]:
    """
    Read a Sabhasad Excel file and return a list of cleaned records.
    Simplified single-header logic.
    """
    try:
        # Step 1: Read the first row to detect headers
        df = pd.read_excel(filepath, sheet_name=sheet_name, dtype=str)
    except Exception as exc:
        raise RuntimeError(f"Failed to open Excel file: {exc}") from exc

    # 🔍 DEBUG: Raw columns
    print(f"DEBUG: Raw columns found: {df.columns.tolist()}")

    # Step 2: Normalise column names
    original_cols = list(df.columns)
    df.columns = [_norm(c) for c in df.columns]
    norm_cols = list(df.columns)
    
    # 🔍 DEBUG: Normalised columns
    print(f"DEBUG: Normalised columns: {norm_cols}")
    
    # Step 3: Validate presence of minimum required fields
    col_name    = _match_col(norm_cols, NAME_ALIASES)
    col_mobile  = _match_col(norm_cols, MOBILE_ALIASES)
    col_village = _match_col(norm_cols, VILLAGE_ALIASES)
    
    # 🔍 DEBUG: Mapped columns
    mapped_dict = {
        "name": col_name,
        "mobile": col_mobile,
        "village": col_village
    }
    print(f"DEBUG: Mapped columns result: {mapped_dict}")
    
    if not df.empty:
        print(f"DEBUG: First row data (raw): {df.iloc[0].to_dict()}")

    hits = sum(1 for c in [col_name, col_mobile, col_village] if c is not None)
    if hits < 2:
        print(f"ERROR: Mapping failed. Hits={hits}. Required: Name, Mobile, Village.")
        return [] # Return empty instead of raising to avoid 500 if possible, or handle in loader

    # Step 4: Map remaining columns
    col_code     = _match_col(norm_cols, CODE_ALIASES)
    col_taluka   = _match_col(norm_cols, TALUKA_ALIASES)
    col_district = _match_col(norm_cols, DISTRICT_ALIASES)
    col_state    = _match_col(norm_cols, STATE_ALIASES)

    # Step 5: Process rows
    records = []
    for idx, row in df.iterrows():
        name = _safe_str(row[col_name]) if col_name else None
        village = _safe_str(row[col_village]) if col_village else None
        
        # Filtering: Skip rows where Name OR Village is missing
        if not name or not village:
            print(f"DEBUG: Skipping row {idx} due to missing Name ({name}) or Village ({village})")
            continue
            
        mobile = clean_phone(row[col_mobile]) if col_mobile else None
        
        record = {
            "customer_code": _safe_str(row[col_code]) if col_code else None,
            "name": to_upper_safe(name),
            "mobile": mobile,
            "village": to_upper_safe(village),
            "taluka": to_upper_safe(_safe_str(row[col_taluka])) if col_taluka else None,
            "district": to_upper_safe(_safe_str(row[col_district])) if col_district else None,
            "state": to_upper_safe(_safe_str(row[col_state])) if col_state else "GUJARAT",
            "status": "Active"
        }
        records.append(record)

    print(f"DEBUG: Final cleaned records count: {len(records)}")
    return records

