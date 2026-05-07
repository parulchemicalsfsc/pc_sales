-- ============================================================
-- PERMANENT FIX: Atomic FSC Invoice Number Generation
-- Run each STEP separately in Supabase SQL Editor.
-- If a step errors, paste the error here so we can fix it.
-- ============================================================


-- ══════════════════════════════════════════════════
-- STEP 1 — Fiscal year helper function
-- Run this first. Expected result: "CREATE FUNCTION"
-- ══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_fiscal_year_suffix()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_month integer;
    v_year  integer;
BEGIN
    v_month := EXTRACT(MONTH FROM NOW() AT TIME ZONE 'Asia/Kolkata');
    v_year  := EXTRACT(YEAR  FROM NOW() AT TIME ZONE 'Asia/Kolkata');

    IF v_month >= 4 THEN
        RETURN lpad((v_year % 100)::text,       2, '0') || '-'
            || lpad(((v_year + 1) % 100)::text, 2, '0');
    ELSE
        RETURN lpad(((v_year - 1) % 100)::text, 2, '0') || '-'
            || lpad((v_year % 100)::text,        2, '0');
    END IF;
END;
$$;


-- ══════════════════════════════════════════════════
-- STEP 2 — Quick test: should return e.g. "26-27"
-- ══════════════════════════════════════════════════
SELECT get_fiscal_year_suffix();


-- ══════════════════════════════════════════════════
-- STEP 3 — Invoice number generator function
-- Expected result: "CREATE FUNCTION"
-- ══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION generate_fsc_invoice_no()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_fy_suffix text;
    v_next_num  integer;
BEGIN
    v_fy_suffix := get_fiscal_year_suffix();

    -- Advisory lock: serialises concurrent inserts so numbers never clash
    PERFORM pg_advisory_xact_lock(hashtext('fsc_invoice_no_lock'));

    SELECT COALESCE(
        MAX(
            CAST(
                substr(invoice_no, 4, strpos(invoice_no, '/') - 4)
                AS integer
            )
        ),
        0
    ) + 1
    INTO v_next_num
    FROM sales
    WHERE invoice_no LIKE 'FSC%/' || v_fy_suffix;

    RETURN 'FSC' || lpad(v_next_num::text, 4, '0') || '/' || v_fy_suffix;
END;
$$;


-- ══════════════════════════════════════════════════
-- STEP 4 — Quick test: should return next FSC number
-- e.g. "FSC0017/26-27" if FSC0016 is the current max
-- ══════════════════════════════════════════════════
SELECT generate_fsc_invoice_no();


-- ══════════════════════════════════════════════════
-- STEP 5 — Trigger function
-- Expected result: "CREATE FUNCTION"
-- ══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION trg_set_invoice_no()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.invoice_no IS NULL OR TRIM(NEW.invoice_no) = '' THEN
        NEW.invoice_no := generate_fsc_invoice_no();
    END IF;
    RETURN NEW;
END;
$$;


-- ══════════════════════════════════════════════════
-- STEP 6 — Attach trigger to the sales table
-- Expected result: "CREATE TRIGGER"
-- ══════════════════════════════════════════════════
DROP TRIGGER IF EXISTS set_invoice_no_before_insert ON sales;

CREATE TRIGGER set_invoice_no_before_insert
    BEFORE INSERT ON sales
    FOR EACH ROW
    EXECUTE FUNCTION trg_set_invoice_no();


-- ══════════════════════════════════════════════════
-- STEP 7 — Final verification
-- "set_invoice_no_before_insert" MUST appear in results.
-- If it is missing, one of the earlier steps failed.
-- ══════════════════════════════════════════════════
SELECT tgname, tgenabled
FROM   pg_trigger
WHERE  tgrelid = 'sales'::regclass;
