import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from supabase_db import get_supabase
try:
    db = get_supabase()
    res = db.rpc('exec_sql', {'sql_query': 'SELECT 1 as test'})
    print("SUCCESS", res)
except Exception as e:
    print("ERROR", str(e))
