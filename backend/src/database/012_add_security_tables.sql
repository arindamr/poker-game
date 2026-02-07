-- Migration 012: Add 2FA and security columns
-- Timestamp: 2026-01-25

BEGIN;

-- Add 2FA columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_secret VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_pending BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS backup_codes_hash TEXT;

-- Create 2FA audit log table
CREATE TABLE IF NOT EXISTS two_fa_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- 'enabled', 'disabled', 'verified', 'failed_attempt'
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_two_fa_audit_user ON two_fa_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_two_fa_audit_created ON two_fa_audit(created_at);

-- Add security columns to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(255);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_suspicious BOOLEAN DEFAULT false;

-- Create cheat detection table
CREATE TABLE IF NOT EXISTS cheat_detection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,
  detection_type VARCHAR(50) NOT NULL, -- 'real_time_action', 'multi_account', 'collusion', 'shuffle_anomaly'
  risk_level VARCHAR(20) NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH', 'CONFIRMED'
  score FLOAT NOT NULL,
  details JSONB,
  action_taken VARCHAR(50), -- 'flagged', 'warned', 'suspended', 'banned'
  manual_review_required BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cheat_user ON cheat_detection(user_id);
CREATE INDEX IF NOT EXISTS idx_cheat_game ON cheat_detection(game_id);
CREATE INDEX IF NOT EXISTS idx_cheat_risk ON cheat_detection(risk_level);
CREATE INDEX IF NOT EXISTS idx_cheat_created ON cheat_detection(created_at);

-- Create rate limiting violation table
CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ip_address INET,
  endpoint VARCHAR(255) NOT NULL,
  violation_count INT DEFAULT 1,
  reason TEXT,
  action_taken VARCHAR(50), -- 'cooldown', 'temporary_ban', 'permanent_ban'
  cooldown_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_user ON rate_limit_violations(user_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_ip ON rate_limit_violations(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limit_created ON rate_limit_violations(created_at);

-- Create compliance audit table
CREATE TABLE IF NOT EXISTS compliance_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audit_type VARCHAR(50) NOT NULL, -- 'kyc', 'aml', 'account_limit'
  status VARCHAR(50) NOT NULL, -- 'pending', 'verified', 'rejected', 'flagged'
  details JSONB,
  reviewer_notes TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_compliance_user ON compliance_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_type ON compliance_audit(audit_type);
CREATE INDEX IF NOT EXISTS idx_compliance_status ON compliance_audit(status);

-- Add account restriction columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_until TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason VARCHAR(255);

-- Add deposit limits
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_deposit_limit DECIMAL(10, 2) DEFAULT 5000;
ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_deposit_limit DECIMAL(10, 2) DEFAULT 10000;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_deposit_limit DECIMAL(10, 2) DEFAULT 20000;
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_deposit_used DECIMAL(10, 2) DEFAULT 0;

-- Add transaction verification
CREATE TABLE IF NOT EXISTS deposit_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL, -- 'deposit' or 'withdrawal'
  amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'reversed'
  payment_method VARCHAR(50),
  verification_code VARCHAR(100),
  verified BOOLEAN DEFAULT false,
  ip_address INET,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON deposit_withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON deposit_withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON deposit_withdrawals(created_at);

COMMIT;
