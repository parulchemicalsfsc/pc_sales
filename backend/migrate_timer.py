import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from supabase_db import get_supabase

db = get_supabase()

sql = """
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS time_taken INTEGER;
ALTER TABLE calling_assignments ADD COLUMN IF NOT EXISTS call_started_at TIMESTAMP WITH TIME ZONE;
"""

try:
    res = db.rpc('exec_sql', {'sql_query': sql}).execute()
    print("Migration successful:", res)
except Exception as e:
    print("Failed to run migration via RPC:", e)
    
    # Try another way to just insert a dummy record to see if the columns exist or if we can alter via python
    # We really can't alter without RPC or service key
