# PARUL CHEMICALS FSC — COMPLETE SYSTEM & ARCHITECTURE MANUAL
### Enterprise Sales & Operations CRM, ERP & Field Distribution Platform
**Publication Date:** October 31, 2026 | **System Version:** 2.4.0 (Production) | **Classification:** Confidential & Proprietary

---

## 1. Executive Summary & Architectural Overview
### 1.1 Business Context & Domain
Parul Chemicals FSC operates across the dairy cattle nutrition, veterinary supplement, and agricultural supply chain industries in Western and Central India (Gujarat, Maharashtra, and Madhya Pradesh). The organization manufactures and distributes premium cattle feed supplements, liquid calcium tonics, mineral mixtures, and digestive boluses to enhance bovine milk yield and animal health.
The PC-Sales system is an integrated, custom-built enterprise CRM, ERP, and field operations platform designed to orchestrate:
- Over **10,000+ Sabhasad** (dairy cattle farmers) and their herd profiles.
- Multi-tier distribution network spanning **Distributors, Shopkeepers, Veterinary Doctors, and Field Officers**.
- Daily **Automated Call Distribution (ACD)** prioritizing farmer engagements for telecallers.
- Dynamic **State-Tiered Regional Pricing** (Gujarat, Maharashtra, Madhya Pradesh, Custom JSON).
- Invoicing, payment collection recovery, and **Tally ERP financial reconciliation**.
- **Vernacular AI Voice Dictation** supporting Gujarati, Hindi, and English with cattle survey questionnaires.
- Full **HR Recruitment Pipeline** for scaling field and telecalling personnel.

### 1.2 Technology Stack
| Tier | Technology | Key Libraries & Specifications |
|---|---|---|
| **Frontend Client** | React 18, TypeScript 5, Vite 5 | Material-UI (MUI v5), Emotion, TanStack React Query v5, Axios, React Router v6 |
| **Backend API** | FastAPI (Python 3.11), Uvicorn | Pydantic v2, APScheduler, ReportLab 4, Pandas, OpenPyXL, Requests, Dotenv |
| **Database & Storage** | Supabase (PostgreSQL 15), PostgREST | Row-Level Security, Database Triggers, Foreign Keys, JSONB Survey Profiles |
| **AI & Voice Services** | Sarvam AI & Web Speech API | Vernacular speech-to-text, real-time audio level analysis, multi-lingual transcription |
| **Accounting Sync** | TallyPrime / Tally ERP 9 | XML & Excel voucher ingestion, automated ledger reconciliation, soft-delete cleanup |
| **Hosting Infrastructure** | Vercel (Edge UI) & Render (Backend) | Continuous Deployment, Automated HTTPS, Keep-alive Health Endpoints |

### 1.3 Architectural Topology
```
 +--------------------------------------------------------------------------------+
 |                               CLIENT APPLICATION                               |
 |                 React 18 + TypeScript + Vite + Material UI v5                  |
 |               Hosted on Vercel Edge Network (https://pc-sales.vercel.app)       |
 +--------------------------------------------------------------------------------+
                                       | HTTPS (JSON / REST)
                                       v
 +--------------------------------------------------------------------------------+
 |                               BACKEND API SERVER                               |
 |                     FastAPI (Python 3.11) on Render Cloud                      |
 |       (246 Endpoints, RBAC Cache, APScheduler 10 AM Distribution, ReportLab)   |
 +--------------------------------------------------------------------------------+
                   |                                     |
                   | SQL / PostgREST                     | HTTP / REST
                   v                                     v
 +----------------------------------+   +-----------------------------------------+
 |      SUPABASE POSTGRESQL 15      |   |            EXTERNAL SERVICES            |
 |  (24 Core Tables, Foreign Keys,  |   |  - Sarvam AI Speech-to-Text API         |
 |   Audit Triggers, JSONB Surveys) |   |  - TallyPrime / Tally 9 Accounting Sync |
 +----------------------------------+   +-----------------------------------------+
```

---

## 2. Security Architecture & Role-Based Access Control (RBAC)
### 2.1 Two-Layer Performance Strategy
To eliminate database bottlenecks while preserving ironclad security, the platform enforces a high-speed two-layer RBAC architecture:
1. **Layer 1 (Client-side React Context):** Upon successful authentication, the user's role and permission keys are loaded into `AuthContext`. Frontend routes (`ProtectedRoute.tsx`) and UI actions (`PermissionGate.tsx`) evaluate access instantly without network latency.
2. **Layer 2 (Backend In-Memory Cache):** The backend maintains an in-memory dictionary `_PERMISSION_CACHE` with a 10-minute TTL. Endpoint dependencies (`Depends(verify_permission('...'))`) perform instant set lookups (O(1) complexity) against cached keys. Fast-path queries pull `permission_keys[]` directly from the `roles` table, bypassing junction table joins.

### 2.2 System & Operational Roles
| Role Key | Display Name | Category | Scope & Responsibilities |
|---|---|---|---|
| `admin` | Admin | System | Full system authority across all modules, configuration, and audit logs. |
| `developer` | Developer | System | Equivalent to Admin, unrestricted developer debugging and operational access. |
| `sales_manager` | Sales Manager | Business | Manages sales orders, approvals, customer directories, payments, and dispatch. |
| `logistics_manager` | Logistics Manager | Operations | Controls warehouse inventory, dispatch status, and order shipping. |
| `telecaller` | Telecaller | Operations | Executes daily calling queue, logs call outcomes, and captures telecaller orders. |
| `marketing_manager` | Marketing Manager | Business | Oversees lead generation, route campaigns, demo planning, and conversion. |
| `business_analyst` | Business Analyst | Executive | Read-only analytics access across all BI reports, financial ledgers, and dashboards. |
| `product_manager` | Product Manager | Product | Configures product catalog specifications, packaging sizes, and regional pricing tiers. |
| `lead_manager` | Lead Manager | Sales | Oversees entire lead Kanban pipeline and allocates prospects to sales reps. |
| `lead_owner` | Lead Owner | Sales | Field executive working assigned leads to closure and trial demonstration. |
| `hr_&_administration` | HR & Administration | Human Resources | Manages recruitment applicant tracking, interview scheduling, and staffing. |

### 2.3 The 52 Granular Permissions Registry
The system defines 52 discrete permission keys spanning all 15 operational domains:
- **Dashboard:** `view_dashboard`
- **Customers:** `view_customers`, `create_customer`, `edit_customer`, `delete_customer`
- **Sales & Orders:** `view_sales`, `create_sale`, `edit_sale`, `delete_sale`, `download_invoice`, `view_orders`, `update_order_status`, `update_shipment_status`, `cancel_order`
- **Payments:** `view_payments`, `record_payment`, `edit_payment`, `delete_payment`
- **Product Demos:** `view_demos`, `schedule_demo`, `edit_demo`, `delete_demo`
- **Channel Partners:** `view_distributors`, `create_distributor`, `edit_distributor`, `delete_distributor`, `view_shopkeepers`, `create_shopkeeper`, `edit_shopkeeper`, `view_doctors`, `create_doctor`, `edit_doctor`, `view_field_officers`, `create_field_officer`, `edit_field_officer`, `delete_field_officer`
- **Reporting & BI:** `view_reports`, `export_reports`, `run_forecasting`
- **Calling & Automation:** `view_calling_list`, `run_call_distribution`
- **Products & Pricing:** `view_products`, `manage_products`, `manage_pricing`
- **Data Migration:** `import_data`
- **Algorithms:** `run_algorithm`
- **Team Chat:** `delete_message`
- **Administration:** `view_activity_logs`, `manage_activity_logs`, `view_users`, `create_user`, `manage_users`, `manage_roles`, `manage_notifications`
- **CRM Leads:** `view_all_leads`, `manage_leads`, `work_leads`, `view_lead_dashboard`
- **Customer Reviews:** `view_reviews`, `delete_reviews`
- **Recruitment:** `view_recruitment`, `manage_recruitment`
- **Tally ERP:** `view_tally_data`

---

## 3. Database Architecture & Data Dictionary
The PostgreSQL database under Supabase contains 24 core relational tables optimized with B-tree indexes, foreign keys with cascading integrity, and JSONB document storage.

### 3.1 Table: `customers`
**Primary Key:** `customer_id (SERIAL)`  
**Description:** Master directory of Sabhasad (dairy cattle farmers). Stores personal credentials, geographic location, Aadhaar number, status, and cattle profile survey.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `customer_id` | `SERIAL` | PRIMARY KEY | Unique auto-incrementing customer identifier |
| `customer_code` | `TEXT` | UNIQUE, NULLABLE | Unique business code for farmer (e.g. CUST001, 1002) |
| `name` | `TEXT` | NOT NULL | Full legal name of the farmer / Sabhasad |
| `mobile` | `TEXT` | INDEXED | Validated 10-digit Indian mobile number |
| `village` | `TEXT` | NULLABLE | Village name in uppercase |
| `taluka` | `TEXT` | NULLABLE | Sub-district / Taluka name in uppercase |
| `district` | `TEXT` | NULLABLE | District name in uppercase |
| `state` | `TEXT` | DEFAULT 'Gujarat' | Operating state (Gujarat, Maharashtra, MP) |
| `adhar_no` | `TEXT` | NULLABLE | 12-digit Aadhaar identification number |
| `status` | `TEXT` | DEFAULT 'Active' | Account status ('Active', 'Inactive') |
| `cattle_profile` | `JSONB` | NULLABLE | Structured survey (milking count, dry cows, breed, feed type) |
| `created_at` | `TIMESTAMP` | CURRENT_TIMESTAMP | Record timestamp |

### 3.2 Table: `distributors`
**Primary Key:** `distributor_id (SERIAL)`  
**Description:** Regional stockists, wholesalers, and dairy cooperative union distribution centers.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `distributor_id` | `SERIAL` | PRIMARY KEY | Unique distributor identifier |
| `name` | `TEXT` | NOT NULL | Commercial distributor / business entity name |
| `village` | `TEXT` | NULLABLE | Operating village / town |
| `taluka` | `TEXT` | NULLABLE | Sub-district / Taluka |
| `district` | `TEXT` | NULLABLE | District location |
| `mantri_name` | `TEXT` | NULLABLE | Key executive / Mantri / Secretary contact |
| `mantri_mobile` | `TEXT` | NULLABLE | Mobile number of key contact |
| `sabhasad_count` | `INTEGER` | DEFAULT 0 | Total affiliated dairy farmers |
| `contact_in_group` | `INTEGER` | DEFAULT 0 | Group member count |
| `status` | `TEXT` | DEFAULT 'Active' | Account status ('Active', 'Inactive') |
| `created_at` | `TIMESTAMP` | CURRENT_TIMESTAMP | Creation timestamp |

### 3.3 Table: `shopkeepers`
**Primary Key:** `shopkeeper_id (SERIAL)`  
**Description:** Agro-retailers and village animal husbandry supply stores.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `shopkeeper_id` | `SERIAL` | PRIMARY KEY | Unique shopkeeper identifier |
| `name` | `TEXT` | NOT NULL | Shop / Owner name |
| `village` | `TEXT` | NULLABLE | Village location |
| `taluka` | `TEXT` | NULLABLE | Taluka / Tehsil |
| `district` | `TEXT` | NULLABLE | District location |
| `mantri_name` | `TEXT` | NULLABLE | Owner / Manager name |
| `mantri_mobile` | `TEXT` | NULLABLE | Contact phone number |
| `sabhasad_count` | `INTEGER` | DEFAULT 0 | Total linked Sabhasads |
| `sabhasad_morning` | `INTEGER` | DEFAULT 0 | Morning session participants |
| `sabhasad_evening` | `INTEGER` | DEFAULT 0 | Evening session participants |
| `milk_collection_morning` | `INTEGER` | NULLABLE | Daily morning collection in Liters |
| `milk_collection_evening` | `INTEGER` | NULLABLE | Daily evening collection in Liters |
| `nature_of_sabhasad` | `TEXT` | NULLABLE | Farmer cooperative category |
| `status` | `TEXT` | DEFAULT 'Active' | Store operational status |

### 3.4 Table: `doctors`
**Primary Key:** `doctor_id (SERIAL)`  
**Description:** Veterinary practitioners and dairy health advisors.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `doctor_id` | `SERIAL` | PRIMARY KEY | Unique veterinary doctor identifier |
| `name` | `TEXT` | NOT NULL | Doctor / Practitioner name |
| `village` | `TEXT` | NULLABLE | Clinic village / headquarters |
| `taluka` | `TEXT` | NULLABLE | Sub-district |
| `district` | `TEXT` | NULLABLE | District |
| `mantri_mobile` | `TEXT` | NULLABLE | Direct mobile number |
| `dairy_type` | `TEXT` | NULLABLE | Cooperative / Private / Independent |
| `support` | `TEXT` | NULLABLE | Clinical support type |
| `status` | `TEXT` | DEFAULT 'Active' | Active practitioner status |

### 3.5 Table: `field_officers`
**Primary Key:** `field_officer_id (SERIAL)`  
**Description:** On-ground sales representatives, route officers, and trial demonstration executors.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `field_officer_id` | `SERIAL` | PRIMARY KEY | Unique field officer identifier |
| `name` | `TEXT` | NOT NULL | Full officer name |
| `mobile` | `TEXT` | NULLABLE | Phone number |
| `assigned_districts` | `TEXT` | NULLABLE | Comma-separated assigned districts |
| `assigned_talukas` | `TEXT` | NULLABLE | Assigned sub-districts |
| `is_active` | `BOOLEAN` | DEFAULT TRUE | Employment active status |
| `created_at` | `TIMESTAMP` | CURRENT_TIMESTAMP | Onboarding timestamp |

### 3.6 Table: `products`
**Primary Key:** `product_id (SERIAL)`  
**Description:** Master catalog of veterinary nutrition products, feed supplements, and mineral mixtures.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `product_id` | `SERIAL` | PRIMARY KEY | Unique product identifier |
| `product_name` | `TEXT` | NOT NULL | Commercial product name (e.g. Cal-Plus, Parul Mix) |
| `packing_type` | `TEXT` | NULLABLE | Packaging format (Bottle, Jar, Can, Bag, Pouch) |
| `capacity_ltr` | `REAL` | NULLABLE | Package volume / weight in Liters or Kilograms |
| `category` | `TEXT` | NULLABLE | Category (Mineral Mixture, Liquid Calcium, Bolus, Tonic) |
| `standard_rate` | `REAL` | NULLABLE | Base national catalog price |
| `rate_gujarat` | `REAL` | NULLABLE | Specific regional rate for Gujarat |
| `rate_maharashtra` | `REAL` | NULLABLE | Specific regional rate for Maharashtra |
| `rate_mp` | `REAL` | NULLABLE | Specific regional rate for Madhya Pradesh |
| `custom_rates` | `JSONB` | DEFAULT '{}' | Dynamic custom rate mapping by state/tier |
| `is_active` | `INTEGER` | DEFAULT 1 | Catalog availability flag (1=Active, 0=Archived) |

### 3.7 Table: `sales`
**Primary Key:** `sale_id (SERIAL)`  
**Description:** Official sales orders, commercial invoices, and customer billing master records.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `sale_id` | `SERIAL` | PRIMARY KEY | Unique sale order identifier |
| `invoice_no` | `TEXT` | INDEXED | Unique generated tax invoice number (INV-YYYY-XXXX) |
| `customer_id` | `INTEGER` | FK -> customers | Customer / Sabhasad buyer |
| `distributor_id` | `INTEGER` | FK -> distributors | Optional distributor buyer |
| `sale_date` | `TEXT` | NOT NULL | ISO date string (YYYY-MM-DD) |
| `total_amount` | `REAL` | DEFAULT 0 | Gross invoice monetary amount (INR) |
| `total_liters` | `REAL` | DEFAULT 0 | Total volume / mass sold |
| `payment_status` | `TEXT` | DEFAULT 'Pending' | Status ('Paid', 'Partial', 'Pending') |
| `shipment_status` | `TEXT` | DEFAULT 'Pending' | Dispatch status ('Pending', 'Dispatched', 'Delivered') |
| `notes` | `TEXT` | NULLABLE | Order remarks / dispatch instructions |
| `created_at` | `TIMESTAMP` | CURRENT_TIMESTAMP | Order timestamp |

### 3.8 Table: `sale_items`
**Primary Key:** `sale_item_id (SERIAL)`  
**Description:** Line items breakdown for sales orders.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `sale_item_id` | `SERIAL` | PRIMARY KEY | Unique line item identifier |
| `sale_id` | `INTEGER` | FK -> sales | Parent sale order link |
| `product_id` | `INTEGER` | FK -> products | Linked product |
| `quantity` | `INTEGER` | NOT NULL | Number of units ordered |
| `rate` | `REAL` | NOT NULL | Unit billing rate applied |
| `amount` | `REAL` | NOT NULL | Total amount (quantity * rate) |

### 3.9 Table: `payments`
**Primary Key:** `payment_id (SERIAL)`  
**Description:** Cash collections, bank transfers, and invoice settlements.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `payment_id` | `SERIAL` | PRIMARY KEY | Unique transaction identifier |
| `sale_id` | `INTEGER` | FK -> sales | Settled invoice reference |
| `payment_date` | `TEXT` | NOT NULL | Date payment received |
| `payment_method` | `TEXT` | NULLABLE | Method ('Cash', 'RTGS/NEFT', 'UPI', 'Cheque') |
| `amount` | `REAL` | NOT NULL | Payment amount in INR |
| `rrn` | `TEXT` | NULLABLE | Bank Reference / UPI RRN / Cheque number |
| `reference` | `TEXT` | NULLABLE | Internal accounting reference |
| `notes` | `TEXT` | NULLABLE | Receipt notes |

### 3.10 Table: `demos`
**Primary Key:** `demo_id (SERIAL)`  
**Description:** On-field product trials, sample provisions, and conversion tracking.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `demo_id` | `SERIAL` | PRIMARY KEY | Unique demo record identifier |
| `customer_id` | `INTEGER` | FK -> customers | Target farmer / Sabhasad |
| `distributor_id` | `INTEGER` | FK -> distributors | Associated distributor |
| `product_id` | `INTEGER` | FK -> products | Demonstrated product |
| `demo_date` | `TEXT` | NOT NULL | Scheduled / executed demo date |
| `quantity_provided` | `INTEGER` | NULLABLE | Trial sample quantity given |
| `follow_up_date` | `TEXT` | NULLABLE | Scheduled farmer check-in date |
| `conversion_status` | `TEXT` | DEFAULT 'Scheduled' | Status ('Scheduled', 'Completed', 'Converted', 'Lost') |
| `notes` | `TEXT` | NULLABLE | Farmer trial feedback & response |

### 3.11 Table: `calling_assignments`
**Primary Key:** `assignment_id (SERIAL)`  
**Description:** Daily lead and farmer calling distribution queue for telecallers.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `assignment_id` | `SERIAL` | PRIMARY KEY | Queue assignment record ID |
| `assigned_to` | `TEXT` | NOT NULL | Telecaller user email address |
| `customer_id` | `INTEGER` | FK -> customers | Assigned customer target |
| `distributor_id` | `INTEGER` | NULLABLE | Assigned distributor target |
| `entity_type` | `TEXT` | DEFAULT 'customer' | Target type ('customer' or 'distributor') |
| `priority_score` | `REAL` | DEFAULT 0.0 | Computed urgency/value score (0.0 to 100.0) |
| `assigned_date` | `DATE` | NOT NULL | Assignment date for daily roster |
| `status` | `TEXT` | DEFAULT 'pending' | Status ('pending', 'completed', 'rescheduled') |

### 3.12 Table: `call_logs`
**Primary Key:** `log_id (SERIAL)`  
**Description:** Detailed record of telephonic interactions, call outcomes, and cattle survey questionnaires.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `log_id` | `SERIAL` | PRIMARY KEY | Call record identifier |
| `customer_id` | `INTEGER` | NULLABLE | Customer recipient link |
| `distributor_id` | `INTEGER` | NULLABLE | Distributor recipient link |
| `user_email` | `TEXT` | NOT NULL | Telecaller email who made call |
| `call_outcome` | `TEXT` | NOT NULL | Outcome ('Interested', 'Order Placed', 'Ringing', 'Busy', 'Invalid') |
| `notes` | `TEXT` | NULLABLE | Conversation notes & customer remarks |
| `called_at` | `TIMESTAMP` | CURRENT_TIMESTAMP | Call timestamp |
| `duration_seconds` | `INTEGER` | DEFAULT 0 | Call duration in seconds |
| `survey_json` | `JSONB` | NULLABLE | Tri-lingual cattle survey response JSON |
| `next_follow_up` | `TIMESTAMP` | NULLABLE | Agreed callback date/time |

### 3.13 Table: `telecaller_orders`
**Primary Key:** `order_id (SERIAL)`  
**Description:** Telephonically captured sales orders awaiting managerial approval.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `order_id` | `SERIAL` | PRIMARY KEY | Telecaller order identifier |
| `customer_id` | `INTEGER` | NOT NULL | Target customer ID |
| `telecaller_email` | `TEXT` | NOT NULL | Creator telecaller email |
| `order_date` | `DATE` | NOT NULL | Order booking date |
| `total_amount` | `REAL` | DEFAULT 0 | Total order monetary value |
| `status` | `TEXT` | DEFAULT 'Pending' | Approval state ('Pending', 'Approved', 'Rejected') |
| `notes` | `TEXT` | NULLABLE | Booking notes |
| `approved_by` | `TEXT` | NULLABLE | Manager email who authorized |
| `approved_at` | `TIMESTAMP` | NULLABLE | Managerial approval timestamp |
| `rejection_reason` | `TEXT` | NULLABLE | Reason if rejected |

### 3.14 Table: `telecaller_order_items`
**Primary Key:** `id (SERIAL)`  
**Description:** Line items breakdown for telecaller-booked orders.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `id` | `SERIAL` | PRIMARY KEY | Line item ID |
| `order_id` | `INTEGER` | FK -> telecaller_orders | Parent telecaller order ID |
| `product_id` | `INTEGER` | FK -> products | Ordered product |
| `quantity` | `INTEGER` | NOT NULL | Quantity ordered |
| `rate` | `REAL` | NOT NULL | Unit price applied |
| `amount` | `REAL` | NOT NULL | Total line item cost |

### 3.15 Table: `telecaller_attendance`
**Primary Key:** `id (SERIAL)`  
**Description:** Morning attendance logs determining daily call distribution eligibility.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `id` | `SERIAL` | PRIMARY KEY | Attendance record ID |
| `user_email` | `TEXT` | NOT NULL | Telecaller email |
| `attendance_date` | `DATE` | NOT NULL | Shift date |
| `is_present` | `BOOLEAN` | DEFAULT FALSE | Presence confirmation flag |
| `created_at` | `TIMESTAMP` | CURRENT_TIMESTAMP | Log timestamp |

### 3.16 Table: `app_users`
**Primary Key:** `user_id (SERIAL)`  
**Description:** Authenticated system user credentials, employee identity, and role assignment.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `user_id` | `SERIAL` | PRIMARY KEY | User account identifier |
| `email` | `TEXT` | UNIQUE, NOT NULL | Login email address |
| `name` | `TEXT` | NOT NULL | Full employee name |
| `role` | `TEXT` | NOT NULL | Assigned RBAC role key (e.g. admin, sales_manager) |
| `password_hash` | `TEXT` | NOT NULL | Bcrypt hashed password |
| `is_active` | `BOOLEAN` | DEFAULT TRUE | Account active flag |
| `created_at` | `TIMESTAMP` | CURRENT_TIMESTAMP | User creation date |

### 3.17 Table: `roles`
**Primary Key:** `role_id (SERIAL)`  
**Description:** System and custom RBAC security roles with fast-path permission arrays.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `role_id` | `SERIAL` | PRIMARY KEY | Role record identifier |
| `role_key` | `TEXT` | UNIQUE, NOT NULL | Machine identifier (e.g. 'sales_manager') |
| `display_name` | `TEXT` | NOT NULL | Human friendly title |
| `description` | `TEXT` | NULLABLE | Scope and responsibilities |
| `is_system` | `BOOLEAN` | DEFAULT FALSE | Protected immutable system role flag |
| `permission_keys` | `TEXT[]` | DEFAULT '{}' | Fast-path array of assigned permission keys |
| `created_at` | `TIMESTAMP` | CURRENT_TIMESTAMP | Role creation timestamp |

### 3.18 Table: `permissions`
**Primary Key:** `permission_id (SERIAL)`  
**Description:** Granular capability keys gating backend endpoints and frontend features.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `permission_id` | `SERIAL` | PRIMARY KEY | Permission record identifier |
| `permission_key` | `TEXT` | UNIQUE, NOT NULL | String key (e.g. 'create_sale') |
| `module` | `TEXT` | NOT NULL | Categorization module |
| `description` | `TEXT` | NULLABLE | Action authorized by permission |

### 3.19 Table: `activity_logs`
**Primary Key:** `log_id (SERIAL)`  
**Description:** Comprehensive forensic audit trail recording field-level before/after diffs.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `log_id` | `SERIAL` | PRIMARY KEY | Audit log identifier |
| `user_email` | `TEXT` | NOT NULL | Actor employee email |
| `action_type` | `TEXT` | NOT NULL | Action ('CREATE', 'UPDATE', 'DELETE', 'LOGIN') |
| `action_description` | `TEXT` | NOT NULL | Human readable action summary |
| `entity_type` | `TEXT` | NULLABLE | Entity ('customer', 'sale', 'doctor', etc.) |
| `entity_id` | `INTEGER` | NULLABLE | Target entity primary key |
| `entity_name` | `TEXT` | NULLABLE | Target entity label |
| `metadata` | `JSONB` | NULLABLE | Detailed JSON payload including field diffs |
| `ip_address` | `TEXT` | NULLABLE | Client IP address |
| `created_at` | `TIMESTAMP` | CURRENT_TIMESTAMP | Audit timestamp |

### 3.20 Table: `tally_vouchers`
**Primary Key:** `id (SERIAL)`  
**Description:** Synchronized financial accounting vouchers from TallyPrime / Tally 9.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `id` | `SERIAL` | PRIMARY KEY | Internal voucher ID |
| `guid` | `TEXT` | UNIQUE | Tally global unique identifier |
| `voucher_type` | `TEXT` | INDEXED | Type ('Sales', 'Receipt', 'Journal', 'Contra') |
| `voucher_number` | `TEXT` | NULLABLE | Tally invoice / voucher number |
| `date` | `DATE` | NOT NULL | Voucher accounting date |
| `amount` | `REAL` | NOT NULL | Monetary transaction total |
| `party_ledger_name` | `TEXT` | NULLABLE | Account / Debtor / Creditor ledger |
| `company_name` | `TEXT` | NULLABLE | Tally company division |
| `is_reconciled` | `BOOLEAN` | DEFAULT FALSE | CRM matching reconciliation flag |
| `synced_at` | `TIMESTAMP` | CURRENT_TIMESTAMP | Ingestion timestamp |

### 3.21 Table: `recruitment_leads`
**Primary Key:** `candidate_id (SERIAL)`  
**Description:** Job candidates and applicants within the HR recruitment funnel.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `candidate_id` | `SERIAL` | PRIMARY KEY | Applicant identifier |
| `name` | `TEXT` | NOT NULL | Candidate full name |
| `mobile` | `TEXT` | NOT NULL | Candidate phone number |
| `email` | `TEXT` | NULLABLE | Email address |
| `role_applied` | `TEXT` | NOT NULL | Position (Field Officer, Telecaller, Manager) |
| `experience_years` | `REAL` | DEFAULT 0.0 | Total professional experience |
| `status` | `TEXT` | DEFAULT 'Applied' | Hiring stage ('Applied', 'Screening', 'Interview', 'Offered', 'Hired', 'Rejected') |
| `resume_url` | `TEXT` | NULLABLE | Storage link to resume document |
| `created_at` | `TIMESTAMP` | CURRENT_TIMESTAMP | Application date |

### 3.22 Table: `user_sessions`
**Primary Key:** `session_id (SERIAL)`  
**Description:** Active user sessions and heartbeat tracking for concurrency and security audit.

| Column Name | Data Type | Constraints & Defaults | Business Purpose |
|---|---|---|---|
| `session_id` | `SERIAL` | PRIMARY KEY | Session identifier |
| `user_email` | `TEXT` | NOT NULL | User email address |
| `login_time` | `TIMESTAMP` | CURRENT_TIMESTAMP | Initial session establishment |
| `last_heartbeat` | `TIMESTAMP` | CURRENT_TIMESTAMP | Most recent 60-second ping |
| `ip_address` | `TEXT` | NULLABLE | Client IP address |
| `user_agent` | `TEXT` | NULLABLE | Browser and operating system signature |
| `is_active` | `BOOLEAN` | DEFAULT TRUE | Live session state |

---

## 4. Module-by-Module In-Depth Manual (All 15 Modules)

### 4.1 MOD-01 — Authentication, RBAC & User Administration
**Functional Category:** Security & Administration  
**Core Summary:** Governs system access, multi-tenant RBAC permissions, audit trail logging, and live session heartbeats.

#### A. Associated Screens & Frontend User Interfaces
| Screen Name | Route Path | Source Component | Required Permission | User Capabilities & Key Controls |
|---|---|---|---|---|
| **Login Screen** | `/login` | `Login.tsx` | `Public` | Credential verification, JWT/Header issuance, and role extraction. |
| **User Management** | `/user-management` | `UserManagement.tsx` | `view_users` | Account creation, active toggling, role assignment, and password resets. |
| **Role Management** | `/role-management` | `RoleManagement.tsx` | `manage_roles` | RBAC matrix to create custom roles and assign from 52 granular permissions. |
| **Admin Overview** | `/admin` | `Admin.tsx` | `view_activity_logs` | High-level administrative system metrics, database health, and server stats. |
| **Activity Logs** | `/activity` | `Activity.tsx` | `Authenticated` | Forensic audit trail with field-level before/after diffs, user email, and IP. |

#### B. Business Operational Workflows
- User logs in -> Credentials verified -> User permissions resolved and cached in memory (10-min TTL) and AuthContext.
- Client requests protected endpoint -> x-user-email checked -> Fast-path array checked in-memory without database hit.
- System mutations trigger ActivityLogger.log_update_with_diff() recording exact field changes into activity_logs.
- Browser sends 60-second heartbeat to maintain active session presence and audit concurrency.

#### C. Database Tables Engaged
Tables engaged: `app_users`, `roles`, `permissions`, `role_permissions`, `activity_logs`, `user_sessions`

#### D. Module API Catalog (28 Endpoints)
| HTTP Method | Endpoint URL | Handler Function Name | Description / Operational Behavior |
|---|---|---|---|
| `GET` | `/api/admin/my-logs` | `get_my_activity_logs` | Executes operational logic for Get My Activity Logs. |
| `GET` | `/api/admin/health` | `health` | Executes operational logic for Health. |
| `GET` | `/api/admin/check-status` | `check_user_status` | Executes operational logic for Check User Status. |
| `GET` | `/api/admin/activity-logs` | `get_activity_logs` | Executes operational logic for Get Activity Logs. |
| `GET` | `/api/admin/activity-logs/stats` | `get_activity_stats` | Executes operational logic for Get Activity Stats. |
| `GET` | `/api/admin/users` | `get_all_users` | Executes operational logic for Get All Users. |
| `GET` | `/api/admin/app-users` | `get_app_users` | Executes operational logic for Get App Users. |
| `DELETE` | `/api/admin/activity-logs/{log_id}` | `delete_activity_log` | Executes operational logic for Delete Activity Log. |
| `DELETE` | `/api/admin/activity-logs/bulk` | `delete_old_activity_logs` | Executes operational logic for Delete Old Activity Logs. |
| `PUT` | `/api/admin/update-product-price/{product_id}` | `update_product_price` | Executes operational logic for Update Product Price. |
| `POST` | `/api/admin/update-product-prices-bulk` | `update_product_prices_bulk` | Executes operational logic for Update Product Prices Bulk. |
| `POST` | `/api/admin/users` | `create_user` | Executes operational logic for Create User. |
| `PATCH` | `/api/admin/users/{target_email}/status` | `set_user_status` | Executes operational logic for Set User Status. |
| `PATCH` | `/api/admin/users/{target_email}/profile` | `update_user_profile` | Executes operational logic for Update User Profile. |
| `PATCH` | `/api/admin/users/{target_email}/password` | `reset_user_password` | Executes operational logic for Reset User Password. |
| `PATCH` | `/api/admin/users/{target_email}/role` | `update_user_role` | Executes operational logic for Update User Role. |
| `GET` | `/api/admin/user-sessions` | `get_all_user_sessions` | Executes operational logic for Get All User Sessions. |
| `GET` | `/api/admin/user-sessions/history` | `get_user_session_history` | Executes operational logic for Get User Session History. |
| `GET` | `/api/rbac/my-permissions` | `get_my_permissions` | Executes operational logic for Get My Permissions. |
| `GET` | `/api/rbac/roles` | `get_all_roles` | Executes operational logic for Get All Roles. |
| `POST` | `/api/rbac/roles` | `create_role` | Executes operational logic for Create Role. |
| `DELETE` | `/api/rbac/roles/{role_id}` | `delete_role` | Executes operational logic for Delete Role. |
| `GET` | `/api/rbac/permissions` | `get_all_permissions` | Executes operational logic for Get All Permissions. |
| `GET` | `/api/rbac/roles/{role_id}/permissions` | `get_role_permission_ids` | Executes operational logic for Get Role Permission Ids. |
| `PUT` | `/api/rbac/roles/{role_id}/permissions` | `update_role_permissions` | Executes operational logic for Update Role Permissions. |
| `POST` | `/api/user-sessions/heartbeat` | `session_heartbeat` | Executes operational logic for Session Heartbeat. |
| `GET` | `/api/user-sessions/today` | `get_today_session` | Executes operational logic for Get Today Session. |
| `POST` | `/api/user-sessions/log-auth` | `log_auth_event` | Executes operational logic for Log Auth Event. |

---

### 4.2 MOD-02 — Sabhasad (Farmer / Customer) Management
**Functional Category:** Customer Relationship Management  
**Core Summary:** Core registry of dairy cattle farmers. Handles phone sanitization, customer code deduplication, location tagging, and purchase summaries.

#### A. Associated Screens & Frontend User Interfaces
| Screen Name | Route Path | Source Component | Required Permission | User Capabilities & Key Controls |
|---|---|---|---|---|
| **Sabhasad Directory** | `/customers` | `Customers.tsx` | `view_customers` | Master directory of 10,000+ dairy farmers with 7-field search, phone duplicate detection, and full CRUD. |

#### B. Business Operational Workflows
- Farmer Onboarding: Form input -> Frontend phone validation -> Duplicate probe -> Backend +91/0 prefix strip -> DB insert.
- Customer Summary: Aggregates lifetime sales, paid amount, pending dues, cattle survey JSON, and last 20 call logs.
- Fuzzy Search: Debounced PostgREST ilike search across Name, Mobile, Village, Taluka, District, State, and Code.

#### C. Database Tables Engaged
Tables engaged: `customers`, `call_logs`, `sales`, `demos`

#### D. Module API Catalog (8 Endpoints)
| HTTP Method | Endpoint URL | Handler Function Name | Description / Operational Behavior |
|---|---|---|---|
| `GET` | `/api/customers/check-phone` | `check_customer_phone` | Executes operational logic for Check Customer Phone. |
| `GET` | `/api/customers/` | `get_customers` | Executes operational logic for Get Customers. |
| `GET` | `/api/customers/search` | `search_customers` | Executes operational logic for Search Customers. |
| `GET` | `/api/customers/{customer_id}/summary` | `get_customer_summary` | Executes operational logic for Get Customer Summary. |
| `GET` | `/api/customers/{customer_id}` | `get_customer` | Executes operational logic for Get Customer. |
| `POST` | `/api/customers/` | `create_customer` | Executes operational logic for Create Customer. |
| `PUT` | `/api/customers/{customer_id}` | `update_customer` | Executes operational logic for Update Customer. |
| `DELETE` | `/api/customers/{customer_id}` | `delete_customer` | Executes operational logic for Delete Customer. |

---

### 4.3 MOD-03 — Channel Partner Network (Distributors, Shopkeepers, Doctors, Field Officers)
**Functional Category:** Channel & Field Operations  
**Core Summary:** Manages the multi-tier agricultural distribution channel from cooperative unions down to village dairy collection centers.

#### A. Associated Screens & Frontend User Interfaces
| Screen Name | Route Path | Source Component | Required Permission | User Capabilities & Key Controls |
|---|---|---|---|---|
| **Distributors Directory** | `/distributors` | `Distributors.tsx` | `view_distributors` | Wholesalers and union distributors with linked Sabhasad counts and Mantri contacts. |
| **Shopkeepers Directory** | `/shopkeepers` | `Shopkeepers.tsx` | `view_shopkeepers` | Village agro-retailers with morning/evening milk collection volumes and participation counts. |
| **Veterinary Doctors** | `/doctors` | `Doctors.tsx` | `view_doctors` | Practicing veterinary surgeons, prescription history, and clinic associations. |
| **Field Officers** | `/field-officers` | `FieldOfficers.tsx` | `view_field_officers` | On-ground sales officers, territory assignments (districts/talukas), and demo execution. |

#### B. Business Operational Workflows
- Distributor Registration: Mantri details, affiliated Sabhasad counts, and location mappings registered.
- Shopkeeper Tracking: Daily milk intake (morning vs evening), payment recovery demo vs dispatch tracking.
- Field Officer Route Allocation: Specific districts and talukas bound to officers for on-ground sales and demos.

#### C. Database Tables Engaged
Tables engaged: `distributors`, `shopkeepers`, `doctors`, `field_officers`

#### D. Module API Catalog (20 Endpoints)
| HTTP Method | Endpoint URL | Handler Function Name | Description / Operational Behavior |
|---|---|---|---|
| `GET` | `/api/distributors/check-phone` | `check_distributor_phone` | Executes operational logic for Check Distributor Phone. |
| `GET` | `/api/distributors/search` | `search_distributors` | Executes operational logic for Search Distributors. |
| `GET` | `/api/distributors/resolved` | `get_resolved_distributors` | Executes operational logic for Get Resolved Distributors. |
| `GET` | `/api/distributors/` | `get_distributors` | Executes operational logic for Get Distributors. |
| `GET` | `/api/distributors/calculator` | `get_distributors_for_calculator` | Executes operational logic for Get Distributors For Calculator. |
| `POST` | `/api/distributors/` | `create_distributor` | Executes operational logic for Create Distributor. |
| `PUT` | `/api/distributors/{distributor_id}` | `update_distributor` | Executes operational logic for Update Distributor. |
| `DELETE` | `/api/distributors/{distributor_id}` | `delete_distributor` | Executes operational logic for Delete Distributor. |
| `GET` | `/api/shopkeepers/` | `get_shopkeepers` | Executes operational logic for Get Shopkeepers. |
| `POST` | `/api/shopkeepers/` | `create_shopkeeper` | Executes operational logic for Create Shopkeeper. |
| `PUT` | `/api/shopkeepers/{shopkeeper_id}` | `update_shopkeeper` | Executes operational logic for Update Shopkeeper. |
| `DELETE` | `/api/shopkeepers/{shopkeeper_id}` | `delete_shopkeeper` | Executes operational logic for Delete Shopkeeper. |
| `GET` | `/api/doctors/` | `get_doctors` | Executes operational logic for Get Doctors. |
| `POST` | `/api/doctors/` | `create_doctor` | Executes operational logic for Create Doctor. |
| `PUT` | `/api/doctors/{doctor_id}` | `update_doctor` | Executes operational logic for Update Doctor. |
| `DELETE` | `/api/doctors/{doctor_id}` | `delete_doctor` | Executes operational logic for Delete Doctor. |
| `GET` | `/api/field-officers/` | `get_field_officers` | Executes operational logic for Get Field Officers. |
| `POST` | `/api/field-officers/` | `create_field_officer` | Executes operational logic for Create Field Officer. |
| `PUT` | `/api/field-officers/{field_officer_id}` | `update_field_officer` | Executes operational logic for Update Field Officer. |
| `DELETE` | `/api/field-officers/{field_officer_id}` | `delete_field_officer` | Executes operational logic for Delete Field Officer. |

---

### 4.4 MOD-04 — Product Catalog & Dynamic Regional Pricing
**Functional Category:** Product & Inventory Management  
**Core Summary:** Maintains product formulas, packaging formats, and state-specific tiered pricing structures.

#### A. Associated Screens & Frontend User Interfaces
| Screen Name | Route Path | Source Component | Required Permission | User Capabilities & Key Controls |
|---|---|---|---|---|
| **Product Pricing Matrix** | `/product-pricing` | `ProductPricing.tsx` | `manage_pricing` | Product master catalog with packaging types, capacity, and regional price tiers (Gujarat, Maharashtra, MP, Custom). |

#### B. Business Operational Workflows
- Product Setup: Standard rates defined for baseline packaging (Bottles, Cans, Pouches, Bags).
- Regional Pricing: Pricing managers configure distinct state rates or custom JSON rate overrides.
- Order Rate Lookup: Automatically resolves the matching unit rate during order creation based on customer state.

#### C. Database Tables Engaged
Tables engaged: `products`, `product_regions`

#### D. Module API Catalog (12 Endpoints)
| HTTP Method | Endpoint URL | Handler Function Name | Description / Operational Behavior |
|---|---|---|---|
| `GET` | `/api/products/` | `get_products` | Executes operational logic for Get Products. |
| `GET` | `/api/products/all` | `get_all_products` | Executes operational logic for Get All Products. |
| `GET` | `/api/products/config/regions` | `get_product_regions` | Executes operational logic for Get Product Regions. |
| `POST` | `/api/products/config/regions` | `create_product_region` | Executes operational logic for Create Product Region. |
| `GET` | `/api/products/config/categories` | `get_product_categories` | Executes operational logic for Get Product Categories. |
| `POST` | `/api/products/config/categories` | `create_product_category` | Executes operational logic for Create Product Category. |
| `DELETE` | `/api/products/config/regions/{region_name}` | `delete_product_region` | Executes operational logic for Delete Product Region. |
| `DELETE` | `/api/products/config/categories/{category_name}` | `delete_product_category` | Executes operational logic for Delete Product Category. |
| `GET` | `/api/products/{product_id}` | `get_product` | Executes operational logic for Get Product. |
| `POST` | `/api/products/` | `create_product` | Executes operational logic for Create Product. |
| `PUT` | `/api/products/{product_id}` | `update_product` | Executes operational logic for Update Product. |
| `DELETE` | `/api/products/{product_id}` | `delete_product` | Executes operational logic for Delete Product. |

---

### 4.5 MOD-05 — Sales Order Booking, Invoicing & Dispatch
**Functional Category:** Sales & Order Fulfillment  
**Core Summary:** End-to-end sales lifecycle from telecaller booking and managerial validation to formal tax invoicing and dispatch.

#### A. Associated Screens & Frontend User Interfaces
| Screen Name | Route Path | Source Component | Required Permission | User Capabilities & Key Controls |
|---|---|---|---|---|
| **Sales & Invoicing** | `/sales` | `Sales.tsx` | `view_sales` | Direct order desk with multi-item grid, auto-calculated regional rates, and printable invoice PDF generation. |
| **Order Management** | `/orders` | `OrderManagement.tsx` | `view_orders` | Managerial approval desk for telecaller-booked orders. Allows review, approval, or rejection with reason. |

#### B. Business Operational Workflows
- Telecaller Booking: Telecaller creates telecaller_order with line items -> enters 'Pending' queue.
- Managerial Approval: Sales Manager inspects order on OrderManagement -> approves order -> transforms into sales record.
- Direct Sale Booking: Staff creates direct sale -> Postgres trigger assigns next sequential invoice_no -> creates invoice PDF.

#### C. Database Tables Engaged
Tables engaged: `sales`, `sale_items`, `telecaller_orders`, `telecaller_order_items`

#### D. Module API Catalog (21 Endpoints)
| HTTP Method | Endpoint URL | Handler Function Name | Description / Operational Behavior |
|---|---|---|---|
| `GET` | `/api/sales/` | `get_sales` | Executes operational logic for Get Sales. |
| `GET` | `/api/sales/pending-payments` | `sales_with_pending` | Executes operational logic for Sales With Pending. |
| `GET` | `/api/sales/refund-due` | `sales_with_refund_due` | Executes operational logic for Sales With Refund Due. |
| `POST` | `/api/sales/` | `create_sale` | Executes operational logic for Create Sale. |
| `POST` | `/api/sales/confirm` | `confirm_sales` | Executes operational logic for Confirm Sales. |
| `GET` | `/api/sales/{sale_id}` | `get_sale` | Executes operational logic for Get Sale. |
| `PUT` | `/api/sales/{sale_id}` | `update_sale` | Executes operational logic for Update Sale. |
| `DELETE` | `/api/sales/{sale_id}` | `delete_sale` | Executes operational logic for Delete Sale. |
| `GET` | `/api/sales/{sale_id}/invoice-pdf` | `get_invoice_pdf` | Executes operational logic for Get Invoice Pdf. |
| `POST` | `/api/telecaller-orders/` | `create_telecaller_order` | Executes operational logic for Create Telecaller Order. |
| `GET` | `/api/telecaller-orders/` | `get_telecaller_orders` | Executes operational logic for Get Telecaller Orders. |
| `POST` | `/api/telecaller-orders/{order_id}/telecaller-confirm` | `telecaller_confirm_order` | Executes operational logic for Telecaller Confirm Order. |
| `GET` | `/api/telecaller-orders/pending` | `get_pending_telecaller_orders` | Executes operational logic for Get Pending Telecaller Orders. |
| `POST` | `/api/telecaller-orders/bulk-mark-approved` | `bulk_mark_approved` | Executes operational logic for Bulk Mark Approved. |
| `POST` | `/api/telecaller-orders/{order_id}/approve` | `approve_telecaller_order` | Executes operational logic for Approve Telecaller Order. |
| `POST` | `/api/telecaller-orders/{order_id}/reject` | `reject_telecaller_order` | Executes operational logic for Reject Telecaller Order. |
| `GET` | `/api/telecaller-orders/my-confirmation-calls` | `get_my_confirmation_calls` | Executes operational logic for Get My Confirmation Calls. |
| `GET` | `/api/telecaller-orders/export-merged-excel/{sale_id}` | `export_merged_excel` | Executes operational logic for Export Merged Excel. |
| `GET` | `/api/telecaller-orders/export-confirmations-excel` | `export_confirmations_excel` | Executes operational logic for Export Confirmations Excel. |
| `POST` | `/api/telecaller-orders/export-selected` | `export_selected_orders` | Executes operational logic for Export Selected Orders. |
| `GET` | `/api/telecaller-orders/{order_id}` | `get_telecaller_order` | Executes operational logic for Get Telecaller Order. |

---

### 4.6 MOD-06 — Payment Collections & Financial Ledger
**Functional Category:** Finance & Collections  
**Core Summary:** Handles customer debt recovery, partial payments, installment logging, and automated invoice payment status reconciliation.

#### A. Associated Screens & Frontend User Interfaces
| Screen Name | Route Path | Source Component | Required Permission | User Capabilities & Key Controls |
|---|---|---|---|---|
| **Payments Desk** | `/payments` | `Payments.tsx` | `view_payments` | Collection register tracking receipts, payment methods (Cash, UPI, RTGS, Cheque), RRNs, and invoice balance updates. |

#### B. Business Operational Workflows
- Payment Receipt: Collector logs amount received, payment method, bank RRN reference, and linked invoice.
- Automatic Status Update: Backend recalculates total payments against invoice -> flips payment_status to 'Paid' or 'Partial'.
- Collection Reports: Generates exportable summaries for daily cash flow and debtor aging.

#### C. Database Tables Engaged
Tables engaged: `payments`, `sales`

#### D. Module API Catalog (8 Endpoints)
| HTTP Method | Endpoint URL | Handler Function Name | Description / Operational Behavior |
|---|---|---|---|
| `GET` | `/api/payments/` | `get_payments` | Executes operational logic for Get Payments. |
| `GET` | `/api/payments/pending` | `get_pending` | Executes operational logic for Get Pending. |
| `GET` | `/api/payments/sale/{sale_id}` | `get_payment_history` | Executes operational logic for Get Payment History. |
| `GET` | `/api/payments/{payment_id}` | `get_payment` | Executes operational logic for Get Payment. |
| `POST` | `/api/payments/test` | `test_payment_creation` | Executes operational logic for Test Payment Creation. |
| `POST` | `/api/payments/` | `create_payment` | Executes operational logic for Create Payment. |
| `PUT` | `/api/payments/{payment_id}` | `update_payment` | Executes operational logic for Update Payment. |
| `DELETE` | `/api/payments/{payment_id}` | `delete_payment` | Executes operational logic for Delete Payment. |

---

### 4.7 MOD-07 — Product Demonstrations & Field Officer Scheduling
**Functional Category:** Field Marketing & Demos  
**Core Summary:** Coordinates on-farm product trials of cattle feed supplements, farmer feedback collection, and lead conversion.

#### A. Associated Screens & Frontend User Interfaces
| Screen Name | Route Path | Source Component | Required Permission | User Capabilities & Key Controls |
|---|---|---|---|---|
| **Product Demo Logs** | `/demos` | `Demos.tsx` | `view_demos` | Registry of product trials, sample quantities provided, farmer reactions, and conversion outcomes. |
| **Demo Scheduler** | `/demo-scheduler` | `DemoScheduler.tsx` | `view_demos` | Calendar scheduler assigning field officers to farmers for demonstration visits with time slots. |

#### B. Business Operational Workflows
- Trial Scheduling: Farmer requested trial -> Scheduler assigns field officer, product, and scheduled visit date/time.
- Execution & Sampling: Officer conducts demo, provides sample pack (e.g. 1 kg Mineral Mixture), logs observations.
- Trial Conversion: Follow-up call verifies results -> converts successful trial into regular monthly orders.

#### C. Database Tables Engaged
Tables engaged: `demos`, `field_officers`, `products`, `customers`

#### D. Module API Catalog (8 Endpoints)
| HTTP Method | Endpoint URL | Handler Function Name | Description / Operational Behavior |
|---|---|---|---|
| `GET` | `/api/demos/suggestions` | `get_demo_suggestions` | Executes operational logic for Get Demo Suggestions. |
| `GET` | `/api/demos/redemo` | `get_redemo_history` | Executes operational logic for Get Redemo History. |
| `GET` | `/api/demos/` | `get_demos` | Executes operational logic for Get Demos. |
| `GET` | `/api/demos/{demo_id}` | `get_demo` | Executes operational logic for Get Demo. |
| `POST` | `/api/demos/` | `create_demo` | Executes operational logic for Create Demo. |
| `PUT` | `/api/demos/{demo_id}` | `update_demo` | Executes operational logic for Update Demo. |
| `PUT` | `/api/demos/{demo_id}/status` | `update_demo_status` | Executes operational logic for Update Demo Status. |
| `DELETE` | `/api/demos/{demo_id}` | `delete_demo` | Executes operational logic for Delete Demo. |

---

### 4.8 MOD-08 — Automated Call Distribution & Telecaller Duty Roster
**Functional Category:** Telecalling Operations  
**Core Summary:** Intelligent, load-aware call distribution engine balancing customer calls among telecallers every morning.

#### A. Associated Screens & Frontend User Interfaces
| Screen Name | Route Path | Source Component | Required Permission | User Capabilities & Key Controls |
|---|---|---|---|---|
| **Call Distribution** | `/call-distribution` | `CallDistribution.tsx` | `run_call_distribution` | Workload balancer, 10 AM automatic assignment, telecaller capacity monitor, and priority scoring. |
| **Telecaller Calling List** | `/calling-list` | `CallingList.tsx` | `view_calling_list` | Telecaller terminal with click-to-call, customer profile, call outcome logging, and tri-lingual survey form. |

#### B. Business Operational Workflows
- Morning Duty Sheet: Telecallers mark morning attendance -> Only present telecallers are eligible for assignments.
- 10:00 AM Cron Distribution: System evaluates unassigned customers -> computes priority score -> assigns balanced batches.
- Call Execution: Telecaller calls farmer -> selects outcome ('Interested', 'Order Placed', 'Ringing', etc.) -> records cattle survey.

#### C. Database Tables Engaged
Tables engaged: `calling_assignments`, `telecaller_attendance`, `duty_sheet_log`, `call_logs`

#### D. Module API Catalog (30 Endpoints)
| HTTP Method | Endpoint URL | Handler Function Name | Description / Operational Behavior |
|---|---|---|---|
| `GET` | `/api/automation/debug-state` | `debug_state` | Executes operational logic for Debug State. |
| `GET` | `/api/automation/my-assignments` | `get_my_assignments` | Executes operational logic for Get My Assignments. |
| `POST` | `/api/automation/reorder-assignments` | `reorder_assignments` | Executes operational logic for Reorder Assignments. |
| `GET` | `/api/automation/my-callbacks` | `get_my_callbacks` | Executes operational logic for Get My Callbacks. |
| `GET` | `/api/automation/calling-summary` | `get_calling_summary` | Executes operational logic for Get Calling Summary. |
| `POST` | `/api/automation/start-call-timer` | `start_call_timer` | Executes operational logic for Start Call Timer. |
| `POST` | `/api/automation/log-adhoc-call` | `log_adhoc_call` | Executes operational logic for Log Adhoc Call. |
| `POST` | `/api/automation/update-call-status` | `update_call_status` | Executes operational logic for Update Call Status. |
| `GET` | `/api/automation/telecallers` | `get_telecallers` | Executes operational logic for Get Telecallers. |
| `GET` | `/api/automation/admin/telecaller-profile` | `get_telecaller_profile` | Executes operational logic for Get Telecaller Profile. |
| `GET` | `/api/automation/admin/assignments` | `get_admin_assignments` | Executes operational logic for Get Admin Assignments. |
| `GET` | `/api/automation/admin/export-assignments-excel` | `export_admin_assignments_excel` | Executes operational logic for Export Admin Assignments Excel. |
| `POST` | `/api/automation/admin/distribute-mantris` | `admin_distribute` | Executes operational logic for Admin Distribute. |
| `POST` | `/api/automation/admin/distribute-sabhsads` | `distribute_sabhsads` | Executes operational logic for Distribute Sabhsads. |
| `POST` | `/api/automation/admin/undo-village-assignment` | `undo_village_assignment` | Executes operational logic for Undo Village Assignment. |
| `GET` | `/api/automation/locations` | `get_locations` | Executes operational logic for Get Locations. |
| `POST` | `/api/automation/admin/reassign` | `admin_reassign` | Executes operational logic for Admin Reassign. |
| `GET` | `/api/automation/distribution-status` | `get_distribution_status` | Executes operational logic for Get Distribution Status. |
| `POST` | `/api/automation/admin/refresh-distribution` | `admin_refresh_distribution` | Executes operational logic for Admin Refresh Distribution. |
| `GET` | `/api/automation/admin/available-counts` | `get_available_counts` | Executes operational logic for Get Available Counts. |
| `POST` | `/api/automation/admin/bulk-reassign` | `admin_bulk_reassign` | Executes operational logic for Admin Bulk Reassign. |
| `POST` | `/api/automation/admin/transfer-pending` | `admin_transfer_pending` | Executes operational logic for Admin Transfer Pending. |
| `POST` | `/api/automation/trigger-daily` | `trigger_daily_cron` | Executes operational logic for Trigger Daily Cron. |
| `POST` | `/api/automation/trigger-midnight` | `trigger_midnight_cron` | Executes operational logic for Trigger Midnight Cron. |
| `POST` | `/api/automation/trigger-scoring` | `trigger_scoring_cron` | Executes operational logic for Trigger Scoring Cron. |
| `GET` | `/api/attendance/duty-sheet-status` | `get_duty_sheet_status` | Executes operational logic for Get Duty Sheet Status. |
| `GET` | `/api/attendance/telecallers` | `get_all_telecallers` | Executes operational logic for Get All Telecallers. |
| `POST` | `/api/attendance/submit-duty-sheet` | `submit_duty_sheet` | Executes operational logic for Submit Duty Sheet. |
| `GET` | `/api/attendance/status` | `get_attendance_status` | Executes operational logic for Get Attendance Status. |
| `POST` | `/api/attendance/mark` | `mark_attendance` | Executes operational logic for Mark Attendance. |

---

### 4.9 MOD-09 — AI Voice-to-Text & Call Intelligence Engine
**Functional Category:** Artificial Intelligence & Voice  
**Core Summary:** Vernacular voice dictation engine integrating Web Speech API and Sarvam AI models for multilingual dairy farming terminology.

#### A. Associated Screens & Frontend User Interfaces
| Screen Name | Route Path | Source Component | Required Permission | User Capabilities & Key Controls |
|---|---|---|---|---|
| **Voice Input Component** | `Global Component` | `VoiceTextField.tsx` | `Global` | Universal microphone dictation supporting Gujarati, Hindi, and English with real-time waveform and Alt+V shortcut. |

#### B. Business Operational Workflows
- Live Speech Recognition: User speaks -> Browser speech recognition streams interim transcripts -> merges with existing input.
- Sarvam AI Audio Fallback: MediaRecorder chunks sent to backend Sarvam AI service for high-accuracy vernacular transcription.
- Cattle Survey Ingestion: Voice responses parsed into structured cattle_profile JSON attached to customer records.

#### C. Database Tables Engaged
Tables engaged: `call_logs`

#### D. Module API Catalog (2 Endpoints)
| HTTP Method | Endpoint URL | Handler Function Name | Description / Operational Behavior |
|---|---|---|---|
| `POST` | `/api/call-logger/transcribe-chunk` | `transcribe_chunk` | Executes operational logic for Transcribe Chunk. |
| `POST` | `/api/call-logger/analyze` | `analyze_transcript` | Executes operational logic for Analyze Transcript. |

---

### 4.10 MOD-10 — Lead Pipeline & CRM Workspace
**Functional Category:** Lead Management & Sales Funnel  
**Core Summary:** Comprehensive CRM sales funnel tracking prospects from initial inquiry to qualified Sabhasad buyer.

#### A. Associated Screens & Frontend User Interfaces
| Screen Name | Route Path | Source Component | Required Permission | User Capabilities & Key Controls |
|---|---|---|---|---|
| **Lead Dashboard** | `/lead-dashboard` | `LeadDashboard.tsx` | `view_lead_dashboard` | Lead funnel metrics, channel acquisition breakdown, conversion rates, and pipeline health. |
| **Lead Kanban Pipeline** | `/leads` | `LeadPipeline.tsx` | `view_all_leads` | Drag-and-drop visual pipeline across stages: New, Contacted, Qualified, Demo, Won, Lost. |
| **Lead Detail Workspace** | `/lead-workspace` | `LeadWorkspace.tsx` | `work_leads` | Individual lead detail cockpit with interaction timeline, follow-up scheduling, and quotation drafting. |
| **Lead History** | `/lead-history` | `LeadHistory.tsx` | `work_leads` | Full chronological audit log of all communications, calls, and status shifts for a lead. |

#### B. Business Operational Workflows
- Lead Capture: Inbound inquiries from marketing or exhibitions recorded with source and dairy size.
- Stage Progression: Sales rep works lead through Kanban stages -> logs follow-up dates and task reminders.
- Conversion: Won leads automatically transition into active Sabhasad records with first order booking.

#### C. Database Tables Engaged
Tables engaged: `customers`, `call_logs`, `notes`, `demos`

#### D. Module API Catalog (25 Endpoints)
| HTTP Method | Endpoint URL | Handler Function Name | Description / Operational Behavior |
|---|---|---|---|
| `POST` | `/api/leads/intake` | `intake_lead` | Executes operational logic for Intake Lead. |
| `POST` | `/api/leads/intake/rfq` | `intake_rfq` | Executes operational logic for Intake Rfq. |
| `GET` | `/api/leads/` | `get_all_leads` | Executes operational logic for Get All Leads. |
| `GET` | `/api/leads/stats/pipeline` | `get_pipeline_stats` | Executes operational logic for Get Pipeline Stats. |
| `GET` | `/api/leads/my` | `get_my_leads` | Executes operational logic for Get My Leads. |
| `GET` | `/api/leads/sources` | `get_lead_sources` | Executes operational logic for Get Lead Sources. |
| `POST` | `/api/leads/sources` | `save_lead_source` | Executes operational logic for Save Lead Source. |
| `DELETE` | `/api/leads/sources/{source_id}` | `delete_lead_source` | Executes operational logic for Delete Lead Source. |
| `GET` | `/api/leads/{lead_id}/activities` | `get_lead_activities` | Executes operational logic for Get Lead Activities. |
| `GET` | `/api/leads/{lead_id}` | `get_lead` | Executes operational logic for Get Lead. |
| `GET` | `/api/leads/{lead_id}/detail` | `get_lead_detail_owner` | Executes operational logic for Get Lead Detail Owner. |
| `POST` | `/api/leads/{lead_id}/assign` | `assign_lead` | Executes operational logic for Assign Lead. |
| `POST` | `/api/leads/{lead_id}/comment` | `manager_comment` | Executes operational logic for Manager Comment. |
| `DELETE` | `/api/leads/{lead_id}` | `delete_lead` | Executes operational logic for Delete Lead. |
| `PATCH` | `/api/leads/{lead_id}` | `update_lead` | Executes operational logic for Update Lead. |
| `POST` | `/api/leads/{lead_id}/activities` | `log_activity` | Executes operational logic for Log Activity. |
| `POST` | `/api/leads/{lead_id}/close` | `close_lead` | Executes operational logic for Close Lead. |
| `GET` | `/api/leads/owners/list` | `get_lead_owners` | Executes operational logic for Get Lead Owners. |
| `GET` | `/api/leads/{lead_id}/quotation` | `get_quotation` | Executes operational logic for Get Quotation. |
| `GET` | `/api/leads/{lead_id}/quotations/history` | `get_quotation_history` | Executes operational logic for Get Quotation History. |
| `PUT` | `/api/leads/{lead_id}/quotation` | `upsert_quotation` | Executes operational logic for Upsert Quotation. |
| `POST` | `/api/leads/{lead_id}/quotation/commit` | `commit_quotation` | Executes operational logic for Commit Quotation. |
| `POST` | `/api/leads/{lead_id}/quotation/attachment` | `upload_quotation_attachment` | Executes operational logic for Upload Quotation Attachment. |
| `DELETE` | `/api/leads/{lead_id}/quotation/attachment` | `delete_quotation_attachment` | Executes operational logic for Delete Quotation Attachment. |
| `GET` | `/api/leads/{lead_id}/quotation/html` | `get_quotation_html` | Executes operational logic for Get Quotation Html. |

---

### 4.11 MOD-11 — Tally ERP Integration & Voucher Reconciliation
**Functional Category:** ERP Integration & Accounting  
**Core Summary:** Bridges the operational PC-Sales CRM with corporate Tally ERP financial ledgers.

#### A. Associated Screens & Frontend User Interfaces
| Screen Name | Route Path | Source Component | Required Permission | User Capabilities & Key Controls |
|---|---|---|---|---|
| **Tally Data Integration** | `/tally-data` | `TallyData.tsx` | `view_tally_data` | Sync station for TallyPrime/Tally 9 XML & Excel vouchers. Reconciles Sales, Receipts, and Journal entries. |

#### B. Business Operational Workflows
- Voucher Ingestion: Batch import of XML/Excel voucher dumps exported from Tally ERP.
- Cross-Reconciliation: Matches Tally Sales/Receipt vouchers with CRM invoices and payments by date, party, and amount.
- Audit & Cleanup: Soft-deletes superseded entries and identifies unmatched financial discrepancies.

#### C. Database Tables Engaged
Tables engaged: `tally_vouchers`, `sales`, `payments`

#### D. Module API Catalog (7 Endpoints)
| HTTP Method | Endpoint URL | Handler Function Name | Description / Operational Behavior |
|---|---|---|---|
| `GET` | `/api/tally/ping` | `ping_backend` | Executes operational logic for Ping Backend. |
| `GET` | `/api/tally/audit` | `audit_vouchers` | Executes operational logic for Audit Vouchers. |
| `POST` | `/api/tally/ingest` | `ingest_vouchers` | Executes operational logic for Ingest Vouchers. |
| `POST` | `/api/tally/reconcile/cleanup` | `reconcile_cleanup` | Executes operational logic for Reconcile Cleanup. |
| `GET` | `/api/tally/vouchers` | `list_vouchers` | Executes operational logic for List Vouchers. |
| `GET` | `/api/tally/stats` | `get_stats` | Executes operational logic for Get Stats. |
| `GET` | `/api/tally/filter-options` | `get_filter_options` | Executes operational logic for Get Filter Options. |

---

### 4.12 MOD-12 — Excel Data Import & Ingestion Pipeline
**Functional Category:** Data Engineering & Migration  
**Core Summary:** Enterprise data ingestion engine transforming messy legacy spreadsheets into clean database records.

#### A. Associated Screens & Frontend User Interfaces
| Screen Name | Route Path | Source Component | Required Permission | User Capabilities & Key Controls |
|---|---|---|---|---|
| **Data Import Hub** | `/import` | `DataImport.tsx` | `import_data` | Bulk ingestion station with fuzzy alias matching, data validation preview, conflict detection, and batch insertion. |

#### B. Business Operational Workflows
- Spreadsheet Upload: User uploads raw Excel (.xlsx, .xls) containing farmer or distributor lists.
- Preprocessing & Alias Resolution: Python backend maps aliases (e.g. 'Farmer Name' -> 'name'), parses phone numbers, infers morning/evening split columns.
- Preview Grid: Frontend highlights duplicates, validation warnings, and new rows for user confirmation.
- Batch Ingestion: One-click commit inserts validated rows and creates permanent audit entry in import_history.

#### C. Database Tables Engaged
Tables engaged: `import_history`, `customers`, `distributors`

#### D. Module API Catalog (8 Endpoints)
| HTTP Method | Endpoint URL | Handler Function Name | Description / Operational Behavior |
|---|---|---|---|
| `POST` | `/api/imports/distributors/confirm-import` | `confirm_import_distributors` | Executes operational logic for Confirm Import Distributors. |
| `POST` | `/api/imports/distributors/preprocess` | `preprocess_distributors` | Executes operational logic for Preprocess Distributors. |
| `POST` | `/api/imports/sabhasad/preprocess` | `preprocess_sabhasads` | Executes operational logic for Preprocess Sabhasads. |
| `POST` | `/api/imports/sabhasad/confirm-import` | `confirm_import_sabhasads` | Executes operational logic for Confirm Import Sabhasads. |
| `POST` | `/api/imports/excel` | `import_excel` | Executes operational logic for Import Excel. |
| `GET` | `/api/imports/history` | `get_import_history` | Executes operational logic for Get Import History. |
| `DELETE` | `/api/imports/history/{import_id}` | `delete_import_history` | Executes operational logic for Delete Import History. |
| `POST` | `/api/imports/rollback-latest` | `rollback_latest_import` | Executes operational logic for Rollback Latest Import. |

---

### 4.13 MOD-13 — Executive BI Dashboard & Advanced Reporting
**Functional Category:** Business Intelligence & Analytics  
**Core Summary:** Real-time executive metrics, sales velocity tracking, and automated PDF/Excel business report generation.

#### A. Associated Screens & Frontend User Interfaces
| Screen Name | Route Path | Source Component | Required Permission | User Capabilities & Key Controls |
|---|---|---|---|---|
| **Executive Dashboard** | `/dashboard` | `Dashboard.tsx` | `view_dashboard` | Real-time command center showing gross revenue, active customers, pending collections, and top products. |
| **BI Reports Hub** | `/reports` | `Reports.tsx` | `view_reports` | Multi-dimensional reporting console generating custom PDF & Excel reports by district, taluka, product, and agent. |

#### B. Business Operational Workflows
- Dashboard Aggregation: Real-time queries calculate monthly targets, collection percentages, and top customers.
- Report Generation: Users specify date ranges and dimensions -> backend compiles publication-grade PDF and multi-tab Excel workbooks.

#### C. Database Tables Engaged
Tables engaged: `sales`, `payments`, `customers`, `products`

#### D. Module API Catalog (27 Endpoints)
| HTTP Method | Endpoint URL | Handler Function Name | Description / Operational Behavior |
|---|---|---|---|
| `GET` | `/api/dashboard/metrics` | `dashboard_metrics` | Executes operational logic for Dashboard Metrics. |
| `GET` | `/api/dashboard/collected-payments` | `get_collected_payments` | Executes operational logic for Get Collected Payments. |
| `GET` | `/api/dashboard/sales-trend` | `sales_trend` | Executes operational logic for Sales Trend. |
| `GET` | `/api/dashboard/recent-sales` | `recent_sales` | Executes operational logic for Recent Sales. |
| `GET` | `/api/dashboard/upcoming-demos` | `upcoming_demos` | Executes operational logic for Upcoming Demos. |
| `GET` | `/api/dashboard/system-start-date` | `system_start_date` | Executes operational logic for System Start Date. |
| `GET` | `/api/reports/sales-trend` | `get_sales_trend` | Executes operational logic for Get Sales Trend. |
| `GET` | `/api/reports/analytics-summary` | `get_analytics_summary` | Executes operational logic for Get Analytics Summary. |
| `GET` | `/api/reports/dimension-breakdown` | `get_dimension_breakdown` | Executes operational logic for Get Dimension Breakdown. |
| `GET` | `/api/reports/filter-options` | `get_filter_options` | Executes operational logic for Get Filter Options. |
| `GET` | `/api/reports/payment-trend` | `get_payment_trend` | Executes operational logic for Get Payment Trend. |
| `GET` | `/api/reports/sales-order-summary-pdf` | `generate_sales_order_summary_pdf` | Executes operational logic for Generate Sales Order Summary Pdf. |
| `GET` | `/api/reports/sales-summary` | `sales_summary` | Executes operational logic for Sales Summary. |
| `GET` | `/api/reports/customers-pdf` | `generate_customers_pdf` | Executes operational logic for Generate Customers Pdf. |
| `GET` | `/api/reports/invoices-pdf` | `generate_invoices_pdf` | Executes operational logic for Generate Invoices Pdf. |
| `GET` | `/api/reports/payments-pdf` | `generate_payments_pdf` | Executes operational logic for Generate Payments Pdf. |
| `GET` | `/api/reports/calling-list-pdf` | `generate_calling_list_pdf` | Executes operational logic for Generate Calling List Pdf. |
| `GET` | `/api/reports/sales-analytics-pdf` | `get_sales_analytics_pdf` | Executes operational logic for Get Sales Analytics Pdf. |
| `GET` | `/api/reports/sales-analytics-excel` | `get_sales_analytics_excel` | Executes operational logic for Get Sales Analytics Excel. |
| `GET` | `/api/reports/product-report-pdf` | `get_product_report_pdf` | Executes operational logic for Get Product Report Pdf. |
| `GET` | `/api/reports/product-report-excel` | `get_product_report_excel` | Executes operational logic for Get Product Report Excel. |
| `GET` | `/api/reports/customer-analytics-pdf` | `get_customer_analytics_pdf` | Executes operational logic for Get Customer Analytics Pdf. |
| `GET` | `/api/reports/customer-analytics-excel` | `get_customer_analytics_excel` | Executes operational logic for Get Customer Analytics Excel. |
| `GET` | `/api/reports/telecaller-dashboard` | `get_telecaller_dashboard_route` | Executes operational logic for Get Telecaller Dashboard Route. |
| `GET` | `/api/reports/telecaller/{report_type}/{format}` | `download_telecaller_report` | Executes operational logic for Download Telecaller Report. |
| `GET` | `/api/reports/telecaller/charts` | `get_telecaller_charts_api` | Executes operational logic for Get Telecaller Charts Api. |
| `GET` | `/api/analytics/payment-distribution` | `payment_distribution` | Executes operational logic for Payment Distribution. |

---

### 4.14 MOD-14 — Predictive Demand Forecasting & Scoring Engine
**Functional Category:** Machine Learning & Algorithms  
**Core Summary:** Empowers supply chain managers with predictive demand forecasting and telecallers with prioritized calling scores.

#### A. Associated Screens & Frontend User Interfaces
| Screen Name | Route Path | Source Component | Required Permission | User Capabilities & Key Controls |
|---|---|---|---|---|
| **Demand Forecasting** | `/forecasting` | `Forecasting.tsx` | `run_forecasting` | Statistical inventory prediction projecting product demand 30/60/90 days ahead based on seasonal patterns. |
| **Scoring Algorithm** | `/algorithm` | `Algorithm.tsx` | `run_algorithm` | ML-based scoring console rating farmers and distributors by conversion likelihood (0-100 score). |

#### B. Business Operational Workflows
- Time-Series Forecasting: Evaluates 12-month historical sales -> projects required inventory by state and product.
- Customer Scoring: Scoring engine calculates weights for order frequency, monetary value, recency, and cattle herd size.

#### C. Database Tables Engaged
Tables engaged: `sales`, `customers`, `distributors`

#### D. Module API Catalog (4 Endpoints)
| HTTP Method | Endpoint URL | Handler Function Name | Description / Operational Behavior |
|---|---|---|---|
| `POST` | `/api/algorithm/run` | `run_algorithm` | Executes operational logic for Run Algorithm. |
| `GET` | `/api/forecasting/monthly` | `get_monthly_forecast` | Executes operational logic for Get Monthly Forecast. |
| `GET` | `/api/forecasting/district` | `get_district_forecast` | Executes operational logic for Get District Forecast. |
| `GET` | `/api/forecasting/village` | `get_village_forecast` | Executes operational logic for Get Village Forecast. |

---

### 4.15 MOD-15 — HR Recruitment & Talent Acquisition System
**Functional Category:** Human Resources & Recruitment  
**Core Summary:** Streamlines hiring of field officers, telecallers, and administrative staff from resume screening to employment offers.

#### A. Associated Screens & Frontend User Interfaces
| Screen Name | Route Path | Source Component | Required Permission | User Capabilities & Key Controls |
|---|---|---|---|---|
| **Recruitment Workspace** | `/recruitment` | `RecruitmentWorkspace.tsx` | `view_recruitment` | Complete ATS pipeline managing applicants, interview stages, evaluation scorecards, and hiring offers. |

#### B. Business Operational Workflows
- Candidate Onboarding: HR enters applicant details, experience, role applied, and resume document link.
- Multi-stage Evaluation: Candidate progresses through Screening -> Round 1 -> Technical Interview -> HR Round.
- Offer & Onboarding: Evaluator records scorecard ratings -> system generates offer letter -> onboards into app_users.

#### C. Database Tables Engaged
Tables engaged: `recruitment_leads`, `recruitment_activities`

#### D. Module API Catalog (10 Endpoints)
| HTTP Method | Endpoint URL | Handler Function Name | Description / Operational Behavior |
|---|---|---|---|
| `GET` | `/api/recruitment/categories` | `get_recruitment_categories` | Executes operational logic for Get Recruitment Categories. |
| `GET` | `/api/recruitment/leads/check-duplicate` | `check_duplicate_candidate` | Executes operational logic for Check Duplicate Candidate. |
| `GET` | `/api/recruitment/leads/follow-ups` | `get_recruitment_follow_ups` | Executes operational logic for Get Recruitment Follow Ups. |
| `GET` | `/api/recruitment/leads` | `get_recruitment_leads` | Executes operational logic for Get Recruitment Leads. |
| `GET` | `/api/recruitment/leads/{lead_id}` | `get_recruitment_lead` | Executes operational logic for Get Recruitment Lead. |
| `GET` | `/api/recruitment/leads/{lead_id}/activities` | `get_candidate_activities` | Executes operational logic for Get Candidate Activities. |
| `POST` | `/api/recruitment/leads/{lead_id}/activities` | `record_candidate_activity` | Executes operational logic for Record Candidate Activity. |
| `POST` | `/api/recruitment/leads/{lead_id}/status` | `change_candidate_status` | Executes operational logic for Change Candidate Status. |
| `POST` | `/api/recruitment/leads` | `create_recruitment_lead` | Executes operational logic for Create Recruitment Lead. |
| `PATCH` | `/api/recruitment/leads/{lead_id}` | `update_recruitment_lead` | Executes operational logic for Update Recruitment Lead. |

---

## 5. End-to-End System Operational Workflows
### 5.1 Flow 1: Lead to Sabhasad Onboarding & Master Record Creation
1. **Lead Qualification:** Inbound inquiries from farmer exhibitions or field visits are logged in `/leads`. Lead owners conduct preliminary discovery calls.
2. **Onboarding Initiation:** User navigates to `/customers` and clicks **'Add Sabhasad'**.
3. **Frontend Validation:** Frontend enforces 10-digit Indian phone regex and verifies mandatory fields.
4. **Non-blocking Duplicate Probe:** Frontend calls `/api/customers/check-phone?mobile=...`. If an existing record exists, a modal warning displays the conflicting Sabhasad while allowing managerial override.
5. **Backend Sanitization & Commitment:** Backend cleans `+91` and `0` prefixes, normalizes text to uppercase, verifies `customer_code` uniqueness (returning HTTP 409 if duplicate), inserts into `customers`, and logs a `CREATE` audit record in `activity_logs`.

### 5.2 Flow 2: Automated 10:00 AM Call Distribution Pipeline
1. **Attendance Roster:** Between 08:30 AM and 09:59 AM, telecallers mark their morning attendance on `/calling-list`. This sets `is_present = TRUE` in `telecaller_attendance`.
2. **Automated Trigger:** At exactly 10:00 AM, APScheduler (or external cron hitting `/cron/distribute`) triggers `distribute_calls()`.
3. **Eligibility Verification:** The engine resolves all present telecallers. If none are present, the job aborts safely without error.
4. **Priority Scoring:** The algorithm selects up to 150 top unassigned customers/distributors sorted by computed priority score (frequency of past orders, herd size, days since last contact).
5. **Fair Distribution:** Leads are allocated in round-robin fashion evenly among available telecallers. Assignments are written to `calling_assignments` with status `pending`.

### 5.3 Flow 3: Telecaller Call Execution & Cattle Profile Survey
1. **Terminal Access:** Telecallers open `/calling-list`. Their daily assigned queue displays with farmer details, phone numbers, and past history.
2. **Click-to-Call & Dictation:** Telecaller dials farmer. During conversation, telecaller can press `Alt+V` in any input field to dictate notes in Gujarati, Hindi, or English using `VoiceTextField`.
3. **Survey Capture:** If farmer is interested, telecaller captures cattle herd data (number of cows/buffaloes, milk yield in liters, lactation stage, current feed).
4. **Outcome Submission:** Telecaller selects outcome (`Interested`, `Order Placed`, `Call Back Later`, `Ringing`, `Wrong Number`) and submits.
5. **Backend Processing:** Backend creates `call_logs` entry, parses cattle survey into `customers.cattle_profile`, updates assignment status to `completed`, and schedules follow-up if requested.

### 5.4 Flow 4: Telecaller Order Approval & Warehouse Dispatch
1. **Order Capture:** If a farmer orders during a call, the telecaller creates a booking via the terminal dialog. This writes to `telecaller_orders` with status `Pending`.
2. **Managerial Review:** Sales Managers open `/orders` (Order Management). Pending orders display itemized products, quantities, and delivery notes.
3. **Decision Gate:**
   - **If Approved:** Manager clicks **'Approve'**. System verifies customer credit/location, converts `telecaller_orders` into official `sales` record, generates formal `invoice_no` (via Postgres sequence trigger), sets `shipment_status = 'Pending'`, and alerts warehouse.
   - **If Rejected:** Manager enters mandatory `rejection_reason` (e.g. 'Invalid delivery address', 'Farmer declined confirmation'). Order is archived as `Rejected`.
4. **Dispatch:** Warehouse personnel update `shipment_status` to `Dispatched` and record carrier tracking details.

### 5.5 Flow 5: Multi-Region Invoicing & Payment Reconciliation
1. **Invoice Drafting:** In `/sales`, billing staff select customer and add items.
2. **Dynamic Price Application:** System inspects customer's `state` (e.g., Gujarat vs Maharashtra vs Madhya Pradesh). It queries `products` and applies the specific regional rate tier.
3. **Invoice Generation:** Sales order is committed. Invoices are downloadable as PDF formatted with company letterhead, tax breakdowns, and terms.
4. **Payment Recording:** When payment arrives, accountant visits `/payments`, enters amount, payment method (RTGS, Cash, UPI), and bank RRN.
5. **Ledger Balancing:** System calculates total collections against invoice total: sets `payment_status = 'Paid'` if fully settled, or `'Partial'` if balance remains.

### 5.6 Flow 6: Tally ERP Voucher Synchronization & Audit Reconciliation
1. **Data Export from Tally:** Company accountants export XML/Excel voucher dumps from TallyPrime.
2. **Batch Upload:** Accountant uploads files into `/tally-data`.
3. **Ingestion & Mapping:** Backend parses vouchers (Sales, Receipts, Journal entries), stores them in `tally_vouchers`, and maps party ledger names to CRM customers.
4. **Cross-Audit:** The system compares Tally amounts and dates with CRM sales orders, highlighting discrepancies, missing ledger entries, or duplicate receipts.
5. **Soft-Delete Cleanup:** Synchronized batches can be soft-deleted and purged to maintain clean accounting audit trails.

---

## 6. Complete Master API Specification Directory (246 Endpoints)
The following catalog documents all 246 backend endpoints registered in the FastAPI application:

| # | HTTP Method | Endpoint Route | Function Name | Module Category |
|---|---|---|---|---|
| 1 | `GET/HEAD` | `/openapi.json` | `openapi` | Core |
| 2 | `GET/HEAD` | `/docs` | `swagger_ui_html` | Core |
| 3 | `GET/HEAD` | `/docs/oauth2-redirect` | `swagger_ui_redirect` | Core |
| 4 | `GET/HEAD` | `/redoc` | `redoc_html` | Core |
| 5 | `GET` | `/` | `root` | Core |
| 6 | `GET` | `/health` | `health_check` | Core |
| 7 | `POST` | `/cron/distribute` | `cron_distribute` | Core |
| 8 | `POST` | `/cron/midnight-refresh` | `cron_midnight_refresh` | Core |
| 9 | `POST` | `/cron/nightly-scoring` | `cron_nightly_scoring` | Core |
| 10 | `GET` | `/api/customers/check-phone` | `check_customer_phone` | Customers |
| 11 | `GET` | `/api/customers/` | `get_customers` | Customers |
| 12 | `GET` | `/api/customers/search` | `search_customers` | Customers |
| 13 | `GET` | `/api/customers/{customer_id}/summary` | `get_customer_summary` | Customers |
| 14 | `GET` | `/api/customers/{customer_id}` | `get_customer` | Customers |
| 15 | `POST` | `/api/customers/` | `create_customer` | Customers |
| 16 | `PUT` | `/api/customers/{customer_id}` | `update_customer` | Customers |
| 17 | `DELETE` | `/api/customers/{customer_id}` | `delete_customer` | Customers |
| 18 | `GET` | `/api/products/` | `get_products` | Products & Pricing |
| 19 | `GET` | `/api/products/all` | `get_all_products` | Products & Pricing |
| 20 | `GET` | `/api/products/config/regions` | `get_product_regions` | Products & Pricing |
| 21 | `POST` | `/api/products/config/regions` | `create_product_region` | Products & Pricing |
| 22 | `GET` | `/api/products/config/categories` | `get_product_categories` | Products & Pricing |
| 23 | `POST` | `/api/products/config/categories` | `create_product_category` | Products & Pricing |
| 24 | `DELETE` | `/api/products/config/regions/{region_name}` | `delete_product_region` | Products & Pricing |
| 25 | `DELETE` | `/api/products/config/categories/{category_name}` | `delete_product_category` | Products & Pricing |
| 26 | `GET` | `/api/products/{product_id}` | `get_product` | Products & Pricing |
| 27 | `POST` | `/api/products/` | `create_product` | Products & Pricing |
| 28 | `PUT` | `/api/products/{product_id}` | `update_product` | Products & Pricing |
| 29 | `DELETE` | `/api/products/{product_id}` | `delete_product` | Products & Pricing |
| 30 | `GET` | `/api/sales/` | `get_sales` | Sales & Invoicing |
| 31 | `GET` | `/api/sales/pending-payments` | `sales_with_pending` | Sales & Invoicing |
| 32 | `GET` | `/api/sales/refund-due` | `sales_with_refund_due` | Sales & Invoicing |
| 33 | `POST` | `/api/sales/` | `create_sale` | Sales & Invoicing |
| 34 | `POST` | `/api/sales/confirm` | `confirm_sales` | Sales & Invoicing |
| 35 | `GET` | `/api/sales/{sale_id}` | `get_sale` | Sales & Invoicing |
| 36 | `PUT` | `/api/sales/{sale_id}` | `update_sale` | Sales & Invoicing |
| 37 | `DELETE` | `/api/sales/{sale_id}` | `delete_sale` | Sales & Invoicing |
| 38 | `GET` | `/api/sales/{sale_id}/invoice-pdf` | `get_invoice_pdf` | Sales & Invoicing |
| 39 | `GET` | `/api/payments/` | `get_payments` | Payments |
| 40 | `GET` | `/api/payments/pending` | `get_pending` | Payments |
| 41 | `GET` | `/api/payments/sale/{sale_id}` | `get_payment_history` | Payments |
| 42 | `GET` | `/api/payments/{payment_id}` | `get_payment` | Payments |
| 43 | `POST` | `/api/payments/test` | `test_payment_creation` | Payments |
| 44 | `POST` | `/api/payments/` | `create_payment` | Payments |
| 45 | `PUT` | `/api/payments/{payment_id}` | `update_payment` | Payments |
| 46 | `DELETE` | `/api/payments/{payment_id}` | `delete_payment` | Payments |
| 47 | `GET` | `/api/notes/` | `list_notes` | Core |
| 48 | `GET` | `/api/notes/sale/{sale_id}` | `get_notes_for_sale` | Core |
| 49 | `GET` | `/api/notes/sale/{sale_id}/items` | `get_sale_items_for_return` | Core |
| 50 | `POST` | `/api/notes/` | `create_note` | Core |
| 51 | `PATCH` | `/api/notes/{note_id}/void` | `void_note` | Core |
| 52 | `PATCH` | `/api/notes/{note_id}/pickup_status` | `update_pickup_status` | Core |
| 53 | `GET` | `/api/demos/suggestions` | `get_demo_suggestions` | Product Demos |
| 54 | `GET` | `/api/demos/redemo` | `get_redemo_history` | Product Demos |
| 55 | `GET` | `/api/demos/` | `get_demos` | Product Demos |
| 56 | `GET` | `/api/demos/{demo_id}` | `get_demo` | Product Demos |
| 57 | `POST` | `/api/demos/` | `create_demo` | Product Demos |
| 58 | `PUT` | `/api/demos/{demo_id}` | `update_demo` | Product Demos |
| 59 | `PUT` | `/api/demos/{demo_id}/status` | `update_demo_status` | Product Demos |
| 60 | `DELETE` | `/api/demos/{demo_id}` | `delete_demo` | Product Demos |
| 61 | `GET` | `/api/distributors/check-phone` | `check_distributor_phone` | Distributors |
| 62 | `GET` | `/api/distributors/search` | `search_distributors` | Distributors |
| 63 | `GET` | `/api/distributors/resolved` | `get_resolved_distributors` | Distributors |
| 64 | `GET` | `/api/distributors/` | `get_distributors` | Distributors |
| 65 | `GET` | `/api/distributors/calculator` | `get_distributors_for_calculator` | Distributors |
| 66 | `POST` | `/api/distributors/` | `create_distributor` | Distributors |
| 67 | `PUT` | `/api/distributors/{distributor_id}` | `update_distributor` | Distributors |
| 68 | `DELETE` | `/api/distributors/{distributor_id}` | `delete_distributor` | Distributors |
| 69 | `GET` | `/api/shopkeepers/` | `get_shopkeepers` | Shopkeepers |
| 70 | `POST` | `/api/shopkeepers/` | `create_shopkeeper` | Shopkeepers |
| 71 | `PUT` | `/api/shopkeepers/{shopkeeper_id}` | `update_shopkeeper` | Shopkeepers |
| 72 | `DELETE` | `/api/shopkeepers/{shopkeeper_id}` | `delete_shopkeeper` | Shopkeepers |
| 73 | `GET` | `/api/doctors/` | `get_doctors` | Veterinary Doctors |
| 74 | `POST` | `/api/doctors/` | `create_doctor` | Veterinary Doctors |
| 75 | `PUT` | `/api/doctors/{doctor_id}` | `update_doctor` | Veterinary Doctors |
| 76 | `DELETE` | `/api/doctors/{doctor_id}` | `delete_doctor` | Veterinary Doctors |
| 77 | `GET` | `/api/field-officers/` | `get_field_officers` | Field Officers |
| 78 | `POST` | `/api/field-officers/` | `create_field_officer` | Field Officers |
| 79 | `PUT` | `/api/field-officers/{field_officer_id}` | `update_field_officer` | Field Officers |
| 80 | `DELETE` | `/api/field-officers/{field_officer_id}` | `delete_field_officer` | Field Officers |
| 81 | `GET` | `/api/dashboard/metrics` | `dashboard_metrics` | Dashboard |
| 82 | `GET` | `/api/dashboard/collected-payments` | `get_collected_payments` | Dashboard |
| 83 | `GET` | `/api/dashboard/sales-trend` | `sales_trend` | Dashboard |
| 84 | `GET` | `/api/dashboard/recent-sales` | `recent_sales` | Dashboard |
| 85 | `GET` | `/api/dashboard/upcoming-demos` | `upcoming_demos` | Dashboard |
| 86 | `GET` | `/api/dashboard/system-start-date` | `system_start_date` | Dashboard |
| 87 | `GET` | `/api/reports/sales-trend` | `get_sales_trend` | BI Reports |
| 88 | `GET` | `/api/reports/analytics-summary` | `get_analytics_summary` | BI Reports |
| 89 | `GET` | `/api/reports/dimension-breakdown` | `get_dimension_breakdown` | BI Reports |
| 90 | `GET` | `/api/reports/filter-options` | `get_filter_options` | BI Reports |
| 91 | `GET` | `/api/reports/payment-trend` | `get_payment_trend` | BI Reports |
| 92 | `GET` | `/api/reports/sales-order-summary-pdf` | `generate_sales_order_summary_pdf` | BI Reports |
| 93 | `GET` | `/api/reports/sales-summary` | `sales_summary` | BI Reports |
| 94 | `GET` | `/api/reports/customers-pdf` | `generate_customers_pdf` | BI Reports |
| 95 | `GET` | `/api/reports/invoices-pdf` | `generate_invoices_pdf` | BI Reports |
| 96 | `GET` | `/api/reports/payments-pdf` | `generate_payments_pdf` | BI Reports |
| 97 | `GET` | `/api/reports/calling-list-pdf` | `generate_calling_list_pdf` | BI Reports |
| 98 | `GET` | `/api/reports/sales-analytics-pdf` | `get_sales_analytics_pdf` | BI Reports |
| 99 | `GET` | `/api/reports/sales-analytics-excel` | `get_sales_analytics_excel` | BI Reports |
| 100 | `GET` | `/api/reports/product-report-pdf` | `get_product_report_pdf` | BI Reports |
| 101 | `GET` | `/api/reports/product-report-excel` | `get_product_report_excel` | BI Reports |
| 102 | `GET` | `/api/reports/customer-analytics-pdf` | `get_customer_analytics_pdf` | BI Reports |
| 103 | `GET` | `/api/reports/customer-analytics-excel` | `get_customer_analytics_excel` | BI Reports |
| 104 | `GET` | `/api/reports/telecaller-dashboard` | `get_telecaller_dashboard_route` | BI Reports |
| 105 | `GET` | `/api/reports/telecaller/{report_type}/{format}` | `download_telecaller_report` | BI Reports |
| 106 | `GET` | `/api/reports/telecaller/charts` | `get_telecaller_charts_api` | BI Reports |
| 107 | `GET` | `/api/analytics/payment-distribution` | `payment_distribution` | Core |
| 108 | `GET` | `/api/admin/my-logs` | `get_my_activity_logs` | Admin & Users |
| 109 | `GET` | `/api/admin/health` | `health` | Admin & Users |
| 110 | `GET` | `/api/admin/check-status` | `check_user_status` | Admin & Users |
| 111 | `GET` | `/api/admin/activity-logs` | `get_activity_logs` | Admin & Users |
| 112 | `GET` | `/api/admin/activity-logs/stats` | `get_activity_stats` | Admin & Users |
| 113 | `GET` | `/api/admin/users` | `get_all_users` | Admin & Users |
| 114 | `GET` | `/api/admin/app-users` | `get_app_users` | Admin & Users |
| 115 | `DELETE` | `/api/admin/activity-logs/{log_id}` | `delete_activity_log` | Admin & Users |
| 116 | `DELETE` | `/api/admin/activity-logs/bulk` | `delete_old_activity_logs` | Admin & Users |
| 117 | `PUT` | `/api/admin/update-product-price/{product_id}` | `update_product_price` | Admin & Users |
| 118 | `POST` | `/api/admin/update-product-prices-bulk` | `update_product_prices_bulk` | Admin & Users |
| 119 | `POST` | `/api/admin/users` | `create_user` | Admin & Users |
| 120 | `PATCH` | `/api/admin/users/{target_email}/status` | `set_user_status` | Admin & Users |
| 121 | `PATCH` | `/api/admin/users/{target_email}/profile` | `update_user_profile` | Admin & Users |
| 122 | `PATCH` | `/api/admin/users/{target_email}/password` | `reset_user_password` | Admin & Users |
| 123 | `PATCH` | `/api/admin/users/{target_email}/role` | `update_user_role` | Admin & Users |
| 124 | `GET` | `/api/admin/user-sessions` | `get_all_user_sessions` | Admin & Users |
| 125 | `GET` | `/api/admin/user-sessions/history` | `get_user_session_history` | Admin & Users |
| 126 | `POST` | `/api/algorithm/run` | `run_algorithm` | Algorithms |
| 127 | `POST` | `/api/imports/distributors/confirm-import` | `confirm_import_distributors` | Data Import |
| 128 | `POST` | `/api/imports/distributors/preprocess` | `preprocess_distributors` | Data Import |
| 129 | `POST` | `/api/imports/sabhasad/preprocess` | `preprocess_sabhasads` | Data Import |
| 130 | `POST` | `/api/imports/sabhasad/confirm-import` | `confirm_import_sabhasads` | Data Import |
| 131 | `POST` | `/api/imports/excel` | `import_excel` | Data Import |
| 132 | `GET` | `/api/imports/history` | `get_import_history` | Data Import |
| 133 | `DELETE` | `/api/imports/history/{import_id}` | `delete_import_history` | Data Import |
| 134 | `POST` | `/api/imports/rollback-latest` | `rollback_latest_import` | Data Import |
| 135 | `GET` | `/api/automation/debug-state` | `debug_state` | Call Automation |
| 136 | `GET` | `/api/automation/my-assignments` | `get_my_assignments` | Call Automation |
| 137 | `POST` | `/api/automation/reorder-assignments` | `reorder_assignments` | Call Automation |
| 138 | `GET` | `/api/automation/my-callbacks` | `get_my_callbacks` | Call Automation |
| 139 | `GET` | `/api/automation/calling-summary` | `get_calling_summary` | Call Automation |
| 140 | `POST` | `/api/automation/start-call-timer` | `start_call_timer` | Call Automation |
| 141 | `POST` | `/api/automation/log-adhoc-call` | `log_adhoc_call` | Call Automation |
| 142 | `POST` | `/api/automation/update-call-status` | `update_call_status` | Call Automation |
| 143 | `GET` | `/api/automation/telecallers` | `get_telecallers` | Call Automation |
| 144 | `GET` | `/api/automation/admin/telecaller-profile` | `get_telecaller_profile` | Call Automation |
| 145 | `GET` | `/api/automation/admin/assignments` | `get_admin_assignments` | Call Automation |
| 146 | `GET` | `/api/automation/admin/export-assignments-excel` | `export_admin_assignments_excel` | Call Automation |
| 147 | `POST` | `/api/automation/admin/distribute-mantris` | `admin_distribute` | Call Automation |
| 148 | `POST` | `/api/automation/admin/distribute-sabhsads` | `distribute_sabhsads` | Call Automation |
| 149 | `POST` | `/api/automation/admin/undo-village-assignment` | `undo_village_assignment` | Call Automation |
| 150 | `GET` | `/api/automation/locations` | `get_locations` | Call Automation |
| 151 | `POST` | `/api/automation/admin/reassign` | `admin_reassign` | Call Automation |
| 152 | `GET` | `/api/automation/distribution-status` | `get_distribution_status` | Call Automation |
| 153 | `POST` | `/api/automation/admin/refresh-distribution` | `admin_refresh_distribution` | Call Automation |
| 154 | `GET` | `/api/automation/admin/available-counts` | `get_available_counts` | Call Automation |
| 155 | `POST` | `/api/automation/admin/bulk-reassign` | `admin_bulk_reassign` | Call Automation |
| 156 | `POST` | `/api/automation/admin/transfer-pending` | `admin_transfer_pending` | Call Automation |
| 157 | `POST` | `/api/automation/trigger-daily` | `trigger_daily_cron` | Call Automation |
| 158 | `POST` | `/api/automation/trigger-midnight` | `trigger_midnight_cron` | Call Automation |
| 159 | `POST` | `/api/automation/trigger-scoring` | `trigger_scoring_cron` | Call Automation |
| 160 | `GET` | `/api/notifications/` | `get_notifications` | Notifications |
| 161 | `GET` | `/api/notifications/unread-count` | `get_unread_count` | Notifications |
| 162 | `GET` | `/api/notifications/{notification_id}` | `get_notification` | Notifications |
| 163 | `POST` | `/api/notifications/` | `create_notification` | Notifications |
| 164 | `PUT` | `/api/notifications/mark-all-read` | `mark_all_read` | Notifications |
| 165 | `PUT` | `/api/notifications/{notification_id}/mark-read` | `mark_notification_read` | Notifications |
| 166 | `DELETE` | `/api/notifications/{notification_id}` | `delete_notification` | Notifications |
| 167 | `DELETE` | `/api/notifications/delete-old` | `delete_old_notifications` | Notifications |
| 168 | `GET` | `/api/rbac/my-permissions` | `get_my_permissions` | RBAC Security |
| 169 | `GET` | `/api/rbac/roles` | `get_all_roles` | RBAC Security |
| 170 | `POST` | `/api/rbac/roles` | `create_role` | RBAC Security |
| 171 | `DELETE` | `/api/rbac/roles/{role_id}` | `delete_role` | RBAC Security |
| 172 | `GET` | `/api/rbac/permissions` | `get_all_permissions` | RBAC Security |
| 173 | `GET` | `/api/rbac/roles/{role_id}/permissions` | `get_role_permission_ids` | RBAC Security |
| 174 | `PUT` | `/api/rbac/roles/{role_id}/permissions` | `update_role_permissions` | RBAC Security |
| 175 | `POST` | `/api/user-sessions/heartbeat` | `session_heartbeat` | User Sessions |
| 176 | `GET` | `/api/user-sessions/today` | `get_today_session` | User Sessions |
| 177 | `POST` | `/api/user-sessions/log-auth` | `log_auth_event` | User Sessions |
| 178 | `GET` | `/api/forecasting/monthly` | `get_monthly_forecast` | Forecasting |
| 179 | `GET` | `/api/forecasting/district` | `get_district_forecast` | Forecasting |
| 180 | `GET` | `/api/forecasting/village` | `get_village_forecast` | Forecasting |
| 181 | `PUT` | `/api/chat/messages/{message_id}` | `edit_message` | Team Chat |
| 182 | `DELETE` | `/api/chat/messages/{message_id}` | `delete_message` | Team Chat |
| 183 | `GET` | `/api/chat/messages/search` | `search_messages` | Team Chat |
| 184 | `POST` | `/api/leads/intake` | `intake_lead` | CRM Leads |
| 185 | `POST` | `/api/leads/intake/rfq` | `intake_rfq` | CRM Leads |
| 186 | `GET` | `/api/leads/` | `get_all_leads` | CRM Leads |
| 187 | `GET` | `/api/leads/stats/pipeline` | `get_pipeline_stats` | CRM Leads |
| 188 | `GET` | `/api/leads/my` | `get_my_leads` | CRM Leads |
| 189 | `GET` | `/api/leads/sources` | `get_lead_sources` | CRM Leads |
| 190 | `POST` | `/api/leads/sources` | `save_lead_source` | CRM Leads |
| 191 | `DELETE` | `/api/leads/sources/{source_id}` | `delete_lead_source` | CRM Leads |
| 192 | `GET` | `/api/leads/{lead_id}/activities` | `get_lead_activities` | CRM Leads |
| 193 | `GET` | `/api/leads/{lead_id}` | `get_lead` | CRM Leads |
| 194 | `GET` | `/api/leads/{lead_id}/detail` | `get_lead_detail_owner` | CRM Leads |
| 195 | `POST` | `/api/leads/{lead_id}/assign` | `assign_lead` | CRM Leads |
| 196 | `POST` | `/api/leads/{lead_id}/comment` | `manager_comment` | CRM Leads |
| 197 | `DELETE` | `/api/leads/{lead_id}` | `delete_lead` | CRM Leads |
| 198 | `PATCH` | `/api/leads/{lead_id}` | `update_lead` | CRM Leads |
| 199 | `POST` | `/api/leads/{lead_id}/activities` | `log_activity` | CRM Leads |
| 200 | `POST` | `/api/leads/{lead_id}/close` | `close_lead` | CRM Leads |
| 201 | `GET` | `/api/leads/owners/list` | `get_lead_owners` | CRM Leads |
| 202 | `GET` | `/api/leads/{lead_id}/quotation` | `get_quotation` | CRM Leads |
| 203 | `GET` | `/api/leads/{lead_id}/quotations/history` | `get_quotation_history` | CRM Leads |
| 204 | `PUT` | `/api/leads/{lead_id}/quotation` | `upsert_quotation` | CRM Leads |
| 205 | `POST` | `/api/leads/{lead_id}/quotation/commit` | `commit_quotation` | CRM Leads |
| 206 | `POST` | `/api/leads/{lead_id}/quotation/attachment` | `upload_quotation_attachment` | CRM Leads |
| 207 | `DELETE` | `/api/leads/{lead_id}/quotation/attachment` | `delete_quotation_attachment` | CRM Leads |
| 208 | `GET` | `/api/leads/{lead_id}/quotation/html` | `get_quotation_html` | CRM Leads |
| 209 | `GET` | `/api/attendance/duty-sheet-status` | `get_duty_sheet_status` | Attendance |
| 210 | `GET` | `/api/attendance/telecallers` | `get_all_telecallers` | Attendance |
| 211 | `POST` | `/api/attendance/submit-duty-sheet` | `submit_duty_sheet` | Attendance |
| 212 | `GET` | `/api/attendance/status` | `get_attendance_status` | Attendance |
| 213 | `POST` | `/api/attendance/mark` | `mark_attendance` | Attendance |
| 214 | `GET` | `/api/reviews/` | `get_all_reviews` | Core |
| 215 | `DELETE` | `/api/reviews/{review_id}` | `delete_review` | Core |
| 216 | `POST` | `/api/telecaller-orders/` | `create_telecaller_order` | Telecaller Orders |
| 217 | `GET` | `/api/telecaller-orders/` | `get_telecaller_orders` | Telecaller Orders |
| 218 | `POST` | `/api/telecaller-orders/{order_id}/telecaller-confirm` | `telecaller_confirm_order` | Telecaller Orders |
| 219 | `GET` | `/api/telecaller-orders/pending` | `get_pending_telecaller_orders` | Telecaller Orders |
| 220 | `POST` | `/api/telecaller-orders/bulk-mark-approved` | `bulk_mark_approved` | Telecaller Orders |
| 221 | `POST` | `/api/telecaller-orders/{order_id}/approve` | `approve_telecaller_order` | Telecaller Orders |
| 222 | `POST` | `/api/telecaller-orders/{order_id}/reject` | `reject_telecaller_order` | Telecaller Orders |
| 223 | `GET` | `/api/telecaller-orders/my-confirmation-calls` | `get_my_confirmation_calls` | Telecaller Orders |
| 224 | `GET` | `/api/telecaller-orders/export-merged-excel/{sale_id}` | `export_merged_excel` | Telecaller Orders |
| 225 | `GET` | `/api/telecaller-orders/export-confirmations-excel` | `export_confirmations_excel` | Telecaller Orders |
| 226 | `POST` | `/api/telecaller-orders/export-selected` | `export_selected_orders` | Telecaller Orders |
| 227 | `GET` | `/api/telecaller-orders/{order_id}` | `get_telecaller_order` | Telecaller Orders |
| 228 | `POST` | `/api/call-logger/transcribe-chunk` | `transcribe_chunk` | Voice & Call Logger |
| 229 | `POST` | `/api/call-logger/analyze` | `analyze_transcript` | Voice & Call Logger |
| 230 | `GET` | `/api/recruitment/categories` | `get_recruitment_categories` | HR Recruitment |
| 231 | `GET` | `/api/recruitment/leads/check-duplicate` | `check_duplicate_candidate` | HR Recruitment |
| 232 | `GET` | `/api/recruitment/leads/follow-ups` | `get_recruitment_follow_ups` | HR Recruitment |
| 233 | `GET` | `/api/recruitment/leads` | `get_recruitment_leads` | HR Recruitment |
| 234 | `GET` | `/api/recruitment/leads/{lead_id}` | `get_recruitment_lead` | HR Recruitment |
| 235 | `GET` | `/api/recruitment/leads/{lead_id}/activities` | `get_candidate_activities` | HR Recruitment |
| 236 | `POST` | `/api/recruitment/leads/{lead_id}/activities` | `record_candidate_activity` | HR Recruitment |
| 237 | `POST` | `/api/recruitment/leads/{lead_id}/status` | `change_candidate_status` | HR Recruitment |
| 238 | `POST` | `/api/recruitment/leads` | `create_recruitment_lead` | HR Recruitment |
| 239 | `PATCH` | `/api/recruitment/leads/{lead_id}` | `update_recruitment_lead` | HR Recruitment |
| 240 | `GET` | `/api/tally/ping` | `ping_backend` | Tally ERP |
| 241 | `GET` | `/api/tally/audit` | `audit_vouchers` | Tally ERP |
| 242 | `POST` | `/api/tally/ingest` | `ingest_vouchers` | Tally ERP |
| 243 | `POST` | `/api/tally/reconcile/cleanup` | `reconcile_cleanup` | Tally ERP |
| 244 | `GET` | `/api/tally/vouchers` | `list_vouchers` | Tally ERP |
| 245 | `GET` | `/api/tally/stats` | `get_stats` | Tally ERP |
| 246 | `GET` | `/api/tally/filter-options` | `get_filter_options` | Tally ERP |

---

## 7. Operational Troubleshooting & Best Practices
- **Phone Validation:** All mobile numbers must be exactly 10 digits. The backend automatically strips `+91`, leading `0`, and spaces/hyphens.
- **Customer Code Uniqueness:** Customer codes (Sabhasad codes) must be unique. The backend returns HTTP 409 if a duplicate code is supplied, preventing data corruption.
- **In-Memory Cache Invalidation:** When altering role permissions in `/role-management`, the backend automatically calls `clear_user_permission_cache()`, forcing immediate permission refresh across all active users.
- **Voice Dictation Hotkey:** Field and telecalling staff can press `Alt+V` on any input field in the browser to instantly toggle speech-to-text dictation.

**End of Documentation.**