CREATE TABLE IF NOT EXISTS distributor_redemo_history (
    history_id SERIAL PRIMARY KEY,
    distributor_id INTEGER NULL,
    original_village TEXT,
    clean_village TEXT,
    mantri_name TEXT,
    mantri_mobile TEXT,
    redemo_detected BOOLEAN DEFAULT false,
    redemo_pattern TEXT,
    import_batch_id TEXT,
    redemo_date DATE,
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_row JSONB
);
