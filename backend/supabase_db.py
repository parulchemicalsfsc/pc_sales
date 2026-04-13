import os
from typing import Any, Dict, Generator, List, Optional, Union

import requests
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables from .env file
load_dotenv()

# ======================
# Supabase Configuration
# ======================

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Validate that credentials are provided
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError(
        "SUPABASE_URL and SUPABASE_KEY must be set in .env file. "
        "Please check your .env file and ensure both values are provided."
    )

# Supabase REST API endpoint
SUPABASE_REST_URL = f"{SUPABASE_URL}/rest/v1"

# Default headers for all requests
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


# ======================
# Supabase Client Class
# ======================


class SupabaseClient:
    """Simple Supabase REST API client with persistent HTTP session (FIX-3)"""

    def __init__(self, url: str, key: str):
        self.url = url
        self.rest_url = f"{url}/rest/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        # FIX-3: Persistent session reuses TCP/TLS connections — avoids a full
        # handshake on every single DB query. Saves 200-500ms per API call.
        self._session = requests.Session()
        self._session.headers.update(self.headers)

    def table(self, table_name: str):
        """Return a table interface"""
        return SupabaseTable(self.rest_url, table_name, self.headers, self._session)

    def rpc(self, function_name: str, params: dict = None):
        """Call a PostgreSQL function"""
        url = f"{self.rest_url}/rpc/{function_name}"
        response = self._session.post(url, json=params or {}, headers=self.headers)
        response.raise_for_status()
        return response.json()


class SupabaseTable:
    """Interface for table operations"""

    def __init__(self, rest_url: str, table_name: str, headers: dict, session: requests.Session = None):
        self.rest_url = rest_url
        self.table_name = table_name
        self.headers = headers
        self.url = f"{rest_url}/{table_name}"
        self._select_query = "*"
        # Use the shared session from SupabaseClient if provided
        self._session = session or requests.Session()
        self._filters = []
        self._order = None
        self._limit = None
        self._offset = None
        self._count = None

    def select(self, columns: str = "*", count: str = None):
        """Select specific columns

        Args:
            columns: Columns to select (default "*")
            count: Count option - "exact", "planned", or "estimated"
        """
        self._select_query = columns
        self._count = count
        return self

    def eq(self, column: str, value: Any):
        """Filter: column equals value"""
        self._filters.append(f"{column}=eq.{value}")
        return self

    def neq(self, column: str, value: Any):
        """Filter: column not equals value"""
        self._filters.append(f"{column}=neq.{value}")
        return self

    def gt(self, column: str, value: Any):
        """Filter: column greater than value"""
        self._filters.append(f"{column}=gt.{value}")
        return self

    def gte(self, column: str, value: Any):
        """Filter: column greater than or equal to value"""
        self._filters.append(f"{column}=gte.{value}")
        return self

    def lt(self, column: str, value: Any):
        """Filter: column less than value"""
        self._filters.append(f"{column}=lt.{value}")
        return self

    def lte(self, column: str, value: Any):
        """Filter: column less than or equal to value"""
        self._filters.append(f"{column}=lte.{value}")
        return self

    def like(self, column: str, pattern: str):
        """Filter: column matches pattern (case-sensitive)"""
        self._filters.append(f"{column}=like.{pattern}")
        return self

    def ilike(self, column: str, pattern: str):
        """Filter: column matches pattern (case-insensitive)"""
        self._filters.append(f"{column}=ilike.{pattern}")
        return self

    def is_(self, column: str, value: Any):
        """Filter: column is value (for null checks)"""
        self._filters.append(f"{column}=is.{value}")
        return self

    def in_(self, column: str, values: list):
        """Filter: column in list of values"""
        values_str = ",".join(
            [f'"{v}"' if isinstance(v, str) else str(v) for v in values]
        )
        self._filters.append(f"{column}=in.({values_str})")
        return self

    def or_(self, filters: str):
        """Filter: logical OR"""
        self._filters.append(f"or=({filters})")
        return self

    def order(self, column: str, desc: bool = False):
        """Order results"""
        self._order = f"{column}.{'desc' if desc else 'asc'}"
        return self

    def limit(self, count: int):
        """Limit number of results"""
        self._limit = count
        return self

    def offset(self, count: int):
        """Offset results"""
        self._offset = count
        return self

    def range(self, start: int, end: int):
        """Set range for pagination (alternative to limit/offset)"""
        self._offset = start
        self._limit = end - start + 1
        return self

    def execute(self):
        """Execute the query"""
        # Use a list of tuples instead of a dict so that multiple filters
        # on the same column (e.g. created_at gte AND lte) are preserved.
        # PostgREST supports repeated query parameter keys.
        params = [("select", self._select_query)]

        # Add filters
        for filter_str in self._filters:
            key = filter_str.split("=")[0]
            value = "=".join(filter_str.split("=")[1:])
            params.append((key, value))

        # Add order
        if self._order:
            params.append(("order", self._order))

        # Add limit
        if self._limit:
            params.append(("limit", str(self._limit)))

        # Add offset
        if self._offset:
            params.append(("offset", str(self._offset)))

        # Prepare headers with count preference if specified
        headers = self.headers.copy()
        if self._count:
            headers["Prefer"] = f"count={self._count}"

        response = self._session.get(self.url, params=params, headers=headers)
        response.raise_for_status()

        # Extract count from Content-Range header if present
        count = None
        if "Content-Range" in response.headers:
            # Format: "0-24/573" or "*/573" or "0-24/*"
            content_range = response.headers["Content-Range"]
            if "/" in content_range:
                count_str = content_range.split("/")[1]
                # Handle cases where count is "*" (unknown)
                if count_str != "*" and count_str.isdigit():
                    count = int(count_str)

        return SupabaseResponse(response.json(), count=count)

    def insert(
        self, data: Union[Dict[str, Any], List[Dict[str, Any]]], upsert: bool = False
    ):
        """Insert data into table

        Args:
            data: Dictionary or list of dictionaries to insert
            upsert: If True, use upsert mode (insert or update on conflict)
        """
        # Ensure data is a list
        if isinstance(data, dict):
            data = [data]

        headers = self.headers.copy()
        if upsert:
            # Use upsert mode - will update on conflict
            headers["Prefer"] = "resolution=merge-duplicates,return=representation"

        response = self._session.post(self.url, json=data, headers=headers)
        response.raise_for_status()

        # Return a new table instance so execute() can be called if needed
        result = SupabaseTableResult(response.json())
        return result

    def upsert(self, data: Union[Dict[str, Any], List[Dict[str, Any]]]):
        """Upsert data (insert or update on conflict)"""
        return self.insert(data, upsert=True)

    def update(self, data: Dict[str, Any]):
        """Update records"""
        # Build query string with filters
        query_params = {}
        for filter_str in self._filters:
            key = filter_str.split("=")[0]
            value = "=".join(filter_str.split("=")[1:])
            query_params[key] = value

        response = self._session.patch(
            self.url, json=data, params=query_params, headers=self.headers
        )
        response.raise_for_status()

        # Return a new table instance so execute() can be called if needed
        result = SupabaseTableResult(response.json())
        return result

    def delete(self):
        """Delete records"""

        # Build query string with filters

        query_params = {}

        for filter_str in self._filters:
            key = filter_str.split("=")[0]

            value = "=".join(filter_str.split("=")[1:])

            query_params[key] = value

        try:
            response = self._session.delete(
                self.url, params=query_params, headers=self.headers
            )

            response.raise_for_status()

        except requests.HTTPError as e:
            err_text = (
                e.response.text
                if hasattr(e, "response") and e.response is not None
                else str(e)
            )
            raise requests.HTTPError(
                f"DELETE {self.url} failed: {err_text}", response=e.response
            )

        # Return a new table instance so execute() can be called if needed

        # Some DELETE responses may have no content (204 No Content). Handle gracefully.
        data = (
            response.json()
            if response.content is not None
            and response.content.strip() != b""
            and response.text.strip() != ""
            else []
        )
        result = SupabaseTableResult(data)
        return result


class SupabaseResponse:
    """Wrapper for response data"""

    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class SupabaseTableResult:
    """Result object that can be used with or without execute()"""

    def __init__(self, data):
        self.data = data

    def execute(self):
        """
        Execute method for compatibility.
        Since the request was already made, just return self.
        """
        return self


# Global Supabase client instance
supabase_client = SupabaseClient(SUPABASE_URL, SUPABASE_KEY)


# ======================
# Database Connection
# ======================


def get_supabase() -> SupabaseClient:
    """
    Returns the Supabase client instance.
    This replaces the SQLite get_db() function.
    """
    return supabase_client


def get_db() -> Generator[SupabaseClient, None, None]:
    """
    Generator function for dependency injection in FastAPI.
    Yields the Supabase client.
    """
    try:
        yield supabase_client
    finally:
        # Supabase REST API doesn't need explicit closing
        pass


# ======================
# Database Initialization
# ======================


def init_supabase_db():
    """
    Initialize Supabase database with all required tables.
    Prints SQL schema to be executed in Supabase SQL Editor.
    """

    sql_schema = """
    -- ===================================
    -- Customers Table
    -- ===================================
    CREATE TABLE IF NOT EXISTS customers (
        customer_id SERIAL PRIMARY KEY,
        customer_code TEXT UNIQUE,
        name TEXT NOT NULL,
        mobile TEXT,
        village TEXT,
        taluka TEXT,
        district TEXT,
        state TEXT DEFAULT 'Gujarat',
        adhar_no TEXT,
        status TEXT DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- ===================================
    -- Products Table
    -- ===================================
    CREATE TABLE IF NOT EXISTS products (
        product_id SERIAL PRIMARY KEY,
        product_name TEXT NOT NULL,
        packing_type TEXT,
        capacity_ltr REAL,
        category TEXT,
        standard_rate REAL,
        rate_gujarat REAL,
        rate_maharashtra REAL,
        rate_mp REAL,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- ===================================
    -- Distributors Table
    -- ===================================
    CREATE TABLE IF NOT EXISTS distributors (
        distributor_id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        village TEXT,
        taluka TEXT,
        district TEXT,
        mantri_name TEXT,
        mantri_mobile TEXT,
        sabhasad_count INTEGER DEFAULT 0,
        contact_in_group INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- ===================================
    -- Sales Table
    -- ===================================
    CREATE TABLE IF NOT EXISTS sales (
        sale_id SERIAL PRIMARY KEY,
        invoice_no TEXT,
        customer_id INTEGER,
        sale_date TEXT NOT NULL,
        total_amount REAL DEFAULT 0,
        total_liters REAL DEFAULT 0,
        payment_status TEXT DEFAULT 'Pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
    );

    -- ===================================
    -- Shopkeepers Table
    -- ===================================
    CREATE TABLE IF NOT EXISTS shopkeepers (
        shopkeeper_id SERIAL PRIMARY KEY,
        name TEXT,
        village TEXT,
        taluka TEXT,
        district TEXT,
        mantri_name TEXT,
        mantri_mobile TEXT,
        sabhasad_count INTEGER DEFAULT 0,
        contact_in_group INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- ===================================
    -- Doctors Table
    -- ===================================
    CREATE TABLE IF NOT EXISTS doctors (
        doctor_id SERIAL PRIMARY KEY,
        name TEXT,
        village TEXT,
        taluka TEXT,
        district TEXT,
        mantri_name TEXT,
        mantri_mobile TEXT,
        sabhasad_count INTEGER DEFAULT 0,
        contact_in_group INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- ===================================
    -- Sale Items Table
    -- ===================================
    CREATE TABLE IF NOT EXISTS sale_items (
        sale_item_id SERIAL PRIMARY KEY,
        sale_id INTEGER,
        product_id INTEGER,
        quantity INTEGER,
        rate REAL,
        amount REAL,
        FOREIGN KEY (sale_id) REFERENCES sales(sale_id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
    );

    -- ===================================
    -- Payments Table
    -- ===================================
    CREATE TABLE IF NOT EXISTS payments (
        payment_id SERIAL PRIMARY KEY,
        sale_id INTEGER,
        payment_date TEXT NOT NULL,
        payment_method TEXT,
        amount REAL NOT NULL,
        rrn TEXT,
        reference TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sale_id) REFERENCES sales(sale_id) ON DELETE CASCADE
    );

    -- ===================================
    -- Demos Table
    -- ===================================
    CREATE TABLE IF NOT EXISTS demos (
        demo_id SERIAL PRIMARY KEY,
        customer_id INTEGER,
        distributor_id INTEGER,
        demo_date TEXT NOT NULL,
        demo_time TEXT,
        product_id INTEGER,
        quantity_provided INTEGER,
        follow_up_date TEXT,
        conversion_status TEXT DEFAULT 'Scheduled',
        notes TEXT,
        demo_location TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
        FOREIGN KEY (distributor_id) REFERENCES distributors(distributor_id) ON DELETE SET NULL,
        FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
    );

    -- ===================================
    -- Shopkeepers Table
    -- ===================================
    CREATE TABLE IF NOT EXISTS shopkeepers (
        shopkeeper_id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        village TEXT,
        taluka TEXT,
        district TEXT,
        mantri_name TEXT,
        mantri_mobile TEXT,
        sabhasad_count INTEGER DEFAULT 0,
        sabhasad_morning INTEGER DEFAULT 0,
        sabhasad_evening INTEGER DEFAULT 0,
        contact_in_group INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        state TEXT,
        dairy_type TEXT,
        dairy_time_morning TEXT,
        dairy_time_evening TEXT,
        milk_collection_morning INTEGER,
        milk_collection_evening INTEGER,
        nature_of_sabhasad TEXT,
        support TEXT,
        animal_delivery_period TEXT,
        payment_recovery_demo INTEGER,
        payment_recovery_dispatch INTEGER,
        decision_maker_availability_morning TEXT,
        decision_maker_availability_evening TEXT,
        high_holder_to_low_holder_villages TEXT,
        current_status_of_business TEXT,
        record_date TEXT
    );

    -- ===================================
    -- Doctors Table
    -- ===================================
    CREATE TABLE IF NOT EXISTS doctors (
        doctor_id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        village TEXT,
        taluka TEXT,
        district TEXT,
        mantri_name TEXT,
        mantri_mobile TEXT,
        sabhasad_count INTEGER DEFAULT 0,
        sabhasad_morning INTEGER DEFAULT 0,
        sabhasad_evening INTEGER DEFAULT 0,
        contact_in_group INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        state TEXT,
        dairy_type TEXT,
        dairy_time_morning TEXT,
        dairy_time_evening TEXT,
        milk_collection_morning INTEGER,
        milk_collection_evening INTEGER,
        nature_of_sabhasad TEXT,
        support TEXT,
        animal_delivery_period TEXT,
        payment_recovery_demo INTEGER,
        payment_recovery_dispatch INTEGER,
        decision_maker_availability_morning TEXT,
        decision_maker_availability_evening TEXT,
        high_holder_to_low_holder_villages TEXT,
        current_status_of_business TEXT,
        record_date TEXT
    );

    -- ===================================
    -- Notifications Table
    -- ===================================
    CREATE TABLE IF NOT EXISTS notifications (
        notification_id SERIAL PRIMARY KEY,
        user_email VARCHAR(255),
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        notification_type VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50),
        entity_id INTEGER,
        action_url TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- ===================================
    -- Indexes for Performance
    -- ===================================
    CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
    CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
    CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
    CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(payment_status);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);
    CREATE INDEX IF NOT EXISTS idx_demos_customer ON demos(customer_id);
    CREATE INDEX IF NOT EXISTS idx_demos_status ON demos(conversion_status);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_email);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
    """

    print("=" * 60)
    print("SUPABASE DATABASE INITIALIZATION")
    print("=" * 60)
    print("\nPlease execute the following SQL in your Supabase Dashboard:")
    print("\n1. Go to: https://supabase.com/dashboard")
    print("2. Select your project")
    print("3. Click on 'SQL Editor' in the left sidebar")
    print("4. Click 'New Query'")
    print("5. Copy and paste the SQL below")
    print("6. Click 'Run' or press Ctrl+Enter")
    print("\n" + "=" * 60)
    print(sql_schema)
    print("=" * 60)

    # Try to verify connection
    try:
        response = (
            supabase_client.table("customers").select("customer_id").limit(1).execute()
        )
        print("\n✅ Connection to Supabase successful!")
        print("✅ Tables appear to be already created.")
    except Exception as e:
        print(f"\n⚠️  Connection test: {str(e)}")
        print("Please create the tables using the SQL above.")

    return sql_schema


# ======================
# Helper Functions
# ======================


def dict_from_row(row):
    """
    Converts a database row to a dictionary.
    Supabase REST API already returns dictionaries.
    """
    if isinstance(row, dict):
        return row
    return dict(row)


# ======================
# Migration Helper
# ======================


def print_migration_instructions():
    """
    Print instructions for migrating data from SQLite to Supabase.
    """
    print("\n" + "=" * 60)
    print("DATA MIGRATION INSTRUCTIONS")
    print("=" * 60)
    print("\nTo migrate your existing data from sales.db to Supabase:")
    print("\n1. First, initialize the Supabase database schema (see above)")
    print("2. Run the migration script: python migrate_to_supabase.py")
    print("3. This will copy all data from sales.db to Supabase")
    print("4. Verify the data in your Supabase dashboard")
    print("5. Update your application to use the new database")
    print("\n" + "=" * 60)



def get_supabase_admin() -> Client:
    """
    Return an authenticated Supabase client for admin operations.
    Requires SUPABASE_SERVICE_ROLE_KEY — the service role key from your Supabase project
    (Settings → API → service_role key). This is different from the anon key.
    The service role key bypasses Row Level Security and can call auth.admin APIs.
    """
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not service_key:
        raise ValueError(
            "SUPABASE_SERVICE_ROLE_KEY is not set in .env. "
            "Go to your Supabase project → Settings → API → copy the 'service_role' key "
            "and add it as SUPABASE_SERVICE_ROLE_KEY=<key> in the backend .env file."
        )
    return create_client(SUPABASE_URL, service_key)


if __name__ == "__main__":
    # When run directly, print the initialization SQL
    print("\n🚀 Initializing Supabase database...\n")
    init_supabase_db()
    print_migration_instructions()
