import sys
import os

from supabase_db import supabase_client

try:
    print("Test 1: Simple count")
    res1 = supabase_client.table("notifications").select("notification_id", count="exact").eq("is_read", False).execute()
    print("Success 1 count:", res1.count)
except Exception as e:
    print("Fail 1", e)

try:
    print("Test 2: With OR")
    user_email = "yashtele2@gmail.com"
    res2 = supabase_client.table("notifications").select("notification_id", count="exact").eq("is_read", False).or_(f"user_email.eq.{user_email},user_email.is.null").execute()
    print("Success 2 count:", res2.count)
except Exception as e:
    print("Fail 2", e)
