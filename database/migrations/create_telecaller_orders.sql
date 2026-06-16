-- ============================================================
-- Telecaller Orders Table
-- Pending orders submitted by telecallers, awaiting sales manager approval.
-- Run this in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS telecaller_orders (
    order_id SERIAL PRIMARY KEY,
    telecaller_email TEXT NOT NULL,
    customer_type TEXT NOT NULL DEFAULT 'mantri',
    customer_id INTEGER,
    customer_name TEXT NOT NULL,
    customer_mobile TEXT,
    customer_village TEXT,
    products_json JSONB NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT,
    sale_id INTEGER,
    approved_by TEXT,
    rejected_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup of pending orders
CREATE INDEX IF NOT EXISTS idx_telecaller_orders_status ON telecaller_orders(status);
CREATE INDEX IF NOT EXISTS idx_telecaller_orders_date ON telecaller_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telecaller_orders_telecaller ON telecaller_orders(telecaller_email);

-- Enable RLS
ALTER TABLE telecaller_orders ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (backend uses service_role key)
CREATE POLICY "Service role full access" ON telecaller_orders
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Authenticated users can read
CREATE POLICY "Authenticated read access" ON telecaller_orders
    FOR SELECT
    USING (true);
