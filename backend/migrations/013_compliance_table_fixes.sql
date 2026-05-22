-- Migration: 013_compliance_table_fixes
-- Created at: 2026-05-22
-- Purpose:
--   * Add rate_limit_violations — written by the deposit compliance flow in
--     securityRoutes.js but never created by an earlier migration (TODO B5).
--   * Drop deposits_withdrawals — a typo-duplicate of deposit_withdrawals
--     created in migration 012. The deposit route now writes to
--     deposit_withdrawals (TODO A3).

BEGIN;

CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  violation_type VARCHAR(100) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_user_id ON rate_limit_violations(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_created_at ON rate_limit_violations(created_at);

DROP TABLE IF EXISTS deposits_withdrawals;

COMMIT;
