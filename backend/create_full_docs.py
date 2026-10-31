# -*- coding: utf-8 -*-
"""
create_full_docs.py
-------------------
Generates the definitive, comprehensive architecture and operational manual for
Parul Chemicals (PC-Sales CRM & ERP).
Produces:
  1. docs/PROJECT_DOCUMENTATION.md (Exhaustive Markdown Manual)
  2. docs/Parul_Chemicals_Complete_System_Documentation.pdf (Publication-grade PDF)
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

# Load routes
ROUTES_PATH = os.path.join(BASE_DIR, "scratch", "extracted_routes.json")
routes = []
if os.path.exists(ROUTES_PATH):
    with open(ROUTES_PATH, "r", encoding="utf-8") as f:
        routes = json.load(f)

# Module definition mapping
MODULES = [
    {
        "id": "MOD-01",
        "name": "Authentication, RBAC & User Administration",
        "tag": "Auth & RBAC",
        "prefix": ["/api/admin", "/api/rbac", "/api/user-sessions", "/api/activity"],
        "screens": [
            {"path": "/login", "name": "Login Screen", "file": "Login.tsx", "perm": "Public", "desc": "User authentication gate with credential validation, role extraction, and session token issuance."},
            {"path": "/user-management", "name": "User Management", "file": "UserManagement.tsx", "perm": "view_users", "desc": "Admin screen to manage application users, assign roles, reset passwords, and toggle active status."},
            {"path": "/role-management", "name": "Role & Permission Management", "file": "RoleManagement.tsx", "perm": "manage_roles", "desc": "Granular RBAC matrix configuration for creating roles, binding 52 permissions, and cache invalidation."},
            {"path": "/admin", "name": "System Admin Overview", "file": "Admin.tsx", "perm": "view_activity_logs", "desc": "High-level administrative console for system health, database metrics, and live service status."},
            {"path": "/activity", "name": "Activity & Audit Logs", "file": "Activity.tsx", "perm": "Authenticated", "desc": "Comprehensive forensic audit trail recording field-level before/after diffs, IP addresses, and user actions."}
        ],
        "tables": ["app_users", "roles", "permissions", "role_permissions", "activity_logs", "user_sessions"],
        "flows": [
            "User logs in via /login -> Backend queries app_users and roles -> Permissions cached in React AuthContext and Backend in-memory dict (10 min TTL).",
            "User navigation triggers PermissionGate / ProtectedRoute verification against granted permission keys.",
            "Any mutation on core entities (Customer, Sale, Doctor) invokes ActivityLogger.log_update_with_diff() capturing field-level before/after snapshots.",
            "Active browser session sends periodic heartbeat to /api/user-sessions/heartbeat to maintain session presence and detect concurrent logins."
        ]
    },
    {
        "id": "MOD-02",
        "name": "Sabhasad (Farmer/Customer) Management",
        "tag": "Customers",
        "prefix": ["/api/customers"],
        "screens": [
            {"path": "/customers", "name": "Sabhasad Directory & Management", "file": "Customers.tsx", "perm": "view_customers", "desc": "Directory of 10,000+ dairy farmers (Sabhasad). Supports server-side search, mobile validation, duplicate warnings, dialog CRUD, and customer summary."}
        ],
        "tables": ["customers", "call_logs", "sales", "demos"],
        "flows": [
            "Creation Flow: User inputs Sabhasad details -> Frontend validates Indian 10-digit mobile -> Probes /api/customers/check-phone for duplicate warning dialog -> Submits payload -> Backend cleans +91/0 prefixes, verifies customer_code uniqueness, and commits to Supabase.",
            "Summary Inspection: Selecting customer loads /api/customers/{id}/summary displaying total purchase volume, pending dues, joined date, cattle survey profile, and last 20 call logs.",
            "Fuzzy Search: Debounced search executes 7-field ilike query across name, mobile, village, taluka, district, state, and customer code."
        ]
    },
    {
        "id": "MOD-03",
        "name": "Channel Partner Network (Distributors, Shopkeepers, Doctors, Field Officers)",
        "tag": "Channel Network",
        "prefix": ["/api/distributors", "/api/shopkeepers", "/api/doctors", "/api/field-officers"],
        "screens": [
            {"path": "/distributors", "name": "Distributor Network", "file": "Distributors.tsx", "perm": "view_distributors", "desc": "Master distributor accounts with village/taluka mapping, Mantri contact details, and linked Sabhasad counts."},
            {"path": "/shopkeepers", "name": "Shopkeepers Directory", "file": "Shopkeepers.tsx", "perm": "view_shopkeepers", "desc": "Village-level agro-retailers, daily milk collection volumes (morning/evening), and dairy timing patterns."},
            {"path": "/doctors", "name": "Veterinary Doctors Network", "file": "Doctors.tsx", "perm": "view_doctors", "desc": "Veterinary doctors database tracking influential prescribers, clinic locations, and key dairy associations."},
            {"path": "/field-officers", "name": "Field Officers Force", "file": "FieldOfficers.tsx", "perm": "view_field_officers", "desc": "On-ground sales team management, territory coverage, linked demos, and field operational metrics."}
        ],
        "tables": ["distributors", "shopkeepers", "doctors", "field_officers"],
        "flows": [
            "Distributor Registration: Channel partner records created with village, district, contact, and group metrics.",
            "Retailer Assessment: Shopkeepers captured with morning/evening sabhasad counts, milk collection metrics (liters), and payment recovery timelines.",
            "Field Assignment: Field officers assigned specific talukas/villages for targeted route coverage."
        ]
    },
    {
        "id": "MOD-04",
        "name": "Product Catalog & Dynamic Regional Pricing",
        "tag": "Products & Pricing",
        "prefix": ["/api/products"],
        "screens": [
            {"path": "/product-pricing", "name": "Product Catalog & Regional Matrix", "file": "ProductPricing.tsx", "perm": "manage_pricing", "desc": "Product master catalog with capacity, packing types (Liters, Bags, Cans), standard rate, and regional tiers (Gujarat, Maharashtra, MP, Custom)."}
        ],
        "tables": ["products", "product_regions"],
        "flows": [
            "Product Master Creation: Admin registers product with packing type, capacity, and baseline standard rate.",
            "Regional Matrix Configuration: Pricing manager defines distinct rates per state (e.g., Gujarat vs Maharashtra vs MP) or custom rates stored as structured JSON.",
            "Invoice Resolution: When booking orders, system automatically matches the customer's state to fetch the applicable regional unit price."
        ]
    },
    {
        "id": "MOD-05",
        "name": "Sales Order Booking, Invoicing & Dispatch",
        "tag": "Sales & Orders",
        "prefix": ["/api/sales", "/api/telecaller-orders"],
        "screens": [
            {"path": "/sales", "name": "Sales Order & Invoicing Desk", "file": "Sales.tsx", "perm": "view_sales", "desc": "Fast order creation desk with multi-item grid, auto-suggest for customers/distributors, real-time total computation, and direct invoice PDF generation."},
            {"path": "/orders", "name": "Order Management & Telecaller Verification", "file": "OrderManagement.tsx", "perm": "view_orders", "desc": "Telecaller-booked orders queue. Managers review, confirm, reject with reason, or approve for warehouse dispatch."}
        ],
        "tables": ["sales", "sale_items", "telecaller_orders", "telecaller_order_items"],
        "flows": [
            "Direct Sale Booking: Staff selects buyer (Sabhasad / Distributor / Shopkeeper) -> adds line items -> selects quantities -> system applies regional rates -> generates invoice -> auto-assigns invoice number via Postgres trigger.",
            "Telecaller Order Lifecycle: Telecaller creates pending telecaller_order -> Order enters 'Pending' status -> Sales Manager inspects order on OrderManagement.tsx -> approves order -> system transforms it into permanent sales record and flags for dispatch.",
            "Invoice PDF Generation: Real-time PDF rendering with company header, buyer GST/Tax details, itemized breakdown, and terms."
        ]
    },
    {
        "id": "MOD-06",
        "name": "Payment Collections & Credit Ledger",
        "tag": "Payments",
        "prefix": ["/api/payments"],
        "screens": [
            {"path": "/payments", "name": "Collections & Payment Ledger", "file": "Payments.tsx", "perm": "view_payments", "desc": "Payment collection register tracking transactions, payment methods (Cash, RTGS, UPI, Cheque), RRN / reference numbers, and outstanding balance settlement."}
        ],
        "tables": ["payments", "sales"],
        "flows": [
            "Payment Entry: Collector records payment against invoice_no or customer -> enters amount, date, payment method, and RRN.",
            "Status Rebalancing: System updates linked sales record payment_status ('Paid', 'Partial', 'Pending') based on total paid vs invoice amount.",
            "Receipt Audit: Receipts exportable to PDF and Excel for customer reconciliation."
        ]
    },
    {
        "id": "MOD-07",
        "name": "Product Demonstrations & Field Officer Scheduling",
        "tag": "Demos",
        "prefix": ["/api/demos"],
        "screens": [
            {"path": "/demos", "name": "Product Demonstration Logs", "file": "Demos.tsx", "perm": "view_demos", "desc": "Tracks on-field product trials, sample quantities provided to cattle farmers, and trial outcomes."},
            {"path": "/demo-scheduler", "name": "Demo Scheduling & Route Calendar", "file": "DemoScheduler.tsx", "perm": "view_demos", "desc": "Calendar-based scheduler assigning field officers to farmers for demonstration visits with time slots and locations."}
        ],
        "tables": ["demos", "field_officers", "products", "customers"],
        "flows": [
            "Demo Scheduling: Telecaller or manager schedules demo -> assigns field officer, customer, product, and scheduled date/time.",
            "Field Execution: Field officer visits farmer, demonstrates cattle feed / mineral mixture, records quantity provided.",
            "Follow-up & Conversion: System tracks follow-up date -> logs conversion status ('Converted', 'Not Converted', 'Pending') -> converts interested leads into regular Sabhasad buyers."
        ]
    },
    {
        "id": "MOD-08",
        "name": "Automated Call Distribution & Telecaller Duty Roster",
        "tag": "Automation & Calls",
        "prefix": ["/api/automation", "/api/attendance"],
        "screens": [
            {"path": "/call-distribution", "name": "Call Distribution Control Center", "file": "CallDistribution.tsx", "perm": "run_call_distribution", "desc": "Managerial interface to monitor telecaller workloads, trigger 10 AM automatic assignment, reallocate leads, and view priority scores."},
            {"path": "/calling-list", "name": "Telecaller Daily Calling Desk", "file": "CallingList.tsx", "perm": "view_calling_list", "desc": "Interactive calling terminal for telecallers. Provides one-click calling, customer profile, quick ordering, call outcome logging, and tri-lingual survey form."}
        ],
        "tables": ["calling_assignments", "telecaller_attendance", "duty_sheet_log", "call_logs"],
        "flows": [
            "Morning Duty Sheet: Telecallers mark presence -> Duty sheet logs attendance -> Only present telecallers receive assignments.",
            "10:00 AM Cron Engine: Automated distribution pipeline scores unassigned customers using priority algorithm (recency, purchase volume, cattle count) -> balances leads evenly among active telecallers.",
            "Calling Execution: Telecaller calls farmer -> records outcome ('Interested', 'Order Placed', 'Ringing / No Answer', 'Call Back Later', 'Switch Off') -> captures tri-lingual cattle survey -> system auto-schedules next follow-up."
        ]
    },
    {
        "id": "MOD-09",
        "name": "AI Voice-to-Text & Call Intelligence Engine",
        "tag": "AI Voice & Audio",
        "prefix": ["/api/call-logger"],
        "screens": [
            {"path": "VoiceTextField Component", "name": "Voice-Enabled Input Engine", "file": "VoiceTextField.tsx", "perm": "Global", "desc": "Universal microphone input component embedded across forms. Supports Gujarati, Hindi, and English dictation with real-time waveform animation and keyboard shortcut (Alt+V)."}
        ],
        "tables": ["call_logs"],
        "flows": [
            "Browser Speech Recognition: Activates WebKit Speech Recognition with continuous listening and live interim transcript merging.",
            "Sarvam AI Audio Fallback: Audio chunks recorded via MediaRecorder -> sent to /api/call-logger/transcribe-chunk -> Sarvam AI multilingual model transcribes vernacular speech with domain-specific dairy terms.",
            "Cattle Survey Ingestion: Voice or manual responses parsed into structured cattle_profile JSON (cow count, buffalo count, milk yield, feed type) attached to customer master."
        ]
    },
    {
        "id": "MOD-10",
        "name": "Lead Pipeline & CRM Workspace",
        "tag": "Leads & CRM",
        "prefix": ["/api/leads"],
        "screens": [
            {"path": "/lead-dashboard", "name": "Lead Conversion Analytics", "file": "LeadDashboard.tsx", "perm": "view_lead_dashboard", "desc": "Funnel analytics tracking lead stages, lead sources (exhibitions, referrals, field visits), and win rates."},
            {"path": "/leads", "name": "Lead Kanban Pipeline", "file": "LeadPipeline.tsx", "perm": "view_all_leads", "desc": "Drag-and-drop Kanban board organizing leads across stages: New, Contacted, Qualified, Trial Demo, In Negotiation, Won, Lost."},
            {"path": "/lead-workspace", "name": "Lead Detail Workbench", "file": "LeadWorkspace.tsx", "perm": "work_leads", "desc": "Detailed lead cockpit with contact details, activity notes, task scheduling, and quote creation."},
            {"path": "/lead-history", "name": "Lead Interaction Timeline", "file": "LeadHistory.tsx", "perm": "work_leads", "desc": "Complete audit trail of all calls, visits, demos, and note changes for a specific lead."}
        ],
        "tables": ["customers", "call_logs", "notes", "demos"],
        "flows": [
            "Lead Capture: Inbound lead recorded with source, dairy size, and contact details.",
            "Stage Progression: Lead owner updates status along the Kanban pipeline as interactions occur.",
            "Conversion: Successful negotiation converts lead into an active Sabhasad with linked initial order."
        ]
    },
    {
        "id": "MOD-11",
        "name": "Tally ERP Integration & Voucher Reconciliation",
        "tag": "Tally ERP",
        "prefix": ["/api/tally"],
        "screens": [
            {"path": "/tally-data", "name": "Tally Data Integration & Audit", "file": "TallyData.tsx", "perm": "view_tally_data", "desc": "Enterprise interface synchronizing vouchers from TallyPrime/Tally 9. Reconciles Sales, Receipts, and Journal entries against CRM sales."}
        ],
        "tables": ["tally_vouchers", "sales", "payments"],
        "flows": [
            "Tally Data Extraction: XML / Excel voucher export from Tally ingested via backend batch processor.",
            "Multi-company Categorization: Filters vouchers by company, ledger name, and voucher type.",
            "Reconciliation & Cleanup: Identifies matching CRM invoices, flags mismatches, and performs soft-delete cleanup of stale sync batches."
        ]
    },
    {
        "id": "MOD-12",
        "name": "Excel Data Import & Ingestion Pipeline",
        "tag": "Data Import",
        "prefix": ["/api/imports"],
        "screens": [
            {"path": "/import", "name": "Data Ingestion & Preprocessing", "file": "DataImport.tsx", "perm": "import_data", "desc": "Bulk upload station for Sabhasad and Distributor Excel files. Features intelligent alias header matching, preview table, conflict detection, and batch import."}
        ],
        "tables": ["import_history", "customers", "distributors"],
        "flows": [
            "File Upload: User uploads raw Excel spreadsheet (.xlsx, .xls).",
            "Preprocessing: Backend clean_excel_customers.py normalizes aliases (e.g. 'Sabhasad Name' -> 'name'), parses phone numbers, infers morning/evening split columns.",
            "Preview & Verification: Frontend displays preview grid highlighting duplicates, missing mandatory fields, and new records.",
            "Batch Commit: User confirms import -> backend executes bulk insert into Supabase and creates permanent audit record in import_history."
        ]
    },
    {
        "id": "MOD-13",
        "name": "Executive BI Dashboard & Advanced Reporting",
        "tag": "BI & Analytics",
        "prefix": ["/api/dashboard", "/api/reports", "/api/analytics"],
        "screens": [
            {"path": "/dashboard", "name": "Executive Operations Dashboard", "file": "Dashboard.tsx", "perm": "view_dashboard", "desc": "Command center displaying total revenue, monthly sales volume, active customers, pending collections, top 5 products, and recent orders."},
            {"path": "/reports", "name": "Business Intelligence & Export Hub", "file": "Reports.tsx", "perm": "view_reports", "desc": "Multi-dimensional report generator. Allows date filtering, dimension breakdown (by district, product, sales rep), and PDF/Excel generation."}
        ],
        "tables": ["sales", "payments", "customers", "products"],
        "flows": [
            "Dashboard Aggregation: Real-time queries compute KPIs, month-over-month growth, and collection targets.",
            "Report Generation: User configures filters -> backend generates formatted PDF report (using ReportLab) or Excel workbook with summary sheets."
        ]
    },
    {
        "id": "MOD-14",
        "name": "Predictive Demand Forecasting & Scoring Algorithm",
        "tag": "ML & Forecasting",
        "prefix": ["/api/forecasting", "/api/algorithm"],
        "screens": [
            {"path": "/forecasting", "name": "Demand Forecasting Engine", "file": "Forecasting.tsx", "perm": "run_forecasting", "desc": "Statistical prediction screen projecting product demand 30/60/90 days ahead based on historical seasonality and growth trends."},
            {"path": "/algorithm", "name": "Scoring Engine Terminal", "file": "Algorithm.tsx", "perm": "run_algorithm", "desc": "ML-driven scoring engine calculating farmer and distributor purchase probability scores for prioritization."}
        ],
        "tables": ["sales", "customers", "distributors"],
        "flows": [
            "Forecasting Execution: Analyzes past 12-month sales data -> applies moving averages and trend weighting -> outputs projected required inventory by product.",
            "Scoring Engine: Scoring engine calculates customer scores (0 to 100) based on days since last order, total volume, cattle profile, and demo response."
        ]
    },
    {
        "id": "MOD-15",
        "name": "HR Recruitment & Talent Acquisition System",
        "tag": "HR & Hiring",
        "prefix": ["/api/recruitment"],
        "screens": [
            {"path": "/recruitment", "name": "Recruitment & Applicant Pipeline", "file": "RecruitmentWorkspace.tsx", "perm": "view_recruitment", "desc": "Complete ATS (Applicant Tracking System) managing job candidates, resume evaluations, interview stages, ratings, and job offers."}
        ],
        "tables": ["recruitment_leads", "recruitment_activities"],
        "flows": [
            "Candidate Onboarding: HR enters applicant details, role applied (e.g. Field Officer, Telecaller), experience, and resume link.",
            "Interview Pipeline: Candidates move through stages: Applied -> Screening -> Round 1 Interview -> Round 2 Interview -> Offer -> Hired / Rejected.",
            "Evaluation & Feedback: Evaluators record interview scores, technical ratings, and salary negotiations."
        ]
    }
]

print("Module metadata initialized.")

