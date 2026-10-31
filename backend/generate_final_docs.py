# -*- coding: utf-8 -*-
"""
generate_final_docs.py
----------------------
Compiles the comprehensive, publication-grade documentation for Parul Chemicals FSC.
Outputs:
  - docs/PROJECT_DOCUMENTATION.md (Exhaustive Markdown Manual)
  - docs/Parul_Chemicals_Complete_System_Documentation.pdf (Complete Multi-Page PDF Manual)
"""

import os
import sys
import json
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
DOCS_DIR = os.path.join(ROOT_DIR, "docs")
os.makedirs(DOCS_DIR, exist_ok=True)

MD_PATH = os.path.join(DOCS_DIR, "PROJECT_DOCUMENTATION.md")
PDF_PATH = os.path.join(DOCS_DIR, "Parul_Chemicals_Complete_System_Documentation.pdf")

# 1. Load Extracted Endpoints
ROUTES_PATH = os.path.join(BASE_DIR, "scratch", "extracted_routes.json")
all_routes = []
if os.path.exists(ROUTES_PATH):
    with open(ROUTES_PATH, "r", encoding="utf-8") as f:
        all_routes = json.load(f)

print(f"[DOC GEN] Loaded {len(all_routes)} API routes.")

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        if self._pageNumber == 1:
            return  # Suppress running header/footer on title page
        
        self.saveState()
        # Running Header
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#0f172a"))
        self.drawString(45, A4[1] - 30, "PARUL CHEMICALS (PC-SALES) — SYSTEM DOCUMENTATION")
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        self.drawRightString(A4[0] - 45, A4[1] - 30, "ENTERPRISE SPECIFICATION | V2.4")
        
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.6)
        self.line(45, A4[1] - 35, A4[0] - 45, A4[1] - 35)

        # Running Footer
        self.line(45, 42, A4[0] - 45, 42)
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        self.drawString(45, 30, "CONFIDENTIAL — FOR INTERNAL USE ONLY")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(A4[0] - 45, 30, page_str)
        self.restoreState()

# 2. Database Tables Dictionary
DB_TABLES = [
    {
        "table": "customers",
        "pk": "customer_id (SERIAL)",
        "desc": "Master directory of Sabhasad (dairy cattle farmers). Stores personal credentials, geographic location, Aadhaar number, status, and cattle profile survey.",
        "cols": [
            ("customer_id", "SERIAL", "PRIMARY KEY", "Unique auto-incrementing customer identifier"),
            ("customer_code", "TEXT", "UNIQUE, NULLABLE", "Unique business code for farmer (e.g. CUST001, 1002)"),
            ("name", "TEXT", "NOT NULL", "Full legal name of the farmer / Sabhasad"),
            ("mobile", "TEXT", "INDEXED", "Validated 10-digit Indian mobile number"),
            ("village", "TEXT", "NULLABLE", "Village name in uppercase"),
            ("taluka", "TEXT", "NULLABLE", "Sub-district / Taluka name in uppercase"),
            ("district", "TEXT", "NULLABLE", "District name in uppercase"),
            ("state", "TEXT", "DEFAULT 'Gujarat'", "Operating state (Gujarat, Maharashtra, MP)"),
            ("adhar_no", "TEXT", "NULLABLE", "12-digit Aadhaar identification number"),
            ("status", "TEXT", "DEFAULT 'Active'", "Account status ('Active', 'Inactive')"),
            ("cattle_profile", "JSONB", "NULLABLE", "Structured survey (milking count, dry cows, breed, feed type)"),
            ("created_at", "TIMESTAMP", "CURRENT_TIMESTAMP", "Record timestamp")
        ]
    },
    {
        "table": "distributors",
        "pk": "distributor_id (SERIAL)",
        "desc": "Regional stockists, wholesalers, and dairy cooperative union distribution centers.",
        "cols": [
            ("distributor_id", "SERIAL", "PRIMARY KEY", "Unique distributor identifier"),
            ("name", "TEXT", "NOT NULL", "Commercial distributor / business entity name"),
            ("village", "TEXT", "NULLABLE", "Operating village / town"),
            ("taluka", "TEXT", "NULLABLE", "Sub-district / Taluka"),
            ("district", "TEXT", "NULLABLE", "District location"),
            ("mantri_name", "TEXT", "NULLABLE", "Key executive / Mantri / Secretary contact"),
            ("mantri_mobile", "TEXT", "NULLABLE", "Mobile number of key contact"),
            ("sabhasad_count", "INTEGER", "DEFAULT 0", "Total affiliated dairy farmers"),
            ("contact_in_group", "INTEGER", "DEFAULT 0", "Group member count"),
            ("status", "TEXT", "DEFAULT 'Active'", "Account status ('Active', 'Inactive')"),
            ("created_at", "TIMESTAMP", "CURRENT_TIMESTAMP", "Creation timestamp")
        ]
    },
    {
        "table": "shopkeepers",
        "pk": "shopkeeper_id (SERIAL)",
        "desc": "Agro-retailers and village animal husbandry supply stores.",
        "cols": [
            ("shopkeeper_id", "SERIAL", "PRIMARY KEY", "Unique shopkeeper identifier"),
            ("name", "TEXT", "NOT NULL", "Shop / Owner name"),
            ("village", "TEXT", "NULLABLE", "Village location"),
            ("taluka", "TEXT", "NULLABLE", "Taluka / Tehsil"),
            ("district", "TEXT", "NULLABLE", "District location"),
            ("mantri_name", "TEXT", "NULLABLE", "Owner / Manager name"),
            ("mantri_mobile", "TEXT", "NULLABLE", "Contact phone number"),
            ("sabhasad_count", "INTEGER", "DEFAULT 0", "Total linked Sabhasads"),
            ("sabhasad_morning", "INTEGER", "DEFAULT 0", "Morning session participants"),
            ("sabhasad_evening", "INTEGER", "DEFAULT 0", "Evening session participants"),
            ("milk_collection_morning", "INTEGER", "NULLABLE", "Daily morning collection in Liters"),
            ("milk_collection_evening", "INTEGER", "NULLABLE", "Daily evening collection in Liters"),
            ("nature_of_sabhasad", "TEXT", "NULLABLE", "Farmer cooperative category"),
            ("status", "TEXT", "DEFAULT 'Active'", "Store operational status")
        ]
    },
    {
        "table": "doctors",
        "pk": "doctor_id (SERIAL)",
        "desc": "Veterinary practitioners and dairy health advisors.",
        "cols": [
            ("doctor_id", "SERIAL", "PRIMARY KEY", "Unique veterinary doctor identifier"),
            ("name", "TEXT", "NOT NULL", "Doctor / Practitioner name"),
            ("village", "TEXT", "NULLABLE", "Clinic village / headquarters"),
            ("taluka", "TEXT", "NULLABLE", "Sub-district"),
            ("district", "TEXT", "NULLABLE", "District"),
            ("mantri_mobile", "TEXT", "NULLABLE", "Direct mobile number"),
            ("dairy_type", "TEXT", "NULLABLE", "Cooperative / Private / Independent"),
            ("support", "TEXT", "NULLABLE", "Clinical support type"),
            ("status", "TEXT", "DEFAULT 'Active'", "Active practitioner status")
        ]
    },
    {
        "table": "field_officers",
        "pk": "field_officer_id (SERIAL)",
        "desc": "On-ground sales representatives, route officers, and trial demonstration executors.",
        "cols": [
            ("field_officer_id", "SERIAL", "PRIMARY KEY", "Unique field officer identifier"),
            ("name", "TEXT", "NOT NULL", "Full officer name"),
            ("mobile", "TEXT", "NULLABLE", "Phone number"),
            ("assigned_districts", "TEXT", "NULLABLE", "Comma-separated assigned districts"),
            ("assigned_talukas", "TEXT", "NULLABLE", "Assigned sub-districts"),
            ("is_active", "BOOLEAN", "DEFAULT TRUE", "Employment active status"),
            ("created_at", "TIMESTAMP", "CURRENT_TIMESTAMP", "Onboarding timestamp")
        ]
    },
    {
        "table": "products",
        "pk": "product_id (SERIAL)",
        "desc": "Master catalog of veterinary nutrition products, feed supplements, and mineral mixtures.",
        "cols": [
            ("product_id", "SERIAL", "PRIMARY KEY", "Unique product identifier"),
            ("product_name", "TEXT", "NOT NULL", "Commercial product name (e.g. Cal-Plus, Parul Mix)"),
            ("packing_type", "TEXT", "NULLABLE", "Packaging format (Bottle, Jar, Can, Bag, Pouch)"),
            ("capacity_ltr", "REAL", "NULLABLE", "Package volume / weight in Liters or Kilograms"),
            ("category", "TEXT", "NULLABLE", "Category (Mineral Mixture, Liquid Calcium, Bolus, Tonic)"),
            ("standard_rate", "REAL", "NULLABLE", "Base national catalog price"),
            ("rate_gujarat", "REAL", "NULLABLE", "Specific regional rate for Gujarat"),
            ("rate_maharashtra", "REAL", "NULLABLE", "Specific regional rate for Maharashtra"),
            ("rate_mp", "REAL", "NULLABLE", "Specific regional rate for Madhya Pradesh"),
            ("custom_rates", "JSONB", "DEFAULT '{}'", "Dynamic custom rate mapping by state/tier"),
            ("is_active", "INTEGER", "DEFAULT 1", "Catalog availability flag (1=Active, 0=Archived)")
        ]
    },
    {
        "table": "sales",
        "pk": "sale_id (SERIAL)",
        "desc": "Official sales orders, commercial invoices, and customer billing master records.",
        "cols": [
            ("sale_id", "SERIAL", "PRIMARY KEY", "Unique sale order identifier"),
            ("invoice_no", "TEXT", "INDEXED", "Unique generated tax invoice number (INV-YYYY-XXXX)"),
            ("customer_id", "INTEGER", "FK -> customers", "Customer / Sabhasad buyer"),
            ("distributor_id", "INTEGER", "FK -> distributors", "Optional distributor buyer"),
            ("sale_date", "TEXT", "NOT NULL", "ISO date string (YYYY-MM-DD)"),
            ("total_amount", "REAL", "DEFAULT 0", "Gross invoice monetary amount (INR)"),
            ("total_liters", "REAL", "DEFAULT 0", "Total volume / mass sold"),
            ("payment_status", "TEXT", "DEFAULT 'Pending'", "Status ('Paid', 'Partial', 'Pending')"),
            ("shipment_status", "TEXT", "DEFAULT 'Pending'", "Dispatch status ('Pending', 'Dispatched', 'Delivered')"),
            ("notes", "TEXT", "NULLABLE", "Order remarks / dispatch instructions"),
            ("created_at", "TIMESTAMP", "CURRENT_TIMESTAMP", "Order timestamp")
        ]
    },
    {
        "table": "sale_items",
        "pk": "sale_item_id (SERIAL)",
        "desc": "Line items breakdown for sales orders.",
        "cols": [
            ("sale_item_id", "SERIAL", "PRIMARY KEY", "Unique line item identifier"),
            ("sale_id", "INTEGER", "FK -> sales", "Parent sale order link"),
            ("product_id", "INTEGER", "FK -> products", "Linked product"),
            ("quantity", "INTEGER", "NOT NULL", "Number of units ordered"),
            ("rate", "REAL", "NOT NULL", "Unit billing rate applied"),
            ("amount", "REAL", "NOT NULL", "Total amount (quantity * rate)")
        ]
    },
    {
        "table": "payments",
        "pk": "payment_id (SERIAL)",
        "desc": "Cash collections, bank transfers, and invoice settlements.",
        "cols": [
            ("payment_id", "SERIAL", "PRIMARY KEY", "Unique transaction identifier"),
            ("sale_id", "INTEGER", "FK -> sales", "Settled invoice reference"),
            ("payment_date", "TEXT", "NOT NULL", "Date payment received"),
            ("payment_method", "TEXT", "NULLABLE", "Method ('Cash', 'RTGS/NEFT', 'UPI', 'Cheque')"),
            ("amount", "REAL", "NOT NULL", "Payment amount in INR"),
            ("rrn", "TEXT", "NULLABLE", "Bank Reference / UPI RRN / Cheque number"),
            ("reference", "TEXT", "NULLABLE", "Internal accounting reference"),
            ("notes", "TEXT", "NULLABLE", "Receipt notes")
        ]
    },
    {
        "table": "demos",
        "pk": "demo_id (SERIAL)",
        "desc": "On-field product trials, sample provisions, and conversion tracking.",
        "cols": [
            ("demo_id", "SERIAL", "PRIMARY KEY", "Unique demo record identifier"),
            ("customer_id", "INTEGER", "FK -> customers", "Target farmer / Sabhasad"),
            ("distributor_id", "INTEGER", "FK -> distributors", "Associated distributor"),
            ("product_id", "INTEGER", "FK -> products", "Demonstrated product"),
            ("demo_date", "TEXT", "NOT NULL", "Scheduled / executed demo date"),
            ("quantity_provided", "INTEGER", "NULLABLE", "Trial sample quantity given"),
            ("follow_up_date", "TEXT", "NULLABLE", "Scheduled farmer check-in date"),
            ("conversion_status", "TEXT", "DEFAULT 'Scheduled'", "Status ('Scheduled', 'Completed', 'Converted', 'Lost')"),
            ("notes", "TEXT", "NULLABLE", "Farmer trial feedback & response")
        ]
    },
    {
        "table": "calling_assignments",
        "pk": "assignment_id (SERIAL)",
        "desc": "Daily lead and farmer calling distribution queue for telecallers.",
        "cols": [
            ("assignment_id", "SERIAL", "PRIMARY KEY", "Queue assignment record ID"),
            ("assigned_to", "TEXT", "NOT NULL", "Telecaller user email address"),
            ("customer_id", "INTEGER", "FK -> customers", "Assigned customer target"),
            ("distributor_id", "INTEGER", "NULLABLE", "Assigned distributor target"),
            ("entity_type", "TEXT", "DEFAULT 'customer'", "Target type ('customer' or 'distributor')"),
            ("priority_score", "REAL", "DEFAULT 0.0", "Computed urgency/value score (0.0 to 100.0)"),
            ("assigned_date", "DATE", "NOT NULL", "Assignment date for daily roster"),
            ("status", "TEXT", "DEFAULT 'pending'", "Status ('pending', 'completed', 'rescheduled')")
        ]
    },
    {
        "table": "call_logs",
        "pk": "log_id (SERIAL)",
        "desc": "Detailed record of telephonic interactions, call outcomes, and cattle survey questionnaires.",
        "cols": [
            ("log_id", "SERIAL", "PRIMARY KEY", "Call record identifier"),
            ("customer_id", "INTEGER", "NULLABLE", "Customer recipient link"),
            ("distributor_id", "INTEGER", "NULLABLE", "Distributor recipient link"),
            ("user_email", "TEXT", "NOT NULL", "Telecaller email who made call"),
            ("call_outcome", "TEXT", "NOT NULL", "Outcome ('Interested', 'Order Placed', 'Ringing', 'Busy', 'Invalid')"),
            ("notes", "TEXT", "NULLABLE", "Conversation notes & customer remarks"),
            ("called_at", "TIMESTAMP", "CURRENT_TIMESTAMP", "Call timestamp"),
            ("duration_seconds", "INTEGER", "DEFAULT 0", "Call duration in seconds"),
            ("survey_json", "JSONB", "NULLABLE", "Tri-lingual cattle survey response JSON"),
            ("next_follow_up", "TIMESTAMP", "NULLABLE", "Agreed callback date/time")
        ]
    },
    {
        "table": "telecaller_orders",
        "pk": "order_id (SERIAL)",
        "desc": "Telephonically captured sales orders awaiting managerial approval.",
        "cols": [
            ("order_id", "SERIAL", "PRIMARY KEY", "Telecaller order identifier"),
            ("customer_id", "INTEGER", "NOT NULL", "Target customer ID"),
            ("telecaller_email", "TEXT", "NOT NULL", "Creator telecaller email"),
            ("order_date", "DATE", "NOT NULL", "Order booking date"),
            ("total_amount", "REAL", "DEFAULT 0", "Total order monetary value"),
            ("status", "TEXT", "DEFAULT 'Pending'", "Approval state ('Pending', 'Approved', 'Rejected')"),
            ("notes", "TEXT", "NULLABLE", "Booking notes"),
            ("approved_by", "TEXT", "NULLABLE", "Manager email who authorized"),
            ("approved_at", "TIMESTAMP", "NULLABLE", "Managerial approval timestamp"),
            ("rejection_reason", "TEXT", "NULLABLE", "Reason if rejected")
        ]
    },
    {
        "table": "telecaller_order_items",
        "pk": "id (SERIAL)",
        "desc": "Line items breakdown for telecaller-booked orders.",
        "cols": [
            ("id", "SERIAL", "PRIMARY KEY", "Line item ID"),
            ("order_id", "INTEGER", "FK -> telecaller_orders", "Parent telecaller order ID"),
            ("product_id", "INTEGER", "FK -> products", "Ordered product"),
            ("quantity", "INTEGER", "NOT NULL", "Quantity ordered"),
            ("rate", "REAL", "NOT NULL", "Unit price applied"),
            ("amount", "REAL", "NOT NULL", "Total line item cost")
        ]
    },
    {
        "table": "telecaller_attendance",
        "pk": "id (SERIAL)",
        "desc": "Morning attendance logs determining daily call distribution eligibility.",
        "cols": [
            ("id", "SERIAL", "PRIMARY KEY", "Attendance record ID"),
            ("user_email", "TEXT", "NOT NULL", "Telecaller email"),
            ("attendance_date", "DATE", "NOT NULL", "Shift date"),
            ("is_present", "BOOLEAN", "DEFAULT FALSE", "Presence confirmation flag"),
            ("created_at", "TIMESTAMP", "CURRENT_TIMESTAMP", "Log timestamp")
        ]
    },
    {
        "table": "app_users",
        "pk": "user_id (SERIAL)",
        "desc": "Authenticated system user credentials, employee identity, and role assignment.",
        "cols": [
            ("user_id", "SERIAL", "PRIMARY KEY", "User account identifier"),
            ("email", "TEXT", "UNIQUE, NOT NULL", "Login email address"),
            ("name", "TEXT", "NOT NULL", "Full employee name"),
            ("role", "TEXT", "NOT NULL", "Assigned RBAC role key (e.g. admin, sales_manager)"),
            ("password_hash", "TEXT", "NOT NULL", "Bcrypt hashed password"),
            ("is_active", "BOOLEAN", "DEFAULT TRUE", "Account active flag"),
            ("created_at", "TIMESTAMP", "CURRENT_TIMESTAMP", "User creation date")
        ]
    },
    {
        "table": "roles",
        "pk": "role_id (SERIAL)",
        "desc": "System and custom RBAC security roles with fast-path permission arrays.",
        "cols": [
            ("role_id", "SERIAL", "PRIMARY KEY", "Role record identifier"),
            ("role_key", "TEXT", "UNIQUE, NOT NULL", "Machine identifier (e.g. 'sales_manager')"),
            ("display_name", "TEXT", "NOT NULL", "Human friendly title"),
            ("description", "TEXT", "NULLABLE", "Scope and responsibilities"),
            ("is_system", "BOOLEAN", "DEFAULT FALSE", "Protected immutable system role flag"),
            ("permission_keys", "TEXT[]", "DEFAULT '{}'", "Fast-path array of assigned permission keys"),
            ("created_at", "TIMESTAMP", "CURRENT_TIMESTAMP", "Role creation timestamp")
        ]
    },
    {
        "table": "permissions",
        "pk": "permission_id (SERIAL)",
        "desc": "Granular capability keys gating backend endpoints and frontend features.",
        "cols": [
            ("permission_id", "SERIAL", "PRIMARY KEY", "Permission record identifier"),
            ("permission_key", "TEXT", "UNIQUE, NOT NULL", "String key (e.g. 'create_sale')"),
            ("module", "TEXT", "NOT NULL", "Categorization module"),
            ("description", "TEXT", "NULLABLE", "Action authorized by permission")
        ]
    },
    {
        "table": "activity_logs",
        "pk": "log_id (SERIAL)",
        "desc": "Comprehensive forensic audit trail recording field-level before/after diffs.",
        "cols": [
            ("log_id", "SERIAL", "PRIMARY KEY", "Audit log identifier"),
            ("user_email", "TEXT", "NOT NULL", "Actor employee email"),
            ("action_type", "TEXT", "NOT NULL", "Action ('CREATE', 'UPDATE', 'DELETE', 'LOGIN')"),
            ("action_description", "TEXT", "NOT NULL", "Human readable action summary"),
            ("entity_type", "TEXT", "NULLABLE", "Entity ('customer', 'sale', 'doctor', etc.)"),
            ("entity_id", "INTEGER", "NULLABLE", "Target entity primary key"),
            ("entity_name", "TEXT", "NULLABLE", "Target entity label"),
            ("metadata", "JSONB", "NULLABLE", "Detailed JSON payload including field diffs"),
            ("ip_address", "TEXT", "NULLABLE", "Client IP address"),
            ("created_at", "TIMESTAMP", "CURRENT_TIMESTAMP", "Audit timestamp")
        ]
    },
    {
        "table": "tally_vouchers",
        "pk": "id (SERIAL)",
        "desc": "Synchronized financial accounting vouchers from TallyPrime / Tally 9.",
        "cols": [
            ("id", "SERIAL", "PRIMARY KEY", "Internal voucher ID"),
            ("guid", "TEXT", "UNIQUE", "Tally global unique identifier"),
            ("voucher_type", "TEXT", "INDEXED", "Type ('Sales', 'Receipt', 'Journal', 'Contra')"),
            ("voucher_number", "TEXT", "NULLABLE", "Tally invoice / voucher number"),
            ("date", "DATE", "NOT NULL", "Voucher accounting date"),
            ("amount", "REAL", "NOT NULL", "Monetary transaction total"),
            ("party_ledger_name", "TEXT", "NULLABLE", "Account / Debtor / Creditor ledger"),
            ("company_name", "TEXT", "NULLABLE", "Tally company division"),
            ("is_reconciled", "BOOLEAN", "DEFAULT FALSE", "CRM matching reconciliation flag"),
            ("synced_at", "TIMESTAMP", "CURRENT_TIMESTAMP", "Ingestion timestamp")
        ]
    },
    {
        "table": "recruitment_leads",
        "pk": "candidate_id (SERIAL)",
        "desc": "Job candidates and applicants within the HR recruitment funnel.",
        "cols": [
            ("candidate_id", "SERIAL", "PRIMARY KEY", "Applicant identifier"),
            ("name", "TEXT", "NOT NULL", "Candidate full name"),
            ("mobile", "TEXT", "NOT NULL", "Candidate phone number"),
            ("email", "TEXT", "NULLABLE", "Email address"),
            ("role_applied", "TEXT", "NOT NULL", "Position (Field Officer, Telecaller, Manager)"),
            ("experience_years", "REAL", "DEFAULT 0.0", "Total professional experience"),
            ("status", "TEXT", "DEFAULT 'Applied'", "Hiring stage ('Applied', 'Screening', 'Interview', 'Offered', 'Hired', 'Rejected')"),
            ("resume_url", "TEXT", "NULLABLE", "Storage link to resume document"),
            ("created_at", "TIMESTAMP", "CURRENT_TIMESTAMP", "Application date")
        ]
    },
    {
        "table": "user_sessions",
        "pk": "session_id (SERIAL)",
        "desc": "Active user sessions and heartbeat tracking for concurrency and security audit.",
        "cols": [
            ("session_id", "SERIAL", "PRIMARY KEY", "Session identifier"),
            ("user_email", "TEXT", "NOT NULL", "User email address"),
            ("login_time", "TIMESTAMP", "CURRENT_TIMESTAMP", "Initial session establishment"),
            ("last_heartbeat", "TIMESTAMP", "CURRENT_TIMESTAMP", "Most recent 60-second ping"),
            ("ip_address", "TEXT", "NULLABLE", "Client IP address"),
            ("user_agent", "TEXT", "NULLABLE", "Browser and operating system signature"),
            ("is_active", "BOOLEAN", "DEFAULT TRUE", "Live session state")
        ]
    }
]

print("Database schema definitions ready.")

# 3. All System Modules & Screen Mappings
MODULES_LIST = [
    {
        "id": "MOD-01",
        "name": "Authentication, RBAC & User Administration",
        "category": "Security & Administration",
        "route_prefixes": ["/api/admin", "/api/rbac", "/api/user-sessions", "/api/activity"],
        "screens": [
            ("Login Screen", "/login", "Login.tsx", "Public", "Credential verification, JWT/Header issuance, and role extraction."),
            ("User Management", "/user-management", "UserManagement.tsx", "view_users", "Account creation, active toggling, role assignment, and password resets."),
            ("Role Management", "/role-management", "RoleManagement.tsx", "manage_roles", "RBAC matrix to create custom roles and assign from 52 granular permissions."),
            ("Admin Overview", "/admin", "Admin.tsx", "view_activity_logs", "High-level administrative system metrics, database health, and server stats."),
            ("Activity Logs", "/activity", "Activity.tsx", "Authenticated", "Forensic audit trail with field-level before/after diffs, user email, and IP.")
        ],
        "tables": ["app_users", "roles", "permissions", "role_permissions", "activity_logs", "user_sessions"],
        "summary": "Governs system access, multi-tenant RBAC permissions, audit trail logging, and live session heartbeats.",
        "workflows": [
            "User logs in -> Credentials verified -> User permissions resolved and cached in memory (10-min TTL) and AuthContext.",
            "Client requests protected endpoint -> x-user-email checked -> Fast-path array checked in-memory without database hit.",
            "System mutations trigger ActivityLogger.log_update_with_diff() recording exact field changes into activity_logs.",
            "Browser sends 60-second heartbeat to maintain active session presence and audit concurrency."
        ]
    },
    {
        "id": "MOD-02",
        "name": "Sabhasad (Farmer / Customer) Management",
        "category": "Customer Relationship Management",
        "route_prefixes": ["/api/customers"],
        "screens": [
            ("Sabhasad Directory", "/customers", "Customers.tsx", "view_customers", "Master directory of 10,000+ dairy farmers with 7-field search, phone duplicate detection, and full CRUD.")
        ],
        "tables": ["customers", "call_logs", "sales", "demos"],
        "summary": "Core registry of dairy cattle farmers. Handles phone sanitization, customer code deduplication, location tagging, and purchase summaries.",
        "workflows": [
            "Farmer Onboarding: Form input -> Frontend phone validation -> Duplicate probe -> Backend +91/0 prefix strip -> DB insert.",
            "Customer Summary: Aggregates lifetime sales, paid amount, pending dues, cattle survey JSON, and last 20 call logs.",
            "Fuzzy Search: Debounced PostgREST ilike search across Name, Mobile, Village, Taluka, District, State, and Code."
        ]
    },
    {
        "id": "MOD-03",
        "name": "Channel Partner Network (Distributors, Shopkeepers, Doctors, Field Officers)",
        "category": "Channel & Field Operations",
        "route_prefixes": ["/api/distributors", "/api/shopkeepers", "/api/doctors", "/api/field-officers"],
        "screens": [
            ("Distributors Directory", "/distributors", "Distributors.tsx", "view_distributors", "Wholesalers and union distributors with linked Sabhasad counts and Mantri contacts."),
            ("Shopkeepers Directory", "/shopkeepers", "Shopkeepers.tsx", "view_shopkeepers", "Village agro-retailers with morning/evening milk collection volumes and participation counts."),
            ("Veterinary Doctors", "/doctors", "Doctors.tsx", "view_doctors", "Practicing veterinary surgeons, prescription history, and clinic associations."),
            ("Field Officers", "/field-officers", "FieldOfficers.tsx", "view_field_officers", "On-ground sales officers, territory assignments (districts/talukas), and demo execution.")
        ],
        "tables": ["distributors", "shopkeepers", "doctors", "field_officers"],
        "summary": "Manages the multi-tier agricultural distribution channel from cooperative unions down to village dairy collection centers.",
        "workflows": [
            "Distributor Registration: Mantri details, affiliated Sabhasad counts, and location mappings registered.",
            "Shopkeeper Tracking: Daily milk intake (morning vs evening), payment recovery demo vs dispatch tracking.",
            "Field Officer Route Allocation: Specific districts and talukas bound to officers for on-ground sales and demos."
        ]
    },
    {
        "id": "MOD-04",
        "name": "Product Catalog & Dynamic Regional Pricing",
        "category": "Product & Inventory Management",
        "route_prefixes": ["/api/products"],
        "screens": [
            ("Product Pricing Matrix", "/product-pricing", "ProductPricing.tsx", "manage_pricing", "Product master catalog with packaging types, capacity, and regional price tiers (Gujarat, Maharashtra, MP, Custom).")
        ],
        "tables": ["products", "product_regions"],
        "summary": "Maintains product formulas, packaging formats, and state-specific tiered pricing structures.",
        "workflows": [
            "Product Setup: Standard rates defined for baseline packaging (Bottles, Cans, Pouches, Bags).",
            "Regional Pricing: Pricing managers configure distinct state rates or custom JSON rate overrides.",
            "Order Rate Lookup: Automatically resolves the matching unit rate during order creation based on customer state."
        ]
    },
    {
        "id": "MOD-05",
        "name": "Sales Order Booking, Invoicing & Dispatch",
        "category": "Sales & Order Fulfillment",
        "route_prefixes": ["/api/sales", "/api/telecaller-orders"],
        "screens": [
            ("Sales & Invoicing", "/sales", "Sales.tsx", "view_sales", "Direct order desk with multi-item grid, auto-calculated regional rates, and printable invoice PDF generation."),
            ("Order Management", "/orders", "OrderManagement.tsx", "view_orders", "Managerial approval desk for telecaller-booked orders. Allows review, approval, or rejection with reason.")
        ],
        "tables": ["sales", "sale_items", "telecaller_orders", "telecaller_order_items"],
        "summary": "End-to-end sales lifecycle from telecaller booking and managerial validation to formal tax invoicing and dispatch.",
        "workflows": [
            "Telecaller Booking: Telecaller creates telecaller_order with line items -> enters 'Pending' queue.",
            "Managerial Approval: Sales Manager inspects order on OrderManagement -> approves order -> transforms into sales record.",
            "Direct Sale Booking: Staff creates direct sale -> Postgres trigger assigns next sequential invoice_no -> creates invoice PDF."
        ]
    },
    {
        "id": "MOD-06",
        "name": "Payment Collections & Financial Ledger",
        "category": "Finance & Collections",
        "route_prefixes": ["/api/payments"],
        "screens": [
            ("Payments Desk", "/payments", "Payments.tsx", "view_payments", "Collection register tracking receipts, payment methods (Cash, UPI, RTGS, Cheque), RRNs, and invoice balance updates.")
        ],
        "tables": ["payments", "sales"],
        "summary": "Handles customer debt recovery, partial payments, installment logging, and automated invoice payment status reconciliation.",
        "workflows": [
            "Payment Receipt: Collector logs amount received, payment method, bank RRN reference, and linked invoice.",
            "Automatic Status Update: Backend recalculates total payments against invoice -> flips payment_status to 'Paid' or 'Partial'.",
            "Collection Reports: Generates exportable summaries for daily cash flow and debtor aging."
        ]
    },
    {
        "id": "MOD-07",
        "name": "Product Demonstrations & Field Officer Scheduling",
        "category": "Field Marketing & Demos",
        "route_prefixes": ["/api/demos"],
        "screens": [
            ("Product Demo Logs", "/demos", "Demos.tsx", "view_demos", "Registry of product trials, sample quantities provided, farmer reactions, and conversion outcomes."),
            ("Demo Scheduler", "/demo-scheduler", "DemoScheduler.tsx", "view_demos", "Calendar scheduler assigning field officers to farmers for demonstration visits with time slots.")
        ],
        "tables": ["demos", "field_officers", "products", "customers"],
        "summary": "Coordinates on-farm product trials of cattle feed supplements, farmer feedback collection, and lead conversion.",
        "workflows": [
            "Trial Scheduling: Farmer requested trial -> Scheduler assigns field officer, product, and scheduled visit date/time.",
            "Execution & Sampling: Officer conducts demo, provides sample pack (e.g. 1 kg Mineral Mixture), logs observations.",
            "Trial Conversion: Follow-up call verifies results -> converts successful trial into regular monthly orders."
        ]
    },
    {
        "id": "MOD-08",
        "name": "Automated Call Distribution & Telecaller Duty Roster",
        "category": "Telecalling Operations",
        "route_prefixes": ["/api/automation", "/api/attendance"],
        "screens": [
            ("Call Distribution", "/call-distribution", "CallDistribution.tsx", "run_call_distribution", "Workload balancer, 10 AM automatic assignment, telecaller capacity monitor, and priority scoring."),
            ("Telecaller Calling List", "/calling-list", "CallingList.tsx", "view_calling_list", "Telecaller terminal with click-to-call, customer profile, call outcome logging, and tri-lingual survey form.")
        ],
        "tables": ["calling_assignments", "telecaller_attendance", "duty_sheet_log", "call_logs"],
        "summary": "Intelligent, load-aware call distribution engine balancing customer calls among telecallers every morning.",
        "workflows": [
            "Morning Duty Sheet: Telecallers mark morning attendance -> Only present telecallers are eligible for assignments.",
            "10:00 AM Cron Distribution: System evaluates unassigned customers -> computes priority score -> assigns balanced batches.",
            "Call Execution: Telecaller calls farmer -> selects outcome ('Interested', 'Order Placed', 'Ringing', etc.) -> records cattle survey."
        ]
    },
    {
        "id": "MOD-09",
        "name": "AI Voice-to-Text & Call Intelligence Engine",
        "category": "Artificial Intelligence & Voice",
        "route_prefixes": ["/api/call-logger"],
        "screens": [
            ("Voice Input Component", "Global Component", "VoiceTextField.tsx", "Global", "Universal microphone dictation supporting Gujarati, Hindi, and English with real-time waveform and Alt+V shortcut.")
        ],
        "tables": ["call_logs"],
        "summary": "Vernacular voice dictation engine integrating Web Speech API and Sarvam AI models for multilingual dairy farming terminology.",
        "workflows": [
            "Live Speech Recognition: User speaks -> Browser speech recognition streams interim transcripts -> merges with existing input.",
            "Sarvam AI Audio Fallback: MediaRecorder chunks sent to backend Sarvam AI service for high-accuracy vernacular transcription.",
            "Cattle Survey Ingestion: Voice responses parsed into structured cattle_profile JSON attached to customer records."
        ]
    },
    {
        "id": "MOD-10",
        "name": "Lead Pipeline & CRM Workspace",
        "category": "Lead Management & Sales Funnel",
        "route_prefixes": ["/api/leads"],
        "screens": [
            ("Lead Dashboard", "/lead-dashboard", "LeadDashboard.tsx", "view_lead_dashboard", "Lead funnel metrics, channel acquisition breakdown, conversion rates, and pipeline health."),
            ("Lead Kanban Pipeline", "/leads", "LeadPipeline.tsx", "view_all_leads", "Drag-and-drop visual pipeline across stages: New, Contacted, Qualified, Demo, Won, Lost."),
            ("Lead Detail Workspace", "/lead-workspace", "LeadWorkspace.tsx", "work_leads", "Individual lead detail cockpit with interaction timeline, follow-up scheduling, and quotation drafting."),
            ("Lead History", "/lead-history", "LeadHistory.tsx", "work_leads", "Full chronological audit log of all communications, calls, and status shifts for a lead.")
        ],
        "tables": ["customers", "call_logs", "notes", "demos"],
        "summary": "Comprehensive CRM sales funnel tracking prospects from initial inquiry to qualified Sabhasad buyer.",
        "workflows": [
            "Lead Capture: Inbound inquiries from marketing or exhibitions recorded with source and dairy size.",
            "Stage Progression: Sales rep works lead through Kanban stages -> logs follow-up dates and task reminders.",
            "Conversion: Won leads automatically transition into active Sabhasad records with first order booking."
        ]
    },
    {
        "id": "MOD-11",
        "name": "Tally ERP Integration & Voucher Reconciliation",
        "category": "ERP Integration & Accounting",
        "route_prefixes": ["/api/tally"],
        "screens": [
            ("Tally Data Integration", "/tally-data", "TallyData.tsx", "view_tally_data", "Sync station for TallyPrime/Tally 9 XML & Excel vouchers. Reconciles Sales, Receipts, and Journal entries.")
        ],
        "tables": ["tally_vouchers", "sales", "payments"],
        "summary": "Bridges the operational PC-Sales CRM with corporate Tally ERP financial ledgers.",
        "workflows": [
            "Voucher Ingestion: Batch import of XML/Excel voucher dumps exported from Tally ERP.",
            "Cross-Reconciliation: Matches Tally Sales/Receipt vouchers with CRM invoices and payments by date, party, and amount.",
            "Audit & Cleanup: Soft-deletes superseded entries and identifies unmatched financial discrepancies."
        ]
    },
    {
        "id": "MOD-12",
        "name": "Excel Data Import & Ingestion Pipeline",
        "category": "Data Engineering & Migration",
        "route_prefixes": ["/api/imports"],
        "screens": [
            ("Data Import Hub", "/import", "DataImport.tsx", "import_data", "Bulk ingestion station with fuzzy alias matching, data validation preview, conflict detection, and batch insertion.")
        ],
        "tables": ["import_history", "customers", "distributors"],
        "summary": "Enterprise data ingestion engine transforming messy legacy spreadsheets into clean database records.",
        "workflows": [
            "Spreadsheet Upload: User uploads raw Excel (.xlsx, .xls) containing farmer or distributor lists.",
            "Preprocessing & Alias Resolution: Python backend maps aliases (e.g. 'Farmer Name' -> 'name'), parses phone numbers, infers morning/evening split columns.",
            "Preview Grid: Frontend highlights duplicates, validation warnings, and new rows for user confirmation.",
            "Batch Ingestion: One-click commit inserts validated rows and creates permanent audit entry in import_history."
        ]
    },
    {
        "id": "MOD-13",
        "name": "Executive BI Dashboard & Advanced Reporting",
        "category": "Business Intelligence & Analytics",
        "route_prefixes": ["/api/dashboard", "/api/reports", "/api/analytics"],
        "screens": [
            ("Executive Dashboard", "/dashboard", "Dashboard.tsx", "view_dashboard", "Real-time command center showing gross revenue, active customers, pending collections, and top products."),
            ("BI Reports Hub", "/reports", "Reports.tsx", "view_reports", "Multi-dimensional reporting console generating custom PDF & Excel reports by district, taluka, product, and agent.")
        ],
        "tables": ["sales", "payments", "customers", "products"],
        "summary": "Real-time executive metrics, sales velocity tracking, and automated PDF/Excel business report generation.",
        "workflows": [
            "Dashboard Aggregation: Real-time queries calculate monthly targets, collection percentages, and top customers.",
            "Report Generation: Users specify date ranges and dimensions -> backend compiles publication-grade PDF and multi-tab Excel workbooks."
        ]
    },
    {
        "id": "MOD-14",
        "name": "Predictive Demand Forecasting & Scoring Engine",
        "category": "Machine Learning & Algorithms",
        "route_prefixes": ["/api/forecasting", "/api/algorithm"],
        "screens": [
            ("Demand Forecasting", "/forecasting", "Forecasting.tsx", "run_forecasting", "Statistical inventory prediction projecting product demand 30/60/90 days ahead based on seasonal patterns."),
            ("Scoring Algorithm", "/algorithm", "Algorithm.tsx", "run_algorithm", "ML-based scoring console rating farmers and distributors by conversion likelihood (0-100 score).")
        ],
        "tables": ["sales", "customers", "distributors"],
        "summary": "Empowers supply chain managers with predictive demand forecasting and telecallers with prioritized calling scores.",
        "workflows": [
            "Time-Series Forecasting: Evaluates 12-month historical sales -> projects required inventory by state and product.",
            "Customer Scoring: Scoring engine calculates weights for order frequency, monetary value, recency, and cattle herd size."
        ]
    },
    {
        "id": "MOD-15",
        "name": "HR Recruitment & Talent Acquisition System",
        "category": "Human Resources & Recruitment",
        "route_prefixes": ["/api/recruitment"],
        "screens": [
            ("Recruitment Workspace", "/recruitment", "RecruitmentWorkspace.tsx", "view_recruitment", "Complete ATS pipeline managing applicants, interview stages, evaluation scorecards, and hiring offers.")
        ],
        "tables": ["recruitment_leads", "recruitment_activities"],
        "summary": "Streamlines hiring of field officers, telecallers, and administrative staff from resume screening to employment offers.",
        "workflows": [
            "Candidate Onboarding: HR enters applicant details, experience, role applied, and resume document link.",
            "Multi-stage Evaluation: Candidate progresses through Screening -> Round 1 -> Technical Interview -> HR Round.",
            "Offer & Onboarding: Evaluator records scorecard ratings -> system generates offer letter -> onboards into app_users."
        ]
    }
]

print("Module data structures defined.")

def write_markdown_doc():
    """Generates the exhaustive PROJECT_DOCUMENTATION.md document."""
    lines = []
    def p(text=""):
        lines.append(text)

    p("# PARUL CHEMICALS FSC — COMPLETE SYSTEM & ARCHITECTURE MANUAL")
    p("### Enterprise Sales & Operations CRM, ERP & Field Distribution Platform")
    p(f"**Publication Date:** {datetime.now().strftime('%B %d, %Y')} | **System Version:** 2.4.0 (Production) | **Classification:** Confidential & Proprietary")
    p()
    p("---")
    p()
    p("## 1. Executive Summary & Architectural Overview")
    p("### 1.1 Business Context & Domain")
    p("Parul Chemicals FSC operates across the dairy cattle nutrition, veterinary supplement, and agricultural supply chain industries in Western and Central India (Gujarat, Maharashtra, and Madhya Pradesh). The organization manufactures and distributes premium cattle feed supplements, liquid calcium tonics, mineral mixtures, and digestive boluses to enhance bovine milk yield and animal health.")
    p("The PC-Sales system is an integrated, custom-built enterprise CRM, ERP, and field operations platform designed to orchestrate:")
    p("- Over **10,000+ Sabhasad** (dairy cattle farmers) and their herd profiles.")
    p("- Multi-tier distribution network spanning **Distributors, Shopkeepers, Veterinary Doctors, and Field Officers**.")
    p("- Daily **Automated Call Distribution (ACD)** prioritizing farmer engagements for telecallers.")
    p("- Dynamic **State-Tiered Regional Pricing** (Gujarat, Maharashtra, Madhya Pradesh, Custom JSON).")
    p("- Invoicing, payment collection recovery, and **Tally ERP financial reconciliation**.")
    p("- **Vernacular AI Voice Dictation** supporting Gujarati, Hindi, and English with cattle survey questionnaires.")
    p("- Full **HR Recruitment Pipeline** for scaling field and telecalling personnel.")
    p()
    p("### 1.2 Technology Stack")
    p("| Tier | Technology | Key Libraries & Specifications |")
    p("|---|---|---|")
    p("| **Frontend Client** | React 18, TypeScript 5, Vite 5 | Material-UI (MUI v5), Emotion, TanStack React Query v5, Axios, React Router v6 |")
    p("| **Backend API** | FastAPI (Python 3.11), Uvicorn | Pydantic v2, APScheduler, ReportLab 4, Pandas, OpenPyXL, Requests, Dotenv |")
    p("| **Database & Storage** | Supabase (PostgreSQL 15), PostgREST | Row-Level Security, Database Triggers, Foreign Keys, JSONB Survey Profiles |")
    p("| **AI & Voice Services** | Sarvam AI & Web Speech API | Vernacular speech-to-text, real-time audio level analysis, multi-lingual transcription |")
    p("| **Accounting Sync** | TallyPrime / Tally ERP 9 | XML & Excel voucher ingestion, automated ledger reconciliation, soft-delete cleanup |")
    p("| **Hosting Infrastructure** | Vercel (Edge UI) & Render (Backend) | Continuous Deployment, Automated HTTPS, Keep-alive Health Endpoints |")
    p()
    p("### 1.3 Architectural Topology")
    p("```")
    p(" +--------------------------------------------------------------------------------+")
    p(" |                               CLIENT APPLICATION                               |")
    p(" |                 React 18 + TypeScript + Vite + Material UI v5                  |")
    p(" |               Hosted on Vercel Edge Network (https://pc-sales.vercel.app)       |")
    p(" +--------------------------------------------------------------------------------+")
    p("                                       | HTTPS (JSON / REST)")
    p("                                       v")
    p(" +--------------------------------------------------------------------------------+")
    p(" |                               BACKEND API SERVER                               |")
    p(" |                     FastAPI (Python 3.11) on Render Cloud                      |")
    p(" |       (246 Endpoints, RBAC Cache, APScheduler 10 AM Distribution, ReportLab)   |")
    p(" +--------------------------------------------------------------------------------+")
    p("                   |                                     |")
    p("                   | SQL / PostgREST                     | HTTP / REST")
    p("                   v                                     v")
    p(" +----------------------------------+   +-----------------------------------------+")
    p(" |      SUPABASE POSTGRESQL 15      |   |            EXTERNAL SERVICES            |")
    p(" |  (24 Core Tables, Foreign Keys,  |   |  - Sarvam AI Speech-to-Text API         |")
    p(" |   Audit Triggers, JSONB Surveys) |   |  - TallyPrime / Tally 9 Accounting Sync |")
    p(" +----------------------------------+   +-----------------------------------------+")
    p("```")
    p()
    p("---")
    p()
    p("## 2. Security Architecture & Role-Based Access Control (RBAC)")
    p("### 2.1 Two-Layer Performance Strategy")
    p("To eliminate database bottlenecks while preserving ironclad security, the platform enforces a high-speed two-layer RBAC architecture:")
    p("1. **Layer 1 (Client-side React Context):** Upon successful authentication, the user's role and permission keys are loaded into `AuthContext`. Frontend routes (`ProtectedRoute.tsx`) and UI actions (`PermissionGate.tsx`) evaluate access instantly without network latency.")
    p("2. **Layer 2 (Backend In-Memory Cache):** The backend maintains an in-memory dictionary `_PERMISSION_CACHE` with a 10-minute TTL. Endpoint dependencies (`Depends(verify_permission('...'))`) perform instant set lookups (O(1) complexity) against cached keys. Fast-path queries pull `permission_keys[]` directly from the `roles` table, bypassing junction table joins.")
    p()
    p("### 2.2 System & Operational Roles")
    p("| Role Key | Display Name | Category | Scope & Responsibilities |")
    p("|---|---|---|---|")
    p("| `admin` | Admin | System | Full system authority across all modules, configuration, and audit logs. |")
    p("| `developer` | Developer | System | Equivalent to Admin, unrestricted developer debugging and operational access. |")
    p("| `sales_manager` | Sales Manager | Business | Manages sales orders, approvals, customer directories, payments, and dispatch. |")
    p("| `logistics_manager` | Logistics Manager | Operations | Controls warehouse inventory, dispatch status, and order shipping. |")
    p("| `telecaller` | Telecaller | Operations | Executes daily calling queue, logs call outcomes, and captures telecaller orders. |")
    p("| `marketing_manager` | Marketing Manager | Business | Oversees lead generation, route campaigns, demo planning, and conversion. |")
    p("| `business_analyst` | Business Analyst | Executive | Read-only analytics access across all BI reports, financial ledgers, and dashboards. |")
    p("| `product_manager` | Product Manager | Product | Configures product catalog specifications, packaging sizes, and regional pricing tiers. |")
    p("| `lead_manager` | Lead Manager | Sales | Oversees entire lead Kanban pipeline and allocates prospects to sales reps. |")
    p("| `lead_owner` | Lead Owner | Sales | Field executive working assigned leads to closure and trial demonstration. |")
    p("| `hr_&_administration` | HR & Administration | Human Resources | Manages recruitment applicant tracking, interview scheduling, and staffing. |")
    p()
    p("### 2.3 The 52 Granular Permissions Registry")
    p("The system defines 52 discrete permission keys spanning all 15 operational domains:")
    p("- **Dashboard:** `view_dashboard`")
    p("- **Customers:** `view_customers`, `create_customer`, `edit_customer`, `delete_customer`")
    p("- **Sales & Orders:** `view_sales`, `create_sale`, `edit_sale`, `delete_sale`, `download_invoice`, `view_orders`, `update_order_status`, `update_shipment_status`, `cancel_order`")
    p("- **Payments:** `view_payments`, `record_payment`, `edit_payment`, `delete_payment`")
    p("- **Product Demos:** `view_demos`, `schedule_demo`, `edit_demo`, `delete_demo`")
    p("- **Channel Partners:** `view_distributors`, `create_distributor`, `edit_distributor`, `delete_distributor`, `view_shopkeepers`, `create_shopkeeper`, `edit_shopkeeper`, `view_doctors`, `create_doctor`, `edit_doctor`, `view_field_officers`, `create_field_officer`, `edit_field_officer`, `delete_field_officer`")
    p("- **Reporting & BI:** `view_reports`, `export_reports`, `run_forecasting`")
    p("- **Calling & Automation:** `view_calling_list`, `run_call_distribution`")
    p("- **Products & Pricing:** `view_products`, `manage_products`, `manage_pricing`")
    p("- **Data Migration:** `import_data`")
    p("- **Algorithms:** `run_algorithm`")
    p("- **Team Chat:** `delete_message`")
    p("- **Administration:** `view_activity_logs`, `manage_activity_logs`, `view_users`, `create_user`, `manage_users`, `manage_roles`, `manage_notifications`")
    p("- **CRM Leads:** `view_all_leads`, `manage_leads`, `work_leads`, `view_lead_dashboard`")
    p("- **Customer Reviews:** `view_reviews`, `delete_reviews`")
    p("- **Recruitment:** `view_recruitment`, `manage_recruitment`")
    p("- **Tally ERP:** `view_tally_data`")
    p()
    p("---")
    p()
    p("## 3. Database Architecture & Data Dictionary")
    p("The PostgreSQL database under Supabase contains 24 core relational tables optimized with B-tree indexes, foreign keys with cascading integrity, and JSONB document storage.")
    p()

    for tinfo in DB_TABLES:
        p(f"### 3.{DB_TABLES.index(tinfo) + 1} Table: `{tinfo['table']}`")
        p(f"**Primary Key:** `{tinfo['pk']}`  ")
        p(f"**Description:** {tinfo['desc']}")
        p()
        p("| Column Name | Data Type | Constraints & Defaults | Business Purpose |")
        p("|---|---|---|---|")
        for col, ctype, cconst, cdesc in tinfo['cols']:
            p(f"| `{col}` | `{ctype}` | {cconst} | {cdesc} |")
        p()

    p("---")
    p()
    p("## 4. Module-by-Module In-Depth Manual (All 15 Modules)")
    p()

    for mod in MODULES_LIST:
        p(f"### 4.{MODULES_LIST.index(mod) + 1} {mod['id']} — {mod['name']}")
        p(f"**Functional Category:** {mod['category']}  ")
        p(f"**Core Summary:** {mod['summary']}")
        p()
        p("#### A. Associated Screens & Frontend User Interfaces")
        p("| Screen Name | Route Path | Source Component | Required Permission | User Capabilities & Key Controls |")
        p("|---|---|---|---|---|")
        for sname, spath, sfile, sperm, sdesc in mod['screens']:
            p(f"| **{sname}** | `{spath}` | `{sfile}` | `{sperm}` | {sdesc} |")
        p()
        p("#### B. Business Operational Workflows")
        for wf in mod['workflows']:
            p(f"- {wf}")
        p()
        p("#### C. Database Tables Engaged")
        p(f"Tables engaged: {', '.join([f'`{t}`' for t in mod['tables']])}")
        p()
        
        # Filter routes for this module
        mod_routes = []
        for r in all_routes:
            p_val = r['path']
            if any(p_val.startswith(prefix) for prefix in mod['route_prefixes']):
                mod_routes.append(r)
        
        p(f"#### D. Module API Catalog ({len(mod_routes)} Endpoints)")
        if mod_routes:
            p("| HTTP Method | Endpoint URL | Handler Function Name | Description / Operational Behavior |")
            p("|---|---|---|---|")
            for r in mod_routes:
                methods_str = "/".join(r['methods'])
                p(f"| `{methods_str}` | `{r['path']}` | `{r['name']}` | Executes operational logic for {r['name'].replace('_', ' ').title()}. |")
        else:
            p("_No endpoints directly bound to these route prefixes._")
        p()
        p("---")
        p()

    p("## 5. End-to-End System Operational Workflows")
    p("### 5.1 Flow 1: Lead to Sabhasad Onboarding & Master Record Creation")
    p("1. **Lead Qualification:** Inbound inquiries from farmer exhibitions or field visits are logged in `/leads`. Lead owners conduct preliminary discovery calls.")
    p("2. **Onboarding Initiation:** User navigates to `/customers` and clicks **'Add Sabhasad'**.")
    p("3. **Frontend Validation:** Frontend enforces 10-digit Indian phone regex and verifies mandatory fields.")
    p("4. **Non-blocking Duplicate Probe:** Frontend calls `/api/customers/check-phone?mobile=...`. If an existing record exists, a modal warning displays the conflicting Sabhasad while allowing managerial override.")
    p("5. **Backend Sanitization & Commitment:** Backend cleans `+91` and `0` prefixes, normalizes text to uppercase, verifies `customer_code` uniqueness (returning HTTP 409 if duplicate), inserts into `customers`, and logs a `CREATE` audit record in `activity_logs`.")
    p()
    p("### 5.2 Flow 2: Automated 10:00 AM Call Distribution Pipeline")
    p("1. **Attendance Roster:** Between 08:30 AM and 09:59 AM, telecallers mark their morning attendance on `/calling-list`. This sets `is_present = TRUE` in `telecaller_attendance`.")
    p("2. **Automated Trigger:** At exactly 10:00 AM, APScheduler (or external cron hitting `/cron/distribute`) triggers `distribute_calls()`.")
    p("3. **Eligibility Verification:** The engine resolves all present telecallers. If none are present, the job aborts safely without error.")
    p("4. **Priority Scoring:** The algorithm selects up to 150 top unassigned customers/distributors sorted by computed priority score (frequency of past orders, herd size, days since last contact).")
    p("5. **Fair Distribution:** Leads are allocated in round-robin fashion evenly among available telecallers. Assignments are written to `calling_assignments` with status `pending`.")
    p()
    p("### 5.3 Flow 3: Telecaller Call Execution & Cattle Profile Survey")
    p("1. **Terminal Access:** Telecallers open `/calling-list`. Their daily assigned queue displays with farmer details, phone numbers, and past history.")
    p("2. **Click-to-Call & Dictation:** Telecaller dials farmer. During conversation, telecaller can press `Alt+V` in any input field to dictate notes in Gujarati, Hindi, or English using `VoiceTextField`.")
    p("3. **Survey Capture:** If farmer is interested, telecaller captures cattle herd data (number of cows/buffaloes, milk yield in liters, lactation stage, current feed).")
    p("4. **Outcome Submission:** Telecaller selects outcome (`Interested`, `Order Placed`, `Call Back Later`, `Ringing`, `Wrong Number`) and submits.")
    p("5. **Backend Processing:** Backend creates `call_logs` entry, parses cattle survey into `customers.cattle_profile`, updates assignment status to `completed`, and schedules follow-up if requested.")
    p()
    p("### 5.4 Flow 4: Telecaller Order Approval & Warehouse Dispatch")
    p("1. **Order Capture:** If a farmer orders during a call, the telecaller creates a booking via the terminal dialog. This writes to `telecaller_orders` with status `Pending`.")
    p("2. **Managerial Review:** Sales Managers open `/orders` (Order Management). Pending orders display itemized products, quantities, and delivery notes.")
    p("3. **Decision Gate:**")
    p("   - **If Approved:** Manager clicks **'Approve'**. System verifies customer credit/location, converts `telecaller_orders` into official `sales` record, generates formal `invoice_no` (via Postgres sequence trigger), sets `shipment_status = 'Pending'`, and alerts warehouse.")
    p("   - **If Rejected:** Manager enters mandatory `rejection_reason` (e.g. 'Invalid delivery address', 'Farmer declined confirmation'). Order is archived as `Rejected`.")
    p("4. **Dispatch:** Warehouse personnel update `shipment_status` to `Dispatched` and record carrier tracking details.")
    p()
    p("### 5.5 Flow 5: Multi-Region Invoicing & Payment Reconciliation")
    p("1. **Invoice Drafting:** In `/sales`, billing staff select customer and add items.")
    p("2. **Dynamic Price Application:** System inspects customer's `state` (e.g., Gujarat vs Maharashtra vs Madhya Pradesh). It queries `products` and applies the specific regional rate tier.")
    p("3. **Invoice Generation:** Sales order is committed. Invoices are downloadable as PDF formatted with company letterhead, tax breakdowns, and terms.")
    p("4. **Payment Recording:** When payment arrives, accountant visits `/payments`, enters amount, payment method (RTGS, Cash, UPI), and bank RRN.")
    p("5. **Ledger Balancing:** System calculates total collections against invoice total: sets `payment_status = 'Paid'` if fully settled, or `'Partial'` if balance remains.")
    p()
    p("### 5.6 Flow 6: Tally ERP Voucher Synchronization & Audit Reconciliation")
    p("1. **Data Export from Tally:** Company accountants export XML/Excel voucher dumps from TallyPrime.")
    p("2. **Batch Upload:** Accountant uploads files into `/tally-data`.")
    p("3. **Ingestion & Mapping:** Backend parses vouchers (Sales, Receipts, Journal entries), stores them in `tally_vouchers`, and maps party ledger names to CRM customers.")
    p("4. **Cross-Audit:** The system compares Tally amounts and dates with CRM sales orders, highlighting discrepancies, missing ledger entries, or duplicate receipts.")
    p("5. **Soft-Delete Cleanup:** Synchronized batches can be soft-deleted and purged to maintain clean accounting audit trails.")
    p()
    p("---")
    p()
    p("## 6. Complete Master API Specification Directory (246 Endpoints)")
    p("The following catalog documents all 246 backend endpoints registered in the FastAPI application:")
    p()
    p("| # | HTTP Method | Endpoint Route | Function Name | Module Category |")
    p("|---|---|---|---|---|")
    for idx, r in enumerate(all_routes, 1):
        m = "/".join(r['methods'])
        p_str = r['path']
        f_name = r['name']
        cat = "Core"
        if "/api/admin" in p_str: cat = "Admin & Users"
        elif "/api/rbac" in p_str: cat = "RBAC Security"
        elif "/api/customers" in p_str: cat = "Customers"
        elif "/api/sales" in p_str: cat = "Sales & Invoicing"
        elif "/api/telecaller-orders" in p_str: cat = "Telecaller Orders"
        elif "/api/payments" in p_str: cat = "Payments"
        elif "/api/demos" in p_str: cat = "Product Demos"
        elif "/api/distributors" in p_str: cat = "Distributors"
        elif "/api/shopkeepers" in p_str: cat = "Shopkeepers"
        elif "/api/doctors" in p_str: cat = "Veterinary Doctors"
        elif "/api/field-officers" in p_str: cat = "Field Officers"
        elif "/api/products" in p_str: cat = "Products & Pricing"
        elif "/api/automation" in p_str: cat = "Call Automation"
        elif "/api/attendance" in p_str: cat = "Attendance"
        elif "/api/call-logger" in p_str: cat = "Voice & Call Logger"
        elif "/api/leads" in p_str: cat = "CRM Leads"
        elif "/api/tally" in p_str: cat = "Tally ERP"
        elif "/api/imports" in p_str: cat = "Data Import"
        elif "/api/reports" in p_str: cat = "BI Reports"
        elif "/api/dashboard" in p_str: cat = "Dashboard"
        elif "/api/forecasting" in p_str: cat = "Forecasting"
        elif "/api/algorithm" in p_str: cat = "Algorithms"
        elif "/api/recruitment" in p_str: cat = "HR Recruitment"
        elif "/api/notifications" in p_str: cat = "Notifications"
        elif "/api/chat" in p_str: cat = "Team Chat"
        elif "/api/user-sessions" in p_str: cat = "User Sessions"
        p(f"| {idx} | `{m}` | `{p_str}` | `{f_name}` | {cat} |")

    p()
    p("---")
    p()
    p("## 7. Operational Troubleshooting & Best Practices")
    p("- **Phone Validation:** All mobile numbers must be exactly 10 digits. The backend automatically strips `+91`, leading `0`, and spaces/hyphens.")
    p("- **Customer Code Uniqueness:** Customer codes (Sabhasad codes) must be unique. The backend returns HTTP 409 if a duplicate code is supplied, preventing data corruption.")
    p("- **In-Memory Cache Invalidation:** When altering role permissions in `/role-management`, the backend automatically calls `clear_user_permission_cache()`, forcing immediate permission refresh across all active users.")
    p("- **Voice Dictation Hotkey:** Field and telecalling staff can press `Alt+V` on any input field in the browser to instantly toggle speech-to-text dictation.")
    p()
    p("**End of Documentation.**")

    # Write Markdown file
    with open(MD_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"[DOC GEN] Markdown documentation generated: {MD_PATH} ({len(lines)} lines)")


def build_pdf_doc():
    """Compiles the complete publication-grade PDF using ReportLab."""
    print("[DOC GEN] Compiling PDF with ReportLab...")
    
    # 515 points width available (A4 width 595.27 - 80 margin)
    doc = SimpleDocTemplate(
        PDF_PATH,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=50,
        bottomMargin=50
    )

    styles = getSampleStyleSheet()

    # Custom typography styles
    c_primary = colors.HexColor("#0f172a")    # Slate 900
    c_accent = colors.HexColor("#1e3a8a")     # Blue 900
    c_blue = colors.HexColor("#2563eb")       # Blue 600
    c_muted = colors.HexColor("#64748b")      # Slate 500
    c_light = colors.HexColor("#f8fafc")      # Slate 50
    c_border = colors.HexColor("#cbd5e1")     # Slate 300

    title_style = ParagraphStyle(
        'CoverTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=c_accent,
        alignment=1, # Center
        spaceAfter=12
    )

    subtitle_style = ParagraphStyle(
        'CoverSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=c_muted,
        alignment=1,
        spaceAfter=25
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=16,
        leading=20,
        textColor=c_accent,
        spaceBefore=16,
        spaceAfter=8,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=c_primary,
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )

    h3_style = ParagraphStyle(
        'Heading3_Custom',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13,
        textColor=c_blue,
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=c_primary,
        spaceAfter=6
    )

    bullet_style = ParagraphStyle(
        'Bullet_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11.5,
        textColor=c_primary,
        leftIndent=12,
        spaceAfter=4
    )

    table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=9.5,
        textColor=c_primary
    )

    table_header = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white
    )

    story = []

    # ─────────────────────────────────────────────────────────────
    # COVER PAGE
    # ─────────────────────────────────────────────────────────────
    story.append(Spacer(1, 40))
    story.append(Paragraph("PARUL CHEMICALS FSC", ParagraphStyle('CompanyPre', parent=title_style, fontSize=14, leading=16, textColor=c_blue, spaceAfter=8)))
    story.append(Paragraph("PC-SALES CRM & ERP PLATFORM", title_style))
    story.append(Paragraph("COMPLETE SYSTEM SPECIFICATION & ARCHITECTURAL MANUAL", ParagraphStyle('ManualSub', parent=title_style, fontSize=13, leading=17, textColor=c_primary, spaceAfter=15)))
    story.append(Paragraph("Comprehensive Functional Guide Covering All 15 Modules, 32 Screens, 24 Database Schemas, System Workflows, and 246 API Specifications.", subtitle_style))
    story.append(Spacer(1, 20))

    # Metadata Box
    meta_data = [
        [Paragraph("<b>Document Title:</b>", table_cell), Paragraph("Complete System & Architecture Manual", table_cell)],
        [Paragraph("<b>Target Domain:</b>", table_cell), Paragraph("Dairy Cattle Nutrition & Agri-Vet Supply Chain ERP", table_cell)],
        [Paragraph("<b>Application Version:</b>", table_cell), Paragraph("v2.4.0 (Production Stable Release)", table_cell)],
        [Paragraph("<b>Target Audience:</b>", table_cell), Paragraph("Executives, Software Engineers, Operations Leads, System Admins", table_cell)],
        [Paragraph("<b>Frontend Host:</b>", table_cell), Paragraph("Vercel Edge Network (https://pc-sales.vercel.app)", table_cell)],
        [Paragraph("<b>Backend Host:</b>", table_cell), Paragraph("Render Cloud Infrastructure (Python 3.11 FastAPI)", table_cell)],
        [Paragraph("<b>Database:</b>", table_cell), Paragraph("Supabase PostgreSQL 15 Enterprise Cluster", table_cell)],
        [Paragraph("<b>Compilation Date:</b>", table_cell), Paragraph(datetime.now().strftime("%B %d, %Y"), table_cell)],
        [Paragraph("<b>Security Level:</b>", table_cell), Paragraph("CONFIDENTIAL — PROPRIETARY TO PARUL CHEMICALS", table_cell)],
    ]
    t_meta = Table(meta_data, colWidths=[150, 365])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), c_light),
        ('BOX', (0, 0), (-1, -1), 1, c_border),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, c_border),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 40))
    story.append(Paragraph("<i>This document is automatically compiled from live codebase specifications and authoritative database schemas.</i>", ParagraphStyle('Notice', parent=body_style, alignment=1, textColor=c_muted)))
    story.append(PageBreak())

    # ─────────────────────────────────────────────────────────────
    # SECTION 1: EXECUTIVE SUMMARY & ARCHITECTURE
    # ─────────────────────────────────────────────────────────────
    story.append(Paragraph("1. Executive Summary & System Architecture", h1_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_accent, spaceAfter=10))
    
    story.append(Paragraph("<b>1.1 Business Scope & Purpose</b>", h2_style))
    story.append(Paragraph(
        "Parul Chemicals FSC operates across Gujarat, Maharashtra, and Madhya Pradesh manufacturing high-grade dairy cattle nutrition products, feed supplements, and mineral mixtures. The PC-Sales platform orchestrates customer relationship management, field sales routes, automated morning call distribution, regional multi-tier pricing, invoicing, payment debt recovery, Tally accounting synchronization, and HR recruitment.",
        body_style
    ))
    
    story.append(Paragraph("<b>1.2 Full-Stack Architecture</b>", h2_style))
    arch_table = [
        [Paragraph("<b>Layer</b>", table_header), Paragraph("<b>Technology</b>", table_header), Paragraph("<b>Key Responsibilities & Components</b>", table_header)],
        [Paragraph("Frontend Client", table_cell), Paragraph("React 18 + TypeScript 5<br/>Vite + MUI v5", table_cell), Paragraph("32 interactive screens, Material-UI design system, TanStack React Query cache, responsive mobile layout, universal voice dictation (Alt+V).", table_cell)],
        [Paragraph("Backend API", table_cell), Paragraph("FastAPI (Python 3.11)<br/>Render Hosting", table_cell), Paragraph("246 REST endpoints, APScheduler 10:00 AM distribution cron, in-memory RBAC cache (10-min TTL), ReportLab publication engine, Pandas/OpenPyXL data cleaner.", table_cell)],
        [Paragraph("Database Tier", table_cell), Paragraph("Supabase PostgreSQL 15<br/>PostgREST Engine", table_cell), Paragraph("24 relational tables, B-tree indexes, foreign keys with ON DELETE CASCADE, JSONB survey documents, PostgreSQL sequence triggers.", table_cell)],
        [Paragraph("Voice & AI", table_cell), Paragraph("Sarvam AI Models &<br/>Web Speech API", table_cell), Paragraph("Vernacular voice transcription in Gujarati, Hindi, and English. Integrated cattle survey questionnaire parser.", table_cell)],
        [Paragraph("ERP Accounting", table_cell), Paragraph("TallyPrime / Tally 9<br/>XML Sync Pipeline", table_cell), Paragraph("Bi-directional reconciliation of Sales, Receipts, and Journal vouchers against CRM orders with soft-delete purge.", table_cell)],
    ]
    t_arch = Table(arch_table, colWidths=[95, 120, 300])
    t_arch.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), c_accent),
        ('GRID', (0, 0), (-1, -1), 0.5, c_border),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, c_light]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_arch)
    story.append(Spacer(1, 14))

    # ─────────────────────────────────────────────────────────────
    # SECTION 2: SECURITY & RBAC MODEL
    # ─────────────────────────────────────────────────────────────
    story.append(Paragraph("2. Security Model & Role-Based Access Control (RBAC)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_accent, spaceAfter=10))

    story.append(Paragraph(
        "The system enforces a dual-layer security model: Client-side route gating via <code>AuthContext</code> and <code>ProtectedRoute</code>, paired with server-side endpoint protection via <code>Depends(verify_permission('...'))</code>. Permissions are resolved in-memory with zero DB overhead on cache hits, refreshing every 10 minutes or instantly when roles are modified.",
        body_style
    ))

    # Roles Table
    roles_table = [
        [Paragraph("<b>Role Key</b>", table_header), Paragraph("<b>Display Name</b>", table_header), Paragraph("<b>Operational Scope & Typical Assigned Permissions</b>", table_header)],
        [Paragraph("<code>admin</code>", table_cell), Paragraph("Admin", table_cell), Paragraph("Full system access (all 52 permissions). Manages users, roles, pricing, logs, and financial records.", table_cell)],
        [Paragraph("<code>developer</code>", table_cell), Paragraph("Developer", table_cell), Paragraph("Full system access equivalent to Admin for technical maintenance and operational audits.", table_cell)],
        [Paragraph("<code>sales_manager</code>", table_cell), Paragraph("Sales Manager", table_cell), Paragraph("Approves orders, creates invoices, edits customers, manages payments, oversees distributors and shopkeepers.", table_cell)],
        [Paragraph("<code>logistics_manager</code>", table_cell), Paragraph("Logistics Manager", table_cell), Paragraph("Manages order dispatch, shipment statuses, distributor accounts, and warehouse inventory fulfillment.", table_cell)],
        [Paragraph("<code>telecaller</code>", table_cell), Paragraph("Telecaller", table_cell), Paragraph("Accesses daily calling list, executes customer calls, captures tri-lingual cattle survey, and books orders.", table_cell)],
        [Paragraph("<code>marketing_manager</code>", table_cell), Paragraph("Marketing Manager", table_cell), Paragraph("Schedules product demos, monitors field officer trial conversions, runs call distribution.", table_cell)],
        [Paragraph("<code>business_analyst</code>", table_cell), Paragraph("Business Analyst", table_cell), Paragraph("Read-only access across BI reports, analytics, financial trends, and executive dashboards.", table_cell)],
        [Paragraph("<code>product_manager</code>", table_cell), Paragraph("Product Manager", table_cell), Paragraph("Controls product master, packaging capacities, regional price matrices, and catalog availability.", table_cell)],
        [Paragraph("<code>lead_manager</code>", table_cell), Paragraph("Lead Manager", table_cell), Paragraph("Oversees entire CRM sales pipeline, monitors stage transitions, and assigns leads to representatives.", table_cell)],
        [Paragraph("<code>lead_owner</code>", table_cell), Paragraph("Lead Owner", table_cell), Paragraph("Sales executive dedicated to qualifying prospects, executing field demos, and closing orders.", table_cell)],
        [Paragraph("<code>hr_&_administration</code>", table_cell), Paragraph("HR & Administration", table_cell), Paragraph("Recruitment workspace, applicant screening, interview scorecards, job offers, and staffing logs.", table_cell)],
    ]
    t_roles = Table(roles_table, colWidths=[100, 115, 300])
    t_roles.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), c_accent),
        ('GRID', (0, 0), (-1, -1), 0.5, c_border),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, c_light]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_roles)
    story.append(Spacer(1, 14))

    # ─────────────────────────────────────────────────────────────
    # SECTION 3: DATABASE ARCHITECTURE & DATA DICTIONARY
    # ─────────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("3. Database Architecture & Data Dictionary", h1_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_accent, spaceAfter=10))
    story.append(Paragraph(
        "Below is the complete database dictionary for all core relational tables under Supabase PostgreSQL. Every column name, data type, integrity constraint, and business role is explicitly specified.",
        body_style
    ))

    for tinfo in DB_TABLES:
        t_story = []
        t_story.append(Paragraph(f"<b>Table: {tinfo['table']}</b> — <i>PK: {tinfo['pk']}</i>", h2_style))
        t_story.append(Paragraph(tinfo['desc'], body_style))
        
        t_rows = [
            [Paragraph("<b>Column</b>", table_header), Paragraph("<b>Type</b>", table_header), Paragraph("<b>Constraints / Default</b>", table_header), Paragraph("<b>Business Definition</b>", table_header)]
        ]
        for col, ctype, cconst, cdesc in tinfo['cols']:
            t_rows.append([
                Paragraph(f"<code>{col}</code>", table_cell),
                Paragraph(ctype, table_cell),
                Paragraph(cconst, table_cell),
                Paragraph(cdesc, table_cell)
            ])
        
        t_table = Table(t_rows, colWidths=[120, 85, 110, 200])
        t_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), c_primary),
            ('GRID', (0, 0), (-1, -1), 0.5, c_border),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, c_light]),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        t_story.append(t_table)
        t_story.append(Spacer(1, 10))
        story.append(KeepTogether(t_story))

    # ─────────────────────────────────────────────────────────────
    # SECTION 4: MODULE-BY-MODULE SPECIFICATION
    # ─────────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("4. Module-by-Module Operational Specifications", h1_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_accent, spaceAfter=10))

    for mod in MODULES_LIST:
        m_story = []
        m_story.append(Paragraph(f"<b>{mod['id']} — {mod['name']}</b>", h2_style))
        m_story.append(Paragraph(f"<b>Domain:</b> {mod['category']} | <b>Tables:</b> {', '.join(mod['tables'])}", h3_style))
        m_story.append(Paragraph(mod['summary'], body_style))
        
        m_story.append(Paragraph("<b>Frontend User Interfaces:</b>", h3_style))
        s_rows = [
            [Paragraph("<b>Screen Name</b>", table_header), Paragraph("<b>Route</b>", table_header), Paragraph("<b>Component</b>", table_header), Paragraph("<b>Permission</b>", table_header), Paragraph("<b>Capabilities & UI Elements</b>", table_header)]
        ]
        for sname, spath, sfile, sperm, sdesc in mod['screens']:
            s_rows.append([
                Paragraph(sname, table_cell),
                Paragraph(f"<code>{spath}</code>", table_cell),
                Paragraph(sfile, table_cell),
                Paragraph(sperm, table_cell),
                Paragraph(sdesc, table_cell)
            ])
        t_screens = Table(s_rows, colWidths=[90, 80, 85, 75, 185])
        t_screens.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), c_accent),
            ('GRID', (0, 0), (-1, -1), 0.5, c_border),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, c_light]),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        m_story.append(t_screens)
        m_story.append(Spacer(1, 6))

        m_story.append(Paragraph("<b>Core Business Workflows:</b>", h3_style))
        for wf in mod['workflows']:
            m_story.append(Paragraph(f"• {wf}", bullet_style))
        m_story.append(Spacer(1, 10))

        story.append(KeepTogether(m_story))

    # ─────────────────────────────────────────────────────────────
    # SECTION 5: END-TO-END WORKFLOWS
    # ─────────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("5. End-to-End Operational Lifecycle Blueprints", h1_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_accent, spaceAfter=10))

    workflows_data = [
        ("Flow 1: Sabhasad Onboarding", "Lead / Farmer Contact", "Phone validation -> Duplicate probe -> Backend +91/0 cleanup -> customer_code uniqueness check -> Supabase insert -> ActivityLogger diff record."),
        ("Flow 2: 10:00 AM Call Distribution", "Morning Shift Routine", "Telecallers log presence -> 10 AM cron evaluates present telecallers -> Scores unassigned leads by priority -> Distributes evenly in calling_assignments queue."),
        ("Flow 3: Telecalling & Cattle Survey", "Daily Farmer Calls", "Telecaller opens /calling-list -> Dials farmer -> Uses Alt+V voice typing -> Captures tri-lingual survey (cow/buffalo count, milk yield) -> Records call outcome."),
        ("Flow 4: Telecaller Order Approval", "Order Booking to Dispatch", "Telecaller books order in terminal -> Enters Pending queue -> Sales Manager reviews in /orders -> Approves -> Transforms into official sale -> Warehouse dispatches."),
        ("Flow 5: Multi-Region Invoicing", "Billing & Payment Recovery", "Buyer selected -> State identified (Gujarat / Maharashtra / MP) -> Regional price matrix applied -> Invoice PDF generated -> Payment recorded with RRN -> Balance updated."),
        ("Flow 6: Tally ERP Reconciliation", "Financial Synchronization", "Accountant exports XML/Excel from Tally -> Uploads into /tally-data -> Vouchers mapped to CRM customers -> Cross-reconciliation verifies discrepancies -> Stale entries purged."),
    ]

    wf_rows = [
        [Paragraph("<b>Workflow</b>", table_header), Paragraph("<b>Trigger / Stage</b>", table_header), Paragraph("<b>Step-by-Step Technical & Business Sequence</b>", table_header)]
    ]
    for wfname, wftrig, wfseq in workflows_data:
        wf_rows.append([
            Paragraph(f"<b>{wfname}</b>", table_cell),
            Paragraph(wftrig, table_cell),
            Paragraph(wfseq, table_cell)
        ])
    t_wf = Table(wf_rows, colWidths=[115, 100, 300])
    t_wf.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), c_accent),
        ('GRID', (0, 0), (-1, -1), 0.5, c_border),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, c_light]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_wf)
    story.append(Spacer(1, 14))

    # ─────────────────────────────────────────────────────────────
    # SECTION 6: MASTER API DIRECTORY (ALL 246 ENDPOINTS)
    # ─────────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("6. Master API Directory (All 246 Endpoints)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_accent, spaceAfter=10))
    story.append(Paragraph(
        "Complete authoritative catalog of all 246 API endpoints registered in the FastAPI server. Organized by HTTP Method, Path, Function Handler, and Functional Category.",
        body_style
    ))

    api_rows = [
        [Paragraph("<b>#</b>", table_header), Paragraph("<b>Method</b>", table_header), Paragraph("<b>Route Path</b>", table_header), Paragraph("<b>Function Handler</b>", table_header), Paragraph("<b>Category</b>", table_header)]
    ]
    for idx, r in enumerate(all_routes, 1):
        m = "/".join(r['methods'])
        p_str = r['path']
        f_name = r['name']
        cat = "Core"
        if "/api/admin" in p_str: cat = "Admin & Users"
        elif "/api/rbac" in p_str: cat = "RBAC Security"
        elif "/api/customers" in p_str: cat = "Customers"
        elif "/api/sales" in p_str: cat = "Sales"
        elif "/api/telecaller-orders" in p_str: cat = "Telecaller Orders"
        elif "/api/payments" in p_str: cat = "Payments"
        elif "/api/demos" in p_str: cat = "Demos"
        elif "/api/distributors" in p_str: cat = "Distributors"
        elif "/api/shopkeepers" in p_str: cat = "Shopkeepers"
        elif "/api/doctors" in p_str: cat = "Doctors"
        elif "/api/field-officers" in p_str: cat = "Field Officers"
        elif "/api/products" in p_str: cat = "Products"
        elif "/api/automation" in p_str: cat = "Call Automation"
        elif "/api/attendance" in p_str: cat = "Attendance"
        elif "/api/call-logger" in p_str: cat = "Voice AI"
        elif "/api/leads" in p_str: cat = "CRM Leads"
        elif "/api/tally" in p_str: cat = "Tally ERP"
        elif "/api/imports" in p_str: cat = "Data Import"
        elif "/api/reports" in p_str: cat = "BI Reports"
        elif "/api/dashboard" in p_str: cat = "Dashboard"
        elif "/api/forecasting" in p_str: cat = "Forecasting"
        elif "/api/algorithm" in p_str: cat = "Algorithms"
        elif "/api/recruitment" in p_str: cat = "HR Recruitment"
        elif "/api/notifications" in p_str: cat = "Notifications"
        elif "/api/chat" in p_str: cat = "Chat"
        elif "/api/user-sessions" in p_str: cat = "User Sessions"

        api_rows.append([
            Paragraph(str(idx), table_cell),
            Paragraph(f"<b>{m}</b>", table_cell),
            Paragraph(f"<code>{p_str}</code>", table_cell),
            Paragraph(f_name, table_cell),
            Paragraph(cat, table_cell)
        ])

    t_api = Table(api_rows, colWidths=[25, 45, 205, 140, 100])
    t_api.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), c_accent),
        ('GRID', (0, 0), (-1, -1), 0.5, c_border),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, c_light]),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
    ]))
    story.append(t_api)

    # Build PDF
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"[DOC GEN] Publication-grade PDF built successfully: {PDF_PATH}")


if __name__ == "__main__":
    write_markdown_doc()
    build_pdf_doc()
    print("[DOC GEN] All documentation artifacts successfully generated!")
