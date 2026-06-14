"""
RFQ Intake Migration Script
Adds RFQ-specific columns to leads and quotations tables,
and creates the rfq-attachments Supabase Storage bucket.
"""
import os
import sys
import psycopg2
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
SUPABASE_DB_PASSWORD = os.getenv("SUPABASE_DB_PASSWORD")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ SUPABASE_URL and SUPABASE_KEY must be set in .env")
    sys.exit(1)

# Parse project ref from URL: https://<ref>.supabase.co
project_ref = SUPABASE_URL.replace("https://", "").split(".")[0]
DB_HOST = f"db.{project_ref}.supabase.co"
DB_USER = "postgres"
DB_NAME = "postgres"
DB_PORT = 5432


def run_migration():
    print("[*] Connecting to Supabase PostgreSQL...")
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            database=DB_NAME,
            user=DB_USER,
            password=SUPABASE_DB_PASSWORD,
            port=DB_PORT,
        )
        conn.autocommit = True
        cur = conn.cursor()
        print("[OK] Connected!")

        migrations = [
            # leads table — RFQ specifics
            "ALTER TABLE leads ADD COLUMN IF NOT EXISTS rfq_quantity INTEGER;",
            "ALTER TABLE leads ADD COLUMN IF NOT EXISTS rfq_material TEXT;",
            "ALTER TABLE leads ADD COLUMN IF NOT EXISTS rfq_delivery TEXT;",
            "ALTER TABLE leads ADD COLUMN IF NOT EXISTS attachment_url TEXT;",
            "ALTER TABLE leads ADD COLUMN IF NOT EXISTS attachment_name TEXT;",
            # quotations table — attachment on draft/committed
            "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS attachment_url TEXT;",
            "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS attachment_name TEXT;",
        ]

        for sql in migrations:
            print(f"  Running: {sql[:70]}...")
            cur.execute(sql)
            print("  [OK] Done")

        cur.close()
        conn.close()
        print("[OK] All DB migrations applied!")
    except Exception as e:
        print(f"[ERR] DB migration failed: {e}")
        sys.exit(1)


def create_storage_bucket():
    """Create the rfq-attachments bucket via Supabase Storage API if it doesn't exist."""
    print("\n[*] Creating Supabase Storage bucket 'rfq-attachments'...")
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

    # Check if bucket exists
    res = requests.get(f"{SUPABASE_URL}/storage/v1/bucket", headers=headers)
    if res.status_code == 200:
        existing = [b["name"] for b in res.json()]
        if "rfq-attachments" in existing:
            print("  [OK] Bucket 'rfq-attachments' already exists, skipping.")
            return
    else:
        print(f"  [WARN] Could not list buckets: {res.text}")

    # Create bucket
    payload = {
        "id": "rfq-attachments",
        "name": "rfq-attachments",
        "public": True,
        "file_size_limit": 10485760,  # 10MB in bytes
        "allowed_mime_types": [
            "application/pdf",
            "image/png",
            "image/jpeg",
            "application/octet-stream",  # .dwg, .dxf, .step
        ],
    }
    res = requests.post(f"{SUPABASE_URL}/storage/v1/bucket", json=payload, headers=headers)
    if res.status_code in (200, 201):
        print("  [OK] Bucket 'rfq-attachments' created successfully!")
    else:
        # May already exist or other issue
        print(f"  [WARN] Bucket creation response: {res.status_code} - {res.text}")
        print("  (This is OK if the bucket already exists)")


if __name__ == "__main__":
    run_migration()
    create_storage_bucket()
    print("\n[DONE] RFQ migration complete!")
