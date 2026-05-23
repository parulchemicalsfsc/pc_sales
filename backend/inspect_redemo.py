import os
from supabase_db import get_supabase

db = get_supabase()

try:
    print("Fetching distributor_redemo_history records with order...")
    res = (
        db.table("distributor_redemo_history")
        .select("*")
        .order("imported_at", desc=True)
        .execute()
    )
    print("Success! Number of records:", len(res.data))
    if res.data:
        print("First record keys:", res.data[0].keys())
except Exception as e:
    print("Error:", str(e))
