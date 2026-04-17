"""
clean_excel_distributors.py

Reads a messy Excel file and extracts structured distributor data
for insertion into the `distributors` PostgreSQL table.

Returns a list of dicts — no DB logic included.
"""

import re
from typing import Optional
import pandas as pd


# ---------------------------------------------------------------------------
# Column-name aliases
# ---------------------------------------------------------------------------
VILLAGE_ALIASES   = {"village", "village name", "gram", "gaon"}
TALUKA_ALIASES    = {"taluka", "taluko", "taluka name"}
DISTRICT_ALIASES  = {"district", "district name", "jilla"}
MANTRI_NAME_ALIASES   = {"mantri name", "mantry name", "mantri", "mantry name / distributors",
                         "distributor name", "distributors"}
MANTRI_MOBILE_ALIASES = {"mantri mobile", "mobile", "mobile no", "mobile number",
                         "contact", "phone", "phone no", "number"}
SABHASAD_MORNING_ALIASES = {"sabhasad morning", "morning", "sabhasad (morning)",
                             "sabhsad morning", "subhasad morning"}
SABHASAD_EVENING_ALIASES = {"sabhasad evening", "evening", "sabhasad (evening)",
                             "sabhsad evening", "subhasad evening"}

# Columns we silently ignore
IGNORED_ALIASES = {"sabhasad count", "sabhasad_count", "contact in group",
                   "contact_in_group"}

HEADER_KEYWORDS = {"village", "taluka", "gram", "mantri", "mantry",
                   "sabhasad", "district"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _norm(text: str) -> str:
    """Lowercase + collapse whitespace."""
    return re.sub(r"\s+", " ", str(text).strip().lower())


def _find_header_row(raw_df: pd.DataFrame) -> int:
    """
    Scan rows top-to-bottom and return the index of the first row
    that contains at least two header keywords.
    """
    for idx, row in raw_df.iterrows():
        row_text = " ".join(_norm(v) for v in row.values if pd.notna(v))
        hits = sum(1 for kw in HEADER_KEYWORDS if kw in row_text)
        if hits >= 2:
            print(f"[DEBUG] Detected header row index: {idx}")
            return idx
    raise ValueError(
        "Could not detect a header row — no row contained ≥2 header keywords "
        f"({HEADER_KEYWORDS})."
    )


def _resolve_split_sabhasad(cols: list[str]) -> tuple[str | None, str | None]:
    """
    Handle the case where 'sabhasad' spans two sub-columns named generically
    (e.g. 'sabhasad', 'sabhasad.1') whose actual meaning (morning/evening)
    can only be inferred from order.
    Returns (morning_col, evening_col) or (None, None).
    """
    sabhasad_cols = [c for c in cols if "sabhasad" in c and
                     c not in SABHASAD_MORNING_ALIASES and
                     c not in SABHASAD_EVENING_ALIASES]
    if len(sabhasad_cols) >= 2:
        print(f"[DEBUG] Inferred morning={sabhasad_cols[0]!r}, "
              f"evening={sabhasad_cols[1]!r} from generic sabhasad columns")
        return sabhasad_cols[0], sabhasad_cols[1]
    return None, None


def _match_col(norm_cols: list[str], aliases: set[str]) -> str | None:
    """Return the first normalised column name that matches an alias set."""
    for c in norm_cols:
        if c in aliases:
            return c
    return None


def _match_col_flexible(norm_cols: list[str], keyword: str, must_not_have: str | None = None) -> str | None:
    """Return the first column that contains the keyword, optionally excluding another."""
    for c in norm_cols:
        if keyword in c:
            if must_not_have and must_not_have in c:
                continue
            return c
    return None


def parse_date(value) -> Optional[str]:
    if pd.isna(value): return None
    try:
        return pd.to_datetime(value).strftime("%Y-%m-%d")
    except:
        return None


def parse_time(value) -> Optional[str]:
    if pd.isna(value): return None
    if hasattr(value, 'strftime'):
        return value.strftime("%H:%M")
    s = str(value).strip()
    try:
        # pd.to_datetime is usually smart enough for %H:%M or %I:%M %p
        return pd.to_datetime(s).strftime("%H:%M")
    except:
        return None


def _safe_int(value, default=None):
    if pd.isna(value):
        return default
    try:
        s = str(value).strip()
        if not s or s.lower() in ["n/a", "na", "null", "none", "nil", "-", "."]:
            return default
        return int(float(s))
    except (ValueError, TypeError):
        return default


def _safe_str(value) -> str | None:
    if pd.isna(value):
        return None
    s = str(value).strip()
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
    """
    Robustly clean and validate a 10-digit phone number.
    - If null -> return None
    - Convert to string
    - Strip spaces
    - Remove ".0" suffix if present
    - Remove all non-digit characters
    - Validate length = 10 digits
    - Return cleaned number
    - Else return None
    """
    if pd.isna(value):
        return None

    # Convert to string and strip spaces
    s = str(value).strip()

    # Handle common placeholders for missing data
    if s.lower() in ["n/a", "na", "null", "none", "nil", "-", "."]:
        return None

    # Remove ".0" suffix (often from Pandas reading float)
    if s.endswith(".0"):
        s = s[:-2]

    # Keep only digits
    digits = re.sub(r"\D", "", s)

    # Validate length
    if len(digits) == 10:
        return digits

    return None


# ---------------------------------------------------------------------------
# Main function
# ---------------------------------------------------------------------------

def extract_distributors(filepath: str, sheet_name: int | str = 0) -> list[dict]:
    """
    Read a messy Excel file and return a list of distributor dicts ready
    for insertion into the `distributors` table.

    Parameters
    ----------
    filepath   : path to the .xlsx / .xls file
    sheet_name : sheet index or name (default: first sheet)

    Returns
    -------
    list of dicts with keys:
        village, taluka, district,
        mantri_name, mantri_mobile,
        sabhasad_morning, sabhasad_evening
    """

    # ── Step 1: Raw read (no header assumption) ──────────────────────────────
    try:
        raw_df = pd.read_excel(filepath, sheet_name=sheet_name, header=None)
    except Exception as exc:
        raise RuntimeError(f"Failed to open Excel file: {exc}") from exc

    # ── Step 2: Detect header row ─────────────────────────────────────────────
    header_row_idx = _find_header_row(raw_df)

    # ── Step 3: Re-read with correct header ───────────────────────────────────
    df = pd.read_excel(
        filepath,
        sheet_name=sheet_name,
        header=header_row_idx,
    )

    # ── Step 4: Handle multi-level (merged) column headers ────────────────────
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [
            " ".join([str(i).strip() for i in col if pd.notna(i) and str(i).strip() and "unnamed" not in str(i).lower()])
            if isinstance(col, tuple)
            else str(col)
            for col in df.columns
        ]
    else:
        cols = list(df.columns)
        last_named = ""
        resolved = []
        for c in cols:
            s = str(c).strip()
            if s.startswith("Unnamed:") or s == "nan":
                resolved.append(f"{last_named} sub")
            else:
                resolved.append(s)
                last_named = s
        df.columns = resolved

    # ── Step 5: Normalise column names ────────────────────────────────────────
    df.columns = [_norm(c) for c in df.columns]
    norm_cols: list[str] = list(df.columns)
    print(f"[DEBUG] Normalised column names: {norm_cols}")

    # ── Step 6: Map normalised names to target fields ─────────────────────────
    col_village  = _match_col(norm_cols, VILLAGE_ALIASES)
    col_taluka   = _match_col(norm_cols, TALUKA_ALIASES)
    col_district = _match_col(norm_cols, DISTRICT_ALIASES)
    col_mantri_name   = _match_col(norm_cols, MANTRI_NAME_ALIASES)
    col_mantri_mobile = _match_col(norm_cols, MANTRI_MOBILE_ALIASES)
    col_morning  = _match_col(norm_cols, SABHASAD_MORNING_ALIASES)
    col_evening  = _match_col(norm_cols, SABHASAD_EVENING_ALIASES)

    # New Fields - Flexible Matching
    col_record_date = _match_col_flexible(norm_cols, "date")
    col_state = _match_col_flexible(norm_cols, "state")
    col_dairy_type = _match_col_flexible(norm_cols, "dairy type")
    
    col_nature = _match_col_flexible(norm_cols, "nature of sabhasad")
    col_support = _match_col_flexible(norm_cols, "support")
    col_animal_period = _match_col_flexible(norm_cols, "animal delivery")
    col_high_holder = _match_col_flexible(norm_cols, "high holder")
    col_current_status = _match_col_flexible(norm_cols, "current status")

    col_dairy_time_m = None
    col_dairy_time_e = None
    col_milk_m = None
    col_milk_e = None
    col_recovery_demo = None
    col_recovery_dispatch = None
    col_dm_avail_m = None
    col_dm_avail_e = None

    for col in norm_cols:
        col_lower = col.lower()
        
        # Payment Recovery
        if "payment recovery" in col_lower and ("demo" in col_lower or "sub" not in col_lower and not col_recovery_demo):
            col_recovery_demo = col
        elif "payment recovery" in col_lower and ("dispatch" in col_lower or "sub" in col_lower):
            col_recovery_dispatch = col

        # Decision Maker
        if "decision maker" in col_lower and ("morning" in col_lower or ("evening" not in col_lower and "sub" not in col_lower and not col_dm_avail_m)):
            col_dm_avail_m = col
        elif "decision maker" in col_lower and ("evening" in col_lower or "sub" in col_lower):
            col_dm_avail_e = col

        # Dairy Time
        if "dairy time" in col_lower and ("morning" in col_lower or ("evening" not in col_lower and "sub" not in col_lower and not col_dairy_time_m)):
            col_dairy_time_m = col
        elif "dairy time" in col_lower and ("evening" in col_lower or "sub" in col_lower):
            col_dairy_time_e = col
            
        # Milk Collection
        if "milk collection" in col_lower and ("morning" in col_lower or ("evening" not in col_lower and "sub" not in col_lower and not col_milk_m)):
            col_milk_m = col
        elif "milk collection" in col_lower and ("evening" in col_lower or "sub" in col_lower):
            col_milk_e = col

    print("📊 AVAILABLE COLUMNS:", norm_cols)
    print("✅ MATCHED DEMO:", col_recovery_demo)
    print("✅ MATCHED DISPATCH:", col_recovery_dispatch)

    # Fallback: infer morning/evening from generic split sabhasad columns
    if col_morning is None or col_evening is None:
        inferred_morning, inferred_evening = _resolve_split_sabhasad(norm_cols)
        col_morning = col_morning or inferred_morning
        col_evening = col_evening or inferred_evening

    if col_village is None and col_taluka is None:
        raise ValueError(
            "Neither 'village' nor 'taluka' column could be found after "
            f"normalisation. Available columns: {norm_cols}"
        )

    # ── Step 7: Drop rows where BOTH village and taluka are missing ───────────
    def _both_missing(row: pd.Series) -> bool:
        v = _safe_str(row[col_village])  if col_village  else None
        t = _safe_str(row[col_taluka])   if col_taluka   else None
        return v is None and t is None

    df = df[~df.apply(_both_missing, axis=1)].reset_index(drop=True)

    # ── Step 8: Build output records ─────────────────────────────────────────
    records: list[dict] = []

    for _, row in df.iterrows():
        village  = (_safe_str(row[col_village])  if col_village  else None) or ""
        taluka   = (_safe_str(row[col_taluka])   if col_taluka   else None) or ""
        district = (_safe_str(row[col_district]) if col_district else None)
        mantri_name   = (_safe_str(row[col_mantri_name])   if col_mantri_name   else None)
        raw_mobile_value = row[col_mantri_mobile] if col_mantri_mobile else None
        mantri_mobile = clean_phone(raw_mobile_value)

        # 📞 DEBUG LOGS
        print(f"📞 RAW PHONE: {raw_mobile_value}")
        print(f"📞 CLEANED PHONE: {mantri_mobile}")

        sabhasad_morning = _safe_int(row[col_morning]) if col_morning else None
        sabhasad_evening = _safe_int(row[col_evening]) if col_evening else None


        record = {
            "village":          to_upper_safe(village),
            "taluka":           to_upper_safe(taluka),
            "district":         to_upper_safe(district),
            "mantri_name":      to_upper_safe(mantri_name),
            "mantri_mobile":    mantri_mobile,
            "sabhasad_morning": sabhasad_morning,
            "sabhasad_evening": sabhasad_evening,
            
            # Additional Fields
            "record_date": parse_date(row[col_record_date]) if col_record_date else None,
            "state": to_upper_safe(_safe_str(row[col_state])) if col_state else None,
            "dairy_type": to_upper_safe(_safe_str(row[col_dairy_type])) if col_dairy_type else None,
            "dairy_time_morning": parse_time(row[col_dairy_time_m]) if col_dairy_time_m else None,
            "dairy_time_evening": parse_time(row[col_dairy_time_e]) if col_dairy_time_e else None,
            "milk_collection_morning": _safe_int(row[col_milk_m]) if col_milk_m else None,
            "milk_collection_evening": _safe_int(row[col_milk_e]) if col_milk_e else None,
            "nature_of_sabhasad": to_upper_safe(_safe_str(row[col_nature])) if col_nature else None,
            "support": to_upper_safe(_safe_str(row[col_support])) if col_support else None,
            "animal_delivery_period": to_upper_safe(_safe_str(row[col_animal_period])) if col_animal_period else None,
            "payment_recovery_demo": _safe_int(row[col_recovery_demo]) if col_recovery_demo else None,
            "payment_recovery_dispatch": _safe_int(row[col_recovery_dispatch]) if col_recovery_dispatch else None,
            "decision_maker_availability_morning": to_upper_safe(_safe_str(row[col_dm_avail_m])) if col_dm_avail_m else None,
            "decision_maker_availability_evening": to_upper_safe(_safe_str(row[col_dm_avail_e])) if col_dm_avail_e else None,
            "high_holder_to_low_holder_villages": to_upper_safe(_safe_str(row[col_high_holder])) if col_high_holder else None,
            "current_status_of_business": to_upper_safe(_safe_str(row[col_current_status])) if col_current_status else None,
        }
        
        # 📦 DEBUG LOG
        print("NORMALIZED RECORD:", record)
        records.append(record)

    print(f"[DEBUG] Extracted {len(records)} valid record(s).")
    return records


# ---------------------------------------------------------------------------
# Quick smoke-test (only runs when executed directly)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys, json

    path = sys.argv[1] if len(sys.argv) > 1 else "distributors.xlsx"
    data = extract_distributors(path)
    print(json.dumps(data, indent=2, ensure_ascii=False))
