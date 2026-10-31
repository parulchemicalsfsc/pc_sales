-- =============================================================================
-- Migration: Create Recruitment Module Tables, Sequence, Hardened RLS & RBAC
-- File: database/migrations/create_recruitment_tables.sql
-- Module: Recruitment Management (Phase 2B Revised)
-- Target: Supabase PostgreSQL (Postgres 14+)
-- =============================================================================
--
-- DESCRIPTION:
-- Creates the core relational tables, sequences, and access policies for the
-- new, isolated Recruitment Module:
--   1. public.recruitment_lead_code_seq - Atomic sequence for unique lead_code (REC-0001)
--   2. public.recruitment_categories    - Master job/department categories (unseeded)
--   3. public.recruitment_leads         - Candidate profiles, questionnaire JSONB, resume URL
--   4. public.recruitment_activities    - Append-only audit trail and interaction history
--
-- RESUME STORAGE DECISION:
-- Each candidate has exactly one resume link stored in recruitment_leads.resume_url.
-- The user uploads the resume to Google Drive with 'Anyone with the link' viewer access
-- and pastes the URL. No BYTEA, no Supabase Storage buckets, no separate attachments table.
--
-- AUTHORIZATION & RBAC INTEGRATION:
--   - Initial release is strictly Admin-only.
--   - Registers 'view_recruitment' and 'manage_recruitment' in public.permissions.
--   - Grants both permissions to the existing 'admin' role in public.role_permissions
--     and synchronizes public.roles.permission_keys.
--   - The existing 'hr_&_administration' role (role_id 15) is completely untouched.
--   - No commercial Sales tables or existing CRM permissions are modified.
--
-- ROW LEVEL SECURITY:
--   - RLS is enabled on all recruitment tables.
--   - Full read/write access is granted exclusively to service_role (used by FastAPI backend).
--   - Direct client access via anon or general authenticated tokens is denied (returns 0 rows).
--
-- TRANSACTION SAFETY:
-- Wrapped in a transaction block. If any step fails, the entire migration rolls back.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Candidate Lead Code Sequence
-- -----------------------------------------------------------------------------
-- Provides atomic, concurrency-safe candidate codes (REC-0001, REC-0002, ...)
-- eliminating race conditions during simultaneous manual creations or bulk imports.
CREATE SEQUENCE IF NOT EXISTS public.recruitment_lead_code_seq
    INCREMENT BY 1
    START WITH 1
    MINVALUE 1
    NO MAXVALUE
    CACHE 1;

COMMENT ON SEQUENCE public.recruitment_lead_code_seq IS 'Atomic sequence for generating unique candidate lead_code values (REC-XXXX)';

-- -----------------------------------------------------------------------------
-- 2. Recruitment Categories Table
-- -----------------------------------------------------------------------------
-- Stores job departments/categories (e.g. Sales Executive, Telecaller, Field Officer).
-- Left unseeded per confirmed instructions so Admin can create approved categories via UI.
CREATE TABLE IF NOT EXISTS public.recruitment_categories (
    category_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.recruitment_categories IS 'Master categories for recruitment positions; unseeded, managed via Admin UI';

-- -----------------------------------------------------------------------------
-- 3. Recruitment Leads (Candidates) Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recruitment_leads (
    lead_id SERIAL PRIMARY KEY,
    lead_code TEXT UNIQUE NOT NULL,                     -- Auto-populated by trigger if omitted (REC-0001)
    candidate_name TEXT NOT NULL,
    email TEXT,
    phone TEXT NOT NULL,
    alternate_phone TEXT,
    city TEXT,
    state TEXT NOT NULL DEFAULT 'Gujarat',
    category_id INTEGER REFERENCES public.recruitment_categories(category_id) ON DELETE SET NULL,
    category_name TEXT NOT NULL,                        -- Denormalized snapshot preserved even if category is deleted
    source TEXT NOT NULL DEFAULT 'Manual',              -- 'Manual', 'Excel Import', 'Referral', 'LinkedIn', 'Walk-in', 'Portal'
    current_company TEXT,
    current_designation TEXT,
    total_experience_years NUMERIC(4, 1) NOT NULL DEFAULT 0.0
        CHECK (total_experience_years >= 0),
    highest_qualification TEXT,
    current_ctc NUMERIC(12, 2)
        CHECK (current_ctc IS NULL OR current_ctc >= 0),
    expected_ctc NUMERIC(12, 2)
        CHECK (expected_ctc IS NULL OR expected_ctc >= 0),
    notice_period_days INTEGER
        CHECK (notice_period_days IS NULL OR notice_period_days >= 0),
    key_skills TEXT,
    resume_url TEXT                                     -- Google Drive Viewer link
        CHECK (resume_url IS NULL OR resume_url ~* '^https?://'),
    questionnaire_responses JSONB NOT NULL DEFAULT '{}'::jsonb, -- Structured screening questions, ratings & notes
    status TEXT NOT NULL DEFAULT 'Lead Generated'
        CHECK (status IN ('Lead Generated', 'Shortlisted', 'Profile on Hold', 'Rejected')),
    status_notes TEXT,
    follow_up_date DATE,                                -- Optional reminder date for next interview / call
    assigned_to TEXT,                                   -- Stores app_users.email (nullable)
    created_by TEXT NOT NULL,                           -- Stores app_users.email of creator
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,         -- Soft archival flag to preserve talent pool records
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.recruitment_leads IS 'Candidate recruitment records, screening questionnaire responses, and Google Drive resume link';
COMMENT ON COLUMN public.recruitment_leads.lead_code IS 'Human-readable unique candidate identifier (e.g. REC-0001)';
COMMENT ON COLUMN public.recruitment_leads.resume_url IS 'Public Viewer Google Drive URL; validated for HTTP/HTTPS format';
COMMENT ON COLUMN public.recruitment_leads.questionnaire_responses IS 'Flexible JSONB object holding category-specific screening Q&A and evaluator notes';
COMMENT ON COLUMN public.recruitment_leads.category_name IS 'Denormalized category name at creation; retains historical value if category is deleted';

-- Trigger: Automatically assign lead_code from sequence if not supplied
CREATE OR REPLACE FUNCTION public.set_recruitment_lead_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lead_code IS NULL OR TRIM(NEW.lead_code) = '' THEN
        NEW.lead_code := 'REC-' || LPAD(nextval('public.recruitment_lead_code_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_recruitment_lead_code ON public.recruitment_leads;
CREATE TRIGGER trg_set_recruitment_lead_code
BEFORE INSERT ON public.recruitment_leads
FOR EACH ROW
EXECUTE FUNCTION public.set_recruitment_lead_code();

-- -----------------------------------------------------------------------------
-- 4. Recruitment Activities Table (Audit History & Follow-ups)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recruitment_activities (
    activity_id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES public.recruitment_leads(lead_id) ON DELETE RESTRICT,
    activity_type TEXT NOT NULL,                        -- 'Status Change', 'Call', 'Interview', 'Note', 'Resume Updated', 'Follow-up Scheduled'
    old_status TEXT,
    new_status TEXT,
    summary TEXT NOT NULL,
    details TEXT,
    outcome TEXT,
    next_action TEXT,
    follow_up_date DATE,
    logged_by TEXT NOT NULL,                            -- Stores app_users.email of the author
    is_auto BOOLEAN NOT NULL DEFAULT FALSE,
    logged_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.recruitment_activities IS 'Append-only chronological audit log of candidate status changes, interviews, calls, and follow-ups';

-- Trigger: Enforce append-only integrity (prevent updates and deletions to historical activity rows)
CREATE OR REPLACE FUNCTION public.prevent_recruitment_activity_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'recruitment_activities records are append-only audit entries and cannot be modified.';
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'recruitment_activities records are append-only audit entries and cannot be deleted. Soft archival on recruitment_leads (is_archived = TRUE) must be used instead.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_recruitment_activity_update ON public.recruitment_activities;
DROP TRIGGER IF EXISTS trg_prevent_recruitment_activity_mutation ON public.recruitment_activities;
CREATE TRIGGER trg_prevent_recruitment_activity_mutation
BEFORE UPDATE OR DELETE ON public.recruitment_activities
FOR EACH ROW
EXECUTE FUNCTION public.prevent_recruitment_activity_mutation();

-- -----------------------------------------------------------------------------
-- 5. Performance, Duplicate Search & JSON Indexes
-- -----------------------------------------------------------------------------
-- Duplicate candidate detection (used during manual intake and Excel import)
CREATE INDEX IF NOT EXISTS idx_rec_leads_phone ON public.recruitment_leads(phone);
CREATE INDEX IF NOT EXISTS idx_rec_leads_email ON public.recruitment_leads(email) WHERE email IS NOT NULL;

-- Pipeline filtering and workspace queries
CREATE INDEX IF NOT EXISTS idx_rec_leads_status ON public.recruitment_leads(status);
CREATE INDEX IF NOT EXISTS idx_rec_leads_category ON public.recruitment_leads(category_id);
CREATE INDEX IF NOT EXISTS idx_rec_leads_created_at ON public.recruitment_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_leads_follow_up ON public.recruitment_leads(follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rec_leads_archived ON public.recruitment_leads(is_archived);

-- GIN index for JSONB questionnaire querying (e.g. searching screening fields)
CREATE INDEX IF NOT EXISTS idx_rec_leads_questionnaire ON public.recruitment_leads USING GIN (questionnaire_responses);

-- Activity timeline lookups
CREATE INDEX IF NOT EXISTS idx_rec_activities_lead ON public.recruitment_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_rec_activities_logged_at ON public.recruitment_activities(logged_at DESC);

-- -----------------------------------------------------------------------------
-- 6. Row Level Security (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.recruitment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_activities ENABLE ROW LEVEL SECURITY;

-- Clean existing policies for safe re-run
DROP POLICY IF EXISTS "Service role full access recruitment_categories" ON public.recruitment_categories;
DROP POLICY IF EXISTS "Service role full access recruitment_leads" ON public.recruitment_leads;
DROP POLICY IF EXISTS "Service role full access recruitment_activities" ON public.recruitment_activities;

DROP POLICY IF EXISTS "Deny direct anon access recruitment_categories" ON public.recruitment_categories;
DROP POLICY IF EXISTS "Deny direct anon access recruitment_leads" ON public.recruitment_leads;
DROP POLICY IF EXISTS "Deny direct anon access recruitment_activities" ON public.recruitment_activities;

-- 6.1 Backend FastAPI Service Role Access
-- The FastAPI backend uses SUPABASE_SERVICE_ROLE_KEY and performs RBAC verification.
CREATE POLICY "Service role full access recruitment_categories" ON public.recruitment_categories
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access recruitment_leads" ON public.recruitment_leads
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access recruitment_activities" ON public.recruitment_activities
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Note on direct client access (anon and authenticated):
-- In Supabase, enabling RLS without granting policies to 'anon' or 'authenticated' roles
-- ensures that any direct Supabase REST API requests from client tokens receive 0 rows / 401/403.
-- All legitimate recruitment requests MUST pass through the FastAPI backend API endpoints.

-- -----------------------------------------------------------------------------
-- 7. Register Recruitment Permissions in System Registry
-- -----------------------------------------------------------------------------
INSERT INTO public.permissions (permission_key, display_name, description, module) VALUES
    ('view_recruitment', 'View Recruitment', 'View recruitment leads, candidate profiles, and reports', 'recruitment'),
    ('manage_recruitment', 'Manage Recruitment', 'Create, edit, import, and change recruitment lead statuses', 'recruitment')
ON CONFLICT (permission_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    module = EXCLUDED.module;

-- -----------------------------------------------------------------------------
-- 8. Grant Permissions to Existing 'admin' Role Only
-- -----------------------------------------------------------------------------
-- 8.1 Insert into role_permissions junction table for 'admin' role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_key = 'admin'
  AND p.permission_key IN ('view_recruitment', 'manage_recruitment')
  AND NOT EXISTS (
      SELECT 1 FROM public.role_permissions rp
      WHERE rp.role_id = r.role_id AND rp.permission_id = p.permission_id
  );

-- 8.2 Synchronize the fast-path permission_keys array on roles table for 'admin' role
-- Using array_agg(DISTINCT perm) guarantees safe idempotency and prevents duplicates
UPDATE public.roles
SET permission_keys = (
    SELECT array_agg(DISTINCT perm)
    FROM unnest(
        array_cat(
            COALESCE(permission_keys, ARRAY[]::TEXT[]),
            ARRAY['view_recruitment', 'manage_recruitment']::TEXT[]
        )
    ) AS perm
)
WHERE role_key = 'admin';

COMMIT;

-- =============================================================================
-- End of Migration Script
-- =============================================================================

/*
-- =============================================================================
-- ACCOMPANYING ROLLBACK INSTRUCTIONS & RECOVERY SCRIPT
-- =============================================================================
-- WARNING: Executing this rollback is DESTRUCTIVE. It permanently drops all 3
-- recruitment tables and their data.
--
-- PERMISSION ROLLBACK SAFETY RULES:
-- 1. Step 0 (Pre-Rollback Verification) MUST be run first to inspect whether
--    'view_recruitment' or 'manage_recruitment' were assigned to any other roles,
--    or whether they existed prior to this migration.
-- 2. If 'view_recruitment' or 'manage_recruitment' existed BEFORE this migration,
--    DO NOT run Step 3 (DELETE FROM public.permissions).
-- 3. All unrelated Admin permission keys and other roles ('hr_&_administration', etc.)
--    are strictly preserved.
--
-- STEP 0: PRE-ROLLBACK AUDIT QUERY (Run this first in Supabase SQL editor)
SELECT 
    p.permission_key,
    p.permission_id,
    p.module,
    COALESCE(string_agg(r.role_key, ', '), 'NONE') AS assigned_roles,
    COUNT(rp.role_id) AS assignment_count
FROM public.permissions p
LEFT JOIN public.role_permissions rp ON p.permission_id = rp.permission_id
LEFT JOIN public.roles r ON rp.role_id = r.role_id
WHERE p.permission_key IN ('view_recruitment', 'manage_recruitment')
GROUP BY p.permission_key, p.permission_id, p.module;

-- STEP 1-7: ROLLBACK EXECUTION BLOCK
BEGIN;

-- 1. Revoke ONLY the two exact permissions from the 'admin' role in the junction table
DELETE FROM public.role_permissions
WHERE role_id = (SELECT role_id FROM public.roles WHERE role_key = 'admin')
  AND permission_id IN (
      SELECT permission_id FROM public.permissions 
      WHERE permission_key IN ('view_recruitment', 'manage_recruitment')
  );

-- 2. Surgically strip ONLY 'view_recruitment' and 'manage_recruitment' from admin permission_keys array
-- (Preserves ALL unrelated Admin permissions)
UPDATE public.roles
SET permission_keys = (
    SELECT COALESCE(array_agg(perm), ARRAY[]::TEXT[])
    FROM unnest(permission_keys) AS perm
    WHERE perm NOT IN ('view_recruitment', 'manage_recruitment')
)
WHERE role_key = 'admin';

-- 3. Conditionally delete permissions from registry ONLY IF:
--    a) No remaining role in public.role_permissions references them
--    b) And they were strictly created by this migration (verified via Step 0)
DELETE FROM public.permissions p
WHERE p.permission_key IN ('view_recruitment', 'manage_recruitment')
  AND NOT EXISTS (
      SELECT 1 FROM public.role_permissions rp
      WHERE rp.permission_id = p.permission_id
  );

-- 4. Drop RLS Policies
DROP POLICY IF EXISTS "Service role full access recruitment_activities" ON public.recruitment_activities;
DROP POLICY IF EXISTS "Service role full access recruitment_leads" ON public.recruitment_leads;
DROP POLICY IF EXISTS "Service role full access recruitment_categories" ON public.recruitment_categories;

-- 5. Drop Triggers and Functions
DROP TRIGGER IF EXISTS trg_prevent_recruitment_activity_mutation ON public.recruitment_activities;
DROP TRIGGER IF EXISTS trg_prevent_recruitment_activity_update ON public.recruitment_activities;
DROP FUNCTION IF EXISTS public.prevent_recruitment_activity_mutation();

DROP TRIGGER IF EXISTS trg_set_recruitment_lead_code ON public.recruitment_leads;
DROP FUNCTION IF EXISTS public.set_recruitment_lead_code();

-- 6. Drop Tables in Foreign Key Dependency Order (Permanent Data Loss)
DROP TABLE IF EXISTS public.recruitment_activities CASCADE;
DROP TABLE IF EXISTS public.recruitment_leads CASCADE;
DROP TABLE IF EXISTS public.recruitment_categories CASCADE;

-- 7. Drop Candidate Lead Code Sequence
DROP SEQUENCE IF EXISTS public.recruitment_lead_code_seq;

COMMIT;
-- =============================================================================
*/
