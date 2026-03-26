"""
clean_excel_distributors.py

Reads a messy Excel file and extracts structured distributor data
for insertion into the `distributors` PostgreSQL table.

Returns a list of dicts — no DB logic included.
"""

import re
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
                         "contact", "phone", "phone no"}
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


def _safe_int(value, default: int = 0) -> int:
    try:
        if pd.isna(value):
            return default
        return int(float(str(value).strip()))
    except (ValueError, TypeError):
        return default


def _safe_str(value) -> str | None:
    if pd.isna(value):
        return None
    s = str(value).strip()
    return s if s else None


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
        name, village, taluka, district,
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
        flat_cols = []
        for tup in df.columns:
            parts = [str(p).strip() for p in tup if not str(p).startswith("Unnamed")]
            flat_cols.append(" ".join(parts) if parts else str(tup[-1]))
        df.columns = flat_cols
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
        mantri_mobile = (_safe_str(row[col_mantri_mobile]) if col_mantri_mobile else None)

        # Normalise mobile: keep only digits, set None if empty / non-numeric
        if mantri_mobile:
            digits = re.sub(r"\D", "", mantri_mobile)
            mantri_mobile = digits if digits else None

        sabhasad_morning = _safe_int(row[col_morning]) if col_morning else 0
        sabhasad_evening = _safe_int(row[col_evening]) if col_evening else 0

        # Construct canonical name
        v_upper = village.upper().strip()
        t_upper = taluka.upper().strip()
        name = f"{v_upper} - {t_upper}" if v_upper and t_upper else (v_upper or t_upper)

        record = {
            "name":             name,
            "village":          village.upper() or None,
            "taluka":           taluka.upper()  or None,
            "district":         district.upper() if district else None,
            "mantri_name":      mantri_name.upper() if mantri_name else None,
            "mantri_mobile":    mantri_mobile,
            "sabhasad_morning": sabhasad_morning,
            "sabhasad_evening": sabhasad_evening,
        }
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
