-- ===================================
-- Import History / Audit Trail Table
-- ===================================
CREATE TABLE IF NOT EXISTS import_history (
    import_id BIGSERIAL PRIMARY KEY,
    import_batch_id TEXT NOT NULL,
    module_name TEXT NOT NULL,
    file_name TEXT,
    imported_by_email TEXT,
    imported_by_role TEXT,
    total_records INTEGER DEFAULT 0,
    imported_records INTEGER DEFAULT 0,
    duplicate_records INTEGER DEFAULT 0,
    conflict_records INTEGER DEFAULT 0,
    invalid_records INTEGER DEFAULT 0,
    import_status TEXT DEFAULT 'SUCCESS',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_import_history_batch ON import_history(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_import_history_created ON import_history(created_at DESC);
