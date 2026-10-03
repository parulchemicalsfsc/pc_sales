
import os
import requests
import sys

def load_env():
    """Simple .env loader to avoid dependencies"""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if not os.path.exists(env_path):
        print(f"Warning: .env file not found at {env_path}")
        return {}
    
    env_vars = {}
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, value = line.split('=', 1)
                env_vars[key.strip()] = value.strip().strip('"').strip("'")
    return env_vars

def verify_schema():
    env = load_env()
    supabase_url = env.get("SUPABASE_URL")
    supabase_key = env.get("SUPABASE_KEY")

    if not supabase_url or not supabase_key:
        print("❌ Error: SUPABASE_URL or SUPABASE_KEY not found in .env")
        return False

    print(f"Connecting to Supabase: {supabase_url}")
    
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    # Test query for missing columns
    # We try to select the new columns from a single row
    # relevant cols: order_status, shipment_status, shipment_date, dispatch_date, delivery_date, tracking_number, sale_code, payment_terms
    url = f"{supabase_url}/rest/v1/sales?select=order_status,shipment_status,shipment_date,dispatch_date,delivery_date,tracking_number,sale_code,payment_terms&limit=1"
    
    try:
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            print("ALL Order Management columns exist in the database.")
            print("   (Query returned 200 OK)")
            return True
        else:
            print(f"Verification FAILED. Status: {response.status_code}")
            print(f"   Response: {response.text}")
            if "Could not find the " in response.text or "does not exist" in response.text:
                print("\n   >>> This confirms a column is MISSING. Check the response text for which one. <<<")
            return False
            
    except Exception as e:
        print(f"Connection Error: {e}")
        return False

if __name__ == "__main__":
    success = verify_schema()
    if not success:
        print("\nCRITICAL ACTION REQUIRED:")
        print("You MUST run the SQL script 'database/add_order_mgmt_columns.sql' in Supabase SQL Editor.")
        sys.exit(1)
    else:
        print("\nDatabase schema is correct. You are good to go! 🚀")
        sys.exit(0)
