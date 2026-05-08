-- ============================================================
-- Invoice Number Generator: Supabase-Compatible RPC Approach
-- ============================================================
-- IMPORTANT: Run ALL of this in Supabase Dashboard → SQL Editor
--
-- This REPLACES the old trigger-based approach.
-- The trigger approach caused error 0A000 because Supabase's
-- PostgREST layer cannot handle RETURNS TRIGGER functions.
--
-- This creates a plain RETURNS TEXT function callable via RPC.
-- Format: FSC####/YY-YY  (e.g. FSC0001/25-26)
-- ============================================================

-- Step 1: Remove any broken trigger/function from the old approach
DROP TRIGGER IF EXISTS trg_generate_invoice_no ON sales;
DROP FUNCTION IF EXISTS generate_fsc_invoice_no();

-- Step 2: Create a normal RPC-callable function (RETURNS TEXT, not RETURNS TRIGGER)
--         Uses an advisory lock to be race-condition safe under concurrent inserts.
CREATE OR REPLACE FUNCTION get_next_invoice_no()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    fiscal_start  INT;
    fiscal_end    INT;
    fiscal_label  TEXT;
    next_seq      INT;
    candidate     TEXT;
BEGIN
    -- Acquire a session-level advisory lock so concurrent calls wait their turn
    -- Lock ID 12345678 is arbitrary — just needs to be consistent across all callers
    PERFORM pg_advisory_xact_lock(12345678);

    -- Determine fiscal year (April–March)
    -- e.g. Feb 2026 → fiscal 2025-26
    IF EXTRACT(MONTH FROM NOW()) >= 4 THEN
        fiscal_start := EXTRACT(YEAR FROM NOW())::INT;
    ELSE
        fiscal_start := EXTRACT(YEAR FROM NOW())::INT - 1;
    END IF;
    fiscal_end   := fiscal_start + 1;
    fiscal_label := LPAD((fiscal_start MOD 100)::TEXT, 2, '0')
                    || '-'
                    || LPAD((fiscal_end  MOD 100)::TEXT, 2, '0');

    -- Find the next sequence number for this fiscal year
    SELECT COALESCE(
        MAX(
            NULLIF(
                REGEXP_REPLACE(SPLIT_PART(invoice_no, '/', 1), '[^0-9]', '', 'g'),
                ''
            )::INT
        ), 0
    ) + 1
    INTO next_seq
    FROM sales
    WHERE invoice_no LIKE 'FSC%/' || fiscal_label;

    candidate := 'FSC' || LPAD(next_seq::TEXT, 4, '0') || '/' || fiscal_label;

    -- Increment until we find a truly unused number (handles any gaps)
    WHILE EXISTS (SELECT 1 FROM sales WHERE invoice_no = candidate) LOOP
        next_seq  := next_seq + 1;
        candidate := 'FSC' || LPAD(next_seq::TEXT, 4, '0') || '/' || fiscal_label;
    END LOOP;

    RETURN candidate;
END;
$$;

-- Step 3: Verify the function was created successfully
SELECT
    routine_name,
    routine_type,
    data_type AS return_type
FROM information_schema.routines
WHERE routine_name = 'get_next_invoice_no'
  AND routine_schema = 'public';
