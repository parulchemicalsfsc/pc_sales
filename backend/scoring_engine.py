"""
Mantri Priority Scoring Engine — Standalone Module
Extracted from algorithm.py for reuse by the nightly scoring job,
the distribution pipeline, and the call-outcome feedback loop.

All scoring functions are identical to algorithm.py.
This module adds score_customer() and score_all_customers() for
batch scoring of customer dicts from the database.
"""

from datetime import datetime
import pandas as pd
import numpy as np


# ─────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────

WEIGHTS = {
    'season':   22,
    'payment':  22,
    'holder':   20,
    'business': 12,
    'sabhasad': 12,
    'support':  12,
}

DISPATCH_RANGES = [(10, 22), (20, 18), (30, 13), (45, 7)]
DISPATCH_AFTER_45 = 2
DEMO_RANGES = [(10, 22), (20, 18), (30, 13), (45, 7)]
DEMO_AFTER_45 = 2

MONTH_MAP = {
    'jan':1,'january':1,'feb':2,'february':2,'mar':3,'march':3,
    'apr':4,'april':4,'may':5,'jun':6,'june':6,'jul':7,'july':7,
    'aug':8,'august':8,'sep':9,'sept':9,'set':9,'september':9,
    'oct':10,'october':10,'nov':11,'november':11,'dec':12,'december':12,
}


# ─────────────────────────────────────────────────────────
# SCORING FUNCTIONS  (identical to algorithm.py)
# ─────────────────────────────────────────────────────────

def parse_season_months(period):
    if pd.isna(period): return []
    p = str(period).lower()
    found = sorted({v for k, v in MONTH_MAP.items() if k in p})
    if len(found) < 2: return found
    start, end = found[0], found[-1]
    if end >= start:
        return list(range(start, end + 1))
    else:
        return list(range(start, 13)) + list(range(1, end + 1))


def months_distance(current, season_months):
    if not season_months: return 99
    distances = []
    for sm in season_months:
        d = abs(current - sm)
        distances.append(min(d, 12 - d))
    return min(distances)


def score_season(period, current_month=None):
    if current_month is None:
        current_month = datetime.now().month
    season = parse_season_months(period)
    if not season:
        return 0
    w = WEIGHTS['season']
    if current_month in season:
        center = season[len(season) // 2]
        dist = abs(current_month - center)
        dist = min(dist, 12 - dist)
        if dist == 0: return w
        elif dist == 1: return round(w * 0.85, 2)
        else: return round(w * 0.73, 2)
    else:
        dist = months_distance(current_month, season)
        if dist == 1: return round(w * 0.40, 2)
        elif dist == 2: return round(w * 0.20, 2)
        elif dist == 3: return round(w * 0.07, 2)
        else: return 2


def parse_days(val):
    if pd.isna(val): return np.nan
    s = str(val).strip().lower()
    if s in ['-', '- ', '', 'nan', 'pending']: return np.nan
    try: return float(s)
    except: return np.nan


def days_to_score(days, ranges, after_max):
    if np.isnan(days): return np.nan
    for max_d, pts in ranges:
        if days <= max_d:
            return pts
    return after_max


def score_payment(demo_raw, dispatch_raw):
    dispatch = parse_days(dispatch_raw)
    demo = parse_days(demo_raw)
    d_score = days_to_score(dispatch, DISPATCH_RANGES, DISPATCH_AFTER_45)
    dm_score = days_to_score(demo, DEMO_RANGES, DEMO_AFTER_45)

    if not np.isnan(d_score) and not np.isnan(dm_score):
        return round((2 * d_score + 1 * dm_score) / 3, 2)
    elif not np.isnan(d_score):
        return round(d_score, 2)
    elif not np.isnan(dm_score):
        return round(dm_score * 0.7, 2)
    else:
        return 0


def score_holder(val):
    if pd.isna(val): return 0
    v = str(val).upper().strip()
    return {'H':20,'HIGH':20,'M':10,'MEDIUM':10,'L':5,'LOW':5}.get(v, 0)


def score_business(val):
    if pd.isna(val): return 0
    v = str(val).upper().strip()
    if 'YES' in v: return 12
    if 'MID' in v: return 7
    if 'NO' in v: return 0
    return 0


def score_sabhasad(val):
    if pd.isna(val): return 0
    v = str(val).upper().strip()
    if 'NOT' in v: return 0
    if 'AWARE' in v: return 12
    return 0


def score_support(val):
    if pd.isna(val): return 0
    v = str(val).upper().strip()
    if 'HIGH' in v: return 12
    if 'MEDIUM' in v or 'MED' in v: return 7
    if 'LOW' in v: return 2
    return 0


def priority_label(score):
    if score >= 75: return 'URGENT'
    if score >= 55: return 'HIGH'
    if score >= 35: return 'MEDIUM'
    return 'LOW'


# ─────────────────────────────────────────────────────────
# NEW: CUSTOMER-LEVEL SCORING
# ─────────────────────────────────────────────────────────

def score_customer(customer: dict) -> dict:
    """
    Score a single customer dict (keys = DB column names).

    Expected keys (all optional — missing ones score 0):
        delivery_period, demo_days, dispatch_days,
        high_low_holder, current_business,
        nature_sabhasad, support

    Returns a dict with:
        priority_score, priority_label,
        score_season, score_payment, score_holder,
        score_business, score_sabhasad, score_support
    """
    current_month = datetime.now().month

    s_season   = score_season(customer.get('delivery_period'), current_month)
    s_payment  = score_payment(customer.get('demo_days'), customer.get('dispatch_days'))
    s_holder   = score_holder(customer.get('high_low_holder'))
    s_business = score_business(customer.get('current_business'))
    s_sabhasad = score_sabhasad(customer.get('nature_sabhasad'))
    s_support  = score_support(customer.get('support'))

    total = round(s_season + s_payment + s_holder + s_business + s_sabhasad + s_support, 2)

    return {
        'priority_score':  total,
        'priority_label':  priority_label(total),
        'score_season':    s_season,
        'score_payment':   s_payment,
        'score_holder':    s_holder,
        'score_business':  s_business,
        'score_sabhasad':  s_sabhasad,
        'score_support':   s_support,
    }


def score_all_customers(customers: list) -> list:
    """
    Score every customer in the list.
    Merges the score dict into each customer dict and returns the list.
    """
    for cust in customers:
        scores = score_customer(cust)
        cust.update(scores)
    return customers
