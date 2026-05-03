-- ============================================================
-- Migration: Telecaller Duty Sheet
-- Description: Adds submitted_by/submitted_at columns to
--              telecaller_attendance and creates duty_sheet_log
--              table for enforcing once-per-day submission.
-- Run against: Supabase SQL Editor
-- ============================================================

-- 1. Extend telecaller_attendance with submission metadata
ALTER TABLE telecaller_attendance
  ADD COLUMN IF NOT EXISTS submitted_by   TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at   TIMESTAMPTZ;

-- 2. Create duty_sheet_log — one row per calendar day (UNIQUE enforced)
CREATE TABLE IF NOT EXISTS duty_sheet_log (
  id              SERIAL PRIMARY KEY,
  duty_date       DATE           NOT NULL UNIQUE,   -- enforces once-per-day at DB level
  submitted_by    TEXT           NOT NULL,          -- email of admin/SM who submitted
  submitted_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  on_duty_count   INT            DEFAULT 0          -- how many telecallers were ON duty
);

-- 3. Enable Row Level Security (match existing table pattern)
ALTER TABLE duty_sheet_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read (so frontend can query status)
CREATE POLICY "Authenticated users can read duty_sheet_log"
  ON duty_sheet_log
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only service role (backend) can write
CREATE POLICY "Service role can manage duty_sheet_log"
  ON duty_sheet_log
  FOR ALL
  USING (auth.role() = 'service_role');

-- 4. Index for fast date lookups
CREATE INDEX IF NOT EXISTS idx_duty_sheet_log_duty_date
  ON duty_sheet_log (duty_date DESC);

-- ============================================================
-- Verification queries (run these to confirm migration worked)
-- ============================================================
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'telecaller_attendance'
--   AND column_name IN ('submitted_by', 'submitted_at');
--
-- SELECT * FROM duty_sheet_log LIMIT 5;
