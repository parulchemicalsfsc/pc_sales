from routers.demos import get_redemo_history
from supabase_db import get_supabase

db = get_supabase()

try:
    print("Executing get_redemo_history directly...")
    res = get_redemo_history(db=db)
    print("Success! Number of records returned:", len(res))
    if res:
        print("First record:", res[0])
except Exception as e:
    print("Error:", str(e))
