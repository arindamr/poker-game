-- Migration: 012_add_phase5_security_columns
-- Purpose: Bring existing local schemas in sync with Phase 5 code paths.

BEGIN;

-- Users table additions required by game/compliance/2FA routes.
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_secret VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_pending BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS backup_codes_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_until TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_deposit_limit DECIMAL(10, 2) DEFAULT 5000;
ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_deposit_limit DECIMAL(10, 2) DEFAULT 10000;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_deposit_limit DECIMAL(10, 2) DEFAULT 20000;
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_deposit_used DECIMAL(10, 2) DEFAULT 0;

-- 2FA audit table used by /api/security/2fa routes.
CREATE TABLE IF NOT EXISTS two_fa_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE two_fa_audit ADD COLUMN IF NOT EXISTS event_type VARCHAR(50);
ALTER TABLE two_fa_audit ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE two_fa_audit ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE two_fa_audit ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT true;
ALTER TABLE two_fa_audit ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- Extend existing cheat_detection table for current inserts/queries.
ALTER TABLE cheat_detection ADD COLUMN IF NOT EXISTS game_id UUID;
ALTER TABLE cheat_detection ADD COLUMN IF NOT EXISTS suspicion_type VARCHAR(100);
ALTER TABLE cheat_detection ADD COLUMN IF NOT EXISTS risk_score FLOAT;
ALTER TABLE cheat_detection ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20);
ALTER TABLE cheat_detection ADD COLUMN IF NOT EXISTS score FLOAT;
ALTER TABLE cheat_detection ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- Compliance audit table used by KYC/AML flow.
CREATE TABLE IF NOT EXISTS compliance_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audit_type VARCHAR(50) NOT NULL,
  verification_type VARCHAR(50),
  status VARCHAR(50) NOT NULL,
  details JSONB,
  reviewer_notes TEXT,
  manual_review_required BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP
);

ALTER TABLE compliance_audit ADD COLUMN IF NOT EXISTS audit_type VARCHAR(50);
ALTER TABLE compliance_audit ADD COLUMN IF NOT EXISTS verification_type VARCHAR(50);
ALTER TABLE compliance_audit ADD COLUMN IF NOT EXISTS details JSONB;
ALTER TABLE compliance_audit ADD COLUMN IF NOT EXISTS reviewer_notes TEXT;
ALTER TABLE compliance_audit ADD COLUMN IF NOT EXISTS manual_review_required BOOLEAN DEFAULT false;
ALTER TABLE compliance_audit ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE compliance_audit ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE compliance_audit ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

-- Align game_tables with Phase 5 API routes while remaining compatible with legacy schema.
ALTER TABLE game_tables ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES users(id);
ALTER TABLE game_tables ADD COLUMN IF NOT EXISTS blinds JSONB;
ALTER TABLE game_tables ADD COLUMN IF NOT EXISTS buy_in DECIMAL(10, 4);
ALTER TABLE game_tables ADD COLUMN IF NOT EXISTS max_players INT;
ALTER TABLE game_tables ALTER COLUMN name SET DEFAULT 'Poker Table';
ALTER TABLE game_tables ALTER COLUMN small_blind SET DEFAULT 1;
ALTER TABLE game_tables ALTER COLUMN big_blind SET DEFAULT 2;
ALTER TABLE game_tables ALTER COLUMN min_buy_in SET DEFAULT 1;
ALTER TABLE game_tables ALTER COLUMN max_buy_in SET DEFAULT 1000;

-- gameRoutes uses game_players; create compatibility table if missing.
CREATE TABLE IF NOT EXISTS game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES game_tables(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stack DECIMAL(15, 4) NOT NULL DEFAULT 0,
  position INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (game_id, user_id),
  UNIQUE (game_id, position)
);

-- Transaction table used by AML checks.
CREATE TABLE IF NOT EXISTS deposit_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  payment_method VARCHAR(50),
  aml_status VARCHAR(50),
  verification_code VARCHAR(100),
  verified BOOLEAN DEFAULT false,
  ip_address INET,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Route typo compatibility: /financial/deposit writes to deposits_withdrawals.
CREATE TABLE IF NOT EXISTS deposits_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  payment_method VARCHAR(50),
  aml_status VARCHAR(50),
  verification_code VARCHAR(100),
  verified BOOLEAN DEFAULT false,
  ip_address INET,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Responsible gaming endpoint table.
CREATE TABLE IF NOT EXISTS self_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration VARCHAR(20) NOT NULL,
  enabled_at TIMESTAMP DEFAULT NOW(),
  until_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_two_fa_audit_user_id ON two_fa_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_cheat_detection_game_id ON cheat_detection(game_id);
CREATE INDEX IF NOT EXISTS idx_cheat_detection_created_at ON cheat_detection(created_at);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_user_id ON compliance_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_created_at ON compliance_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_deposit_withdrawals_user_id ON deposit_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_withdrawals_user_id ON deposits_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_self_exclusions_user_id ON self_exclusions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_user_id ON game_players(user_id);

COMMIT;
