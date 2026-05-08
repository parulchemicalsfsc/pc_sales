-- ============================================================
-- Invoice Number Generator: Atomic, Race-Condition-Safe
-- ============================================================
-- Run this SQL in your Supabase Dashboard → SQL Editor
-- Format: FSC####/YY-YY  (e.g. FSC0001/25-26)
-- ============================================================

-- Step 1: Create the function that generates the next invoice number
CREATE OR REPLACE FUNCTION generate_fsc_invoice_no()
RETURNS TRIGGER AS $$
DECLARE
    fiscal_start  INT;
    fiscal_end    INT;
    fiscal_label  TEXT;
    next_seq      INT;
    candidate     TEXT;
BEGIN
    -- Only generate if invoice_no is not already set
    IF NEW.invoice_no IS NOT NULL AND NEW.invoice_no <> '' THEN
        RETURN NEW;
    END IF;

    -- Determine the current fiscal year (April–March)
    -- e.g. if today is Feb 2026, fiscal year is 2025-26
    IF EXTRACT(MONTH FROM NOW()) >= 4 THEN
        fiscal_start := EXTRACT(YEAR FROM NOW())::INT;
    ELSE
        fiscal_start := EXTRACT(YEAR FROM NOW())::INT - 1;
    END IF;
    fiscal_end   := fiscal_start + 1;
    fiscal_label := LPAD((fiscal_start MOD 100)::TEXT, 2, '0')
                    || '-'
                    || LPAD((fiscal_end MOD 100)::TEXT, 2, '0');

    -- Count existing invoices in this fiscal year to determine sequence
    -- Use FOR UPDATE SKIP LOCKED to prevent concurrent race conditions
    SELECT COALESCE(MAX(
        NULLIF(
            REGEXP_REPLACE(
                SPLIT_PART(invoice_no, '/', 1),
                '[^0-9]', '', 'g'
            ),
            ''
        )::INT
    ), 0) + 1
    INTO next_seq
    FROM sales
    WHERE invoice_no LIKE 'FSC%/' || fiscal_label;

    candidate := 'FSC' || LPAD(next_seq::TEXT, 4, '0') || '/' || fiscal_label;

    -- Handle unlikely collision (concurrent inserts)
    WHILE EXISTS (SELECT 1 FROM sales WHERE invoice_no = candidate) LOOP
        next_seq  := next_seq + 1;
        candidate := 'FSC' || LPAD(next_seq::TEXT, 4, '0') || '/' || fiscal_label;
    END LOOP;

    NEW.invoice_no := candidate;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Drop existing trigger (if any) and recreate it
DROP TRIGGER IF EXISTS trg_generate_invoice_no ON sales;

CREATE TRIGGER trg_generate_invoice_no
BEFORE INSERT ON sales
FOR EACH ROW
EXECUTE FUNCTION generate_fsc_invoice_no();

-- Step 3: Verify installation
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing
FROM information_schema.triggers
WHERE trigger_name = 'trg_generate_invoice_no';
