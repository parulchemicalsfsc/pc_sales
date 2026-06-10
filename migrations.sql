-- 1. Add entity_type to calling_assignments for Sabhsad distribution
ALTER TABLE calling_assignments 
ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'distributor';

-- 2. Create telecaller_attendance table if it doesn't exist
CREATE TABLE IF NOT EXISTS telecaller_attendance (
    id SERIAL PRIMARY KEY,
    user_email TEXT NOT NULL,
    attendance_date DATE NOT NULL,
    is_present BOOLEAN DEFAULT true,
    submitted_by TEXT,
    submitted_at TIMESTAMPTZ,
    UNIQUE (user_email, attendance_date)
);

-- 3. Create duty_sheet_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS duty_sheet_log (
    id SERIAL PRIMARY KEY,
    duty_date DATE NOT NULL UNIQUE,
    submitted_by TEXT NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL,
    on_duty_count INTEGER NOT NULL DEFAULT 0
);
