-- Migration: 011_create_cheat_detection_table
-- Created at: 2026-01-25

CREATE TABLE IF NOT EXISTS cheat_detection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  detection_type VARCHAR(100) NOT NULL,
  severity VARCHAR(50),
  details JSONB,
  flagged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_cheat_detection_user_id ON cheat_detection(user_id);
CREATE INDEX idx_cheat_detection_detection_type ON cheat_detection(detection_type);
CREATE INDEX idx_cheat_detection_severity ON cheat_detection(severity);
CREATE INDEX idx_cheat_detection_resolved ON cheat_detection(resolved);
