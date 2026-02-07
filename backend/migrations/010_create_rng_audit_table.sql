-- Migration: 010_create_rng_audit_table
-- Created at: 2026-01-25

CREATE TABLE IF NOT EXISTS rng_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id),
  seed_hash VARCHAR(255) NOT NULL,
  deck_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rng_audit_game_id ON rng_audit(game_id);
CREATE INDEX idx_rng_audit_created_at ON rng_audit(created_at);
