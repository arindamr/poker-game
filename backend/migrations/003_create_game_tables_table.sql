-- Migration: 003_create_game_tables_table
-- Created at: 2026-01-25

CREATE TABLE IF NOT EXISTS game_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  small_blind DECIMAL(10,4) NOT NULL,
  big_blind DECIMAL(10,4) NOT NULL,
  min_buy_in DECIMAL(10,4) NOT NULL,
  max_buy_in DECIMAL(10,4) NOT NULL,
  max_seats INT DEFAULT 6,
  current_players INT DEFAULT 0,
  game_type VARCHAR(50) DEFAULT 'CASH',
  status VARCHAR(50) DEFAULT 'WAITING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  CHECK (small_blind > 0),
  CHECK (big_blind > small_blind),
  CHECK (min_buy_in > 0),
  CHECK (max_buy_in >= min_buy_in),
  CHECK (max_seats > 1),
  CHECK (current_players >= 0),
  CHECK (current_players <= max_seats)
);

CREATE INDEX idx_game_tables_status ON game_tables(status);
CREATE INDEX idx_game_tables_created_by ON game_tables(created_by);
CREATE INDEX idx_game_tables_created_at ON game_tables(created_at);
